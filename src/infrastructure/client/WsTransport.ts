import type { Millis } from '@domain/entities/common';
import type { ClientMessage, ServerMessage } from '@application/dto/ws-messages';

export type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'offline';

/** 브라우저 WebSocket의 최소 표면. 테스트에서 가짜 소켓을 끼운다 */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

/**
 * OS가 알려주는 네트워크 상태.
 *
 * Design Ref: §5.4 ⑩ — "`navigator.onLine` 복귀 시 즉시 1회 시도".
 *
 * WebSocket이 닫히기만 기다리면 안 된다. 신호가 끊겨도 이미 열린 소켓은
 * TCP 타임아웃까지 **반열림 상태로 남아** 화면에는 "연결됨"으로 보인다.
 * 낚시터에서 이건 가장 위험한 착시다 — 아무것도 전송되지 않는데
 * 사용자는 기록이 되고 있다고 믿는다.
 */
export interface NetworkMonitor {
  isOnline(): boolean;
  /** 상태 변화 구독. 해제 함수를 돌려준다 */
  subscribe(handler: (online: boolean) => void): () => void;
}

export const browserNetworkMonitor: NetworkMonitor = {
  isOnline: () => navigator.onLine,
  subscribe(handler) {
    const onOnline = () => {
      handler(true);
    };
    const onOffline = () => {
      handler(false);
    };
    addEventListener('online', onOnline);
    addEventListener('offline', onOffline);
    return () => {
      removeEventListener('online', onOnline);
      removeEventListener('offline', onOffline);
    };
  },
};

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

export const browserScheduler: Scheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number,
  clearTimeout: (h) => {
    globalThis.clearTimeout(h);
  },
};

export interface WsTransportOptions {
  url: string;
  factory: SocketFactory;
  scheduler?: Scheduler;
  network?: NetworkMonitor;
  now?: () => Millis;
  onMessage: (message: ServerMessage) => void;
  onStatus: (status: ConnectionStatus) => void;
}

/** Plan FR-20 — 지수 백오프, 최대 30초 */
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

/**
 * WebSocket 연결 관리 (Plan FR-20).
 *
 * Design Ref: §5.4 ⑩ — 끊김은 예외 상황이 아니라 **기본 전제**다.
 * 낚시터에서는 계속 끊긴다. 그래서 연결이 끊겨도 에러를 띄우지 않고
 * 상태 알약만 바꾸고 조용히 재시도한다.
 *
 * 전송 실패도 던지지 않는다 — 호출자(roomStore)가 Outbox에 적재해두고
 * 재연결 시 일괄 전송한다.
 */
export class WsTransport {
  private socket: SocketLike | null = null;
  private status: ConnectionStatus = 'idle';
  private attempt = 0;
  private retryHandle: number | null = null;
  private closedByUs = false;

  private readonly scheduler: Scheduler;
  private readonly network: NetworkMonitor | null;
  private readonly now: () => Millis;
  private unsubscribeNetwork: (() => void) | null = null;

  constructor(private readonly options: WsTransportOptions) {
    this.scheduler = options.scheduler ?? browserScheduler;
    this.network = options.network ?? null;
    this.now = options.now ?? (() => Date.now());
  }

  currentStatus(): ConnectionStatus {
    return this.status;
  }

  isOpen(): boolean {
    return this.status === 'online';
  }

  connect(): void {
    if (this.socket !== null) return;
    this.closedByUs = false;
    this.watchNetwork();
    this.open();
  }

  /**
   * OS 네트워크 상태를 구독한다.
   *
   * 끊기면 소켓이 닫히기를 기다리지 않고 **즉시** 오프라인으로 전환한다 —
   * 반열림 소켓 때문에 "연결됨"으로 보이는 착시를 막는다.
   * 복구되면 백오프를 건너뛰고 바로 재연결한다 (Design §5.4 ⑩).
   */
  private watchNetwork(): void {
    if (this.network === null || this.unsubscribeNetwork !== null) return;

    this.unsubscribeNetwork = this.network.subscribe((online) => {
      if (this.closedByUs) return;
      if (online) {
        this.retryNow();
        return;
      }
      this.cancelRetry();
      this.teardown();
      this.setStatus('offline');
    });
  }

  /**
   * 전송 시도. 연결이 없으면 **조용히 false**를 돌려준다.
   * 호출자가 Outbox에 넣어두고 재연결 때 다시 보낸다.
   */
  send(message: ClientMessage): boolean {
    if (this.socket === null || this.status !== 'online') return false;
    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  /** 사용자가 "지금 다시 시도"를 눌렀을 때 (Design §5.4 ⑩ 팝오버) */
  retryNow(): void {
    this.cancelRetry();
    this.attempt = 0;
    this.teardown();
    this.connect();
  }

  close(): void {
    this.closedByUs = true;
    this.cancelRetry();
    this.teardown();
    this.unsubscribeNetwork?.();
    this.unsubscribeNetwork = null;
    this.setStatus('idle');
  }

  private open(): void {
    // 네트워크가 없다고 OS가 알려주면 소켓을 만들 필요가 없다
    if (this.network !== null && !this.network.isOnline()) {
      this.setStatus('offline');
      this.scheduleRetry();
      return;
    }
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');

    let socket: SocketLike;
    try {
      socket = this.options.factory(this.options.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.setStatus('online');
    };

    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      let parsed: ServerMessage;
      try {
        parsed = JSON.parse(event.data) as ServerMessage;
      } catch {
        return; // 깨진 프레임 — 무시한다. 연결을 끊을 이유는 없다
      }
      this.options.onMessage(parsed);
    };

    socket.onerror = () => {
      // onclose가 뒤따르므로 여기서는 재시도를 걸지 않는다 (중복 방지)
    };

    socket.onclose = () => {
      this.socket = null;
      if (this.closedByUs) return;
      this.setStatus('offline');
      this.scheduleRetry();
    };
  }

  private scheduleRetry(): void {
    if (this.retryHandle !== null) return;
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)] ?? 30_000;
    this.attempt += 1;

    this.retryHandle = this.scheduler.setTimeout(() => {
      this.retryHandle = null;
      if (this.closedByUs) return;
      this.open();
    }, delay);
  }

  private cancelRetry(): void {
    if (this.retryHandle === null) return;
    this.scheduler.clearTimeout(this.retryHandle);
    this.retryHandle = null;
  }

  private teardown(): void {
    const socket = this.socket;
    this.socket = null;
    if (socket === null) return;
    socket.onopen = null;
    socket.onclose = null;
    socket.onerror = null;
    socket.onmessage = null;
    try {
      socket.close();
    } catch {
      /* 이미 닫힘 */
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatus(status);
  }

  /** 마지막 상태 변화 시각 — 팝오버의 "N분 전 동기화"에 쓴다 */
  timestamp(): Millis {
    return this.now();
  }
}

export function browserSocketFactory(url: string): SocketLike {
  return new WebSocket(url) as unknown as SocketLike;
}
