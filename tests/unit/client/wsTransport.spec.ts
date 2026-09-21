import { describe, it, expect, vi } from 'vitest';
import type { ConnectionStatus, Scheduler, SocketLike } from '@infrastructure/client/WsTransport';
import { WsTransport } from '@infrastructure/client/WsTransport';
import type { ServerMessage } from '@application/dto/ws-messages';

class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  readonly sent: string[] = [];
  closed = false;

  send(data: string): void {
    if (this.closed) throw new Error('closed');
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }

  open(): void {
    this.onopen?.();
  }
  drop(): void {
    this.closed = true;
    this.onclose?.();
  }
  deliver(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

/** 수동으로 돌리는 타이머 — 백오프를 실시간으로 기다리지 않는다 */
class FakeScheduler implements Scheduler {
  private next = 1;
  readonly pending = new Map<number, { fn: () => void; ms: number }>();

  setTimeout(fn: () => void, ms: number): number {
    const id = this.next++;
    this.pending.set(id, { fn, ms });
    return id;
  }
  clearTimeout(handle: number): void {
    this.pending.delete(handle);
  }
  /** 예약된 것 중 가장 오래된 하나를 실행하고 그 지연값을 돌려준다 */
  fire(): number | null {
    const entry = [...this.pending.entries()][0];
    if (entry === undefined) return null;
    this.pending.delete(entry[0]);
    entry[1].fn();
    return entry[1].ms;
  }
  delays(): number[] {
    return [...this.pending.values()].map((p) => p.ms);
  }
}

function build() {
  const sockets: FakeSocket[] = [];
  const scheduler = new FakeScheduler();
  const statuses: ConnectionStatus[] = [];
  const messages: ServerMessage[] = [];

  const transport = new WsTransport({
    url: 'wss://example/ws',
    factory: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    scheduler,
    onMessage: (m) => messages.push(m),
    onStatus: (s) => statuses.push(s),
  });

  return { transport, sockets, scheduler, statuses, messages };
}

/**
 * Plan FR-20 — 연결 상태와 자동 재연결(지수 백오프, 최대 30초).
 *
 * Design §5.4 ⑩ — 끊김은 예외가 아니라 기본 전제다.
 * 에러를 띄우지 않고 조용히 재시도하는 게 맞는 동작이다.
 */
describe('WsTransport', () => {
  it('연결되면 online 상태가 된다', () => {
    const { transport, sockets, statuses } = build();

    transport.connect();
    expect(statuses).toEqual(['connecting']);

    sockets[0]!.open();

    expect(statuses).toEqual(['connecting', 'online']);
    expect(transport.isOpen()).toBe(true);
  });

  it('끊기면 offline로 바뀌고 재연결을 예약한다', () => {
    const { transport, sockets, scheduler, statuses } = build();
    transport.connect();
    sockets[0]!.open();

    sockets[0]!.drop();

    expect(statuses.at(-1)).toBe('offline');
    expect(scheduler.delays()).toEqual([1_000]);
  });

  it('재시도 간격이 1→2→4→8→16→30초로 늘고 30초에서 멈춘다', () => {
    const { transport, sockets, scheduler } = build();
    transport.connect();
    sockets[0]!.open();

    const observed: number[] = [];
    sockets[0]!.drop();

    for (let i = 0; i < 8; i += 1) {
      const delay = scheduler.fire(); // 예약된 재시도 실행 → 새 소켓 생성
      if (delay !== null) observed.push(delay);
      sockets.at(-1)!.drop(); // 또 실패
    }

    expect(observed).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000]);
  });

  it('재연결에 성공하면 백오프가 초기화된다', () => {
    const { transport, sockets, scheduler } = build();
    transport.connect();
    sockets[0]!.open();

    sockets[0]!.drop();
    scheduler.fire();
    sockets[1]!.drop();
    scheduler.fire();
    sockets[2]!.open(); // 성공

    sockets[2]!.drop();

    expect(scheduler.delays()).toEqual([1_000]); // 다시 1초부터
  });

  it('재연결 중에는 reconnecting 상태를 보여준다', () => {
    const { transport, sockets, scheduler, statuses } = build();
    transport.connect();
    sockets[0]!.open();
    sockets[0]!.drop();

    scheduler.fire();

    expect(statuses.at(-1)).toBe('reconnecting');
  });

  it('연결이 없으면 send가 조용히 false를 돌려준다 (호출자가 Outbox에 넣는다)', () => {
    const { transport, sockets } = build();
    transport.connect();

    // 아직 open 전
    expect(transport.send({ t: 'hello' })).toBe(false);

    sockets[0]!.open();
    expect(transport.send({ t: 'hello' })).toBe(true);
    expect(sockets[0]!.sent).toEqual(['{"t":"hello"}']);
  });

  it('끊긴 뒤 send는 예외를 던지지 않는다', () => {
    const { transport, sockets } = build();
    transport.connect();
    sockets[0]!.open();
    sockets[0]!.drop();

    expect(() => transport.send({ t: 'hello' })).not.toThrow();
    expect(transport.send({ t: 'hello' })).toBe(false);
  });

  it('수신 메시지를 파싱해 전달한다', () => {
    const { transport, sockets, messages } = build();
    transport.connect();
    sockets[0]!.open();

    sockets[0]!.deliver({ t: 'ack', id: 'evt-1' });

    expect(messages).toEqual([{ t: 'ack', id: 'evt-1' }]);
  });

  it('깨진 프레임은 무시하고 연결을 유지한다', () => {
    const { transport, sockets, messages } = build();
    transport.connect();
    sockets[0]!.open();

    sockets[0]!.onmessage?.({ data: '{깨짐' });
    sockets[0]!.onmessage?.({ data: 12345 });

    expect(messages).toEqual([]);
    expect(transport.isOpen()).toBe(true);
  });

  it('"지금 다시 시도"는 백오프를 건너뛰고 즉시 연결한다', () => {
    const { transport, sockets, scheduler } = build();
    transport.connect();
    sockets[0]!.open();
    sockets[0]!.drop();
    scheduler.fire();
    sockets[1]!.drop(); // 백오프가 2초까지 올라간 상태

    transport.retryNow();

    expect(sockets).toHaveLength(3); // 기다리지 않고 바로 새 소켓
    sockets[2]!.drop();
    expect(scheduler.delays()).toEqual([1_000]); // 백오프도 초기화
  });

  it('close 이후에는 재연결하지 않는다', () => {
    const { transport, sockets, scheduler } = build();
    transport.connect();
    sockets[0]!.open();

    transport.close();

    expect(scheduler.delays()).toEqual([]);
    expect(transport.currentStatus()).toBe('idle');
  });

  it('소켓 생성 자체가 실패해도 재시도를 건다', () => {
    const scheduler = new FakeScheduler();
    const factory = vi.fn(() => {
      throw new Error('blocked');
    });
    const transport = new WsTransport({
      url: 'wss://example/ws',
      factory,
      scheduler,
      onMessage: () => undefined,
      onStatus: () => undefined,
    });

    transport.connect();

    expect(scheduler.delays()).toEqual([1_000]);
  });
});
