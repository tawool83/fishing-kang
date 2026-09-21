import { describe, it, expect } from 'vitest';
import { LocalStorageOutbox, OUTBOX_TTL_MS } from '@infrastructure/client/LocalStorageOutbox';
import { MemoryKeyValue, NullKeyValue } from '@infrastructure/client/storage';
import type { OutboxItem } from '@application/ports/Outbox';
import { T0, sec } from '@tests/unit/helpers/fixtures';

function item(key: string, at = T0): OutboxItem {
  return {
    key,
    queuedAt: at,
    message: { t: 'catch', id: key, speciesId: 'sp-1', at },
  };
}

/**
 * Plan FR-19 — 오프라인 대기열.
 * Plan 최우선 리스크("탭이 증발하면 신뢰가 무너진다")의 직접 대응이다.
 */
describe('LocalStorageOutbox', () => {
  it('적재 순서를 유지한다 — 서버가 같은 순서로 처리해야 결과가 같다', () => {
    const outbox = new LocalStorageOutbox(new MemoryKeyValue(), 'K7QM4X');

    outbox.enqueue(item('e1', T0));
    outbox.enqueue(item('e2', T0 + sec(5)));
    outbox.enqueue(item('e3', T0 + sec(9)));

    expect(outbox.pending().map((i) => i.key)).toEqual(['e1', 'e2', 'e3']);
    expect(outbox.size()).toBe(3);
  });

  it('ack된 항목만 제거한다', () => {
    const outbox = new LocalStorageOutbox(new MemoryKeyValue(), 'K7QM4X');
    outbox.enqueue(item('e1'));
    outbox.enqueue(item('e2'));

    outbox.ack('e1');

    expect(outbox.pending().map((i) => i.key)).toEqual(['e2']);
  });

  it('모르는 키를 ack해도 아무 일도 없다', () => {
    const outbox = new LocalStorageOutbox(new MemoryKeyValue(), 'K7QM4X');
    outbox.enqueue(item('e1'));

    outbox.ack('없는키');

    expect(outbox.size()).toBe(1);
  });

  it('같은 멱등키로 다시 넣으면 덮어쓴다 (중복 적재 방지)', () => {
    const outbox = new LocalStorageOutbox(new MemoryKeyValue(), 'K7QM4X');
    outbox.enqueue(item('e1', T0));
    outbox.enqueue(item('e1', T0 + sec(30)));

    expect(outbox.size()).toBe(1);
    expect(outbox.pending()[0]?.queuedAt).toBe(T0 + sec(30));
  });

  it('새로고침해도 대기열이 살아남는다', () => {
    const storage = new MemoryKeyValue();
    const first = new LocalStorageOutbox(storage, 'K7QM4X');
    first.enqueue(item('e1'));
    first.enqueue(item('e2'));

    // 새 인스턴스 = 페이지 새로고침
    const restored = new LocalStorageOutbox(storage, 'K7QM4X');

    expect(restored.pending().map((i) => i.key)).toEqual(['e1', 'e2']);
  });

  it('방마다 대기열이 분리된다', () => {
    const storage = new MemoryKeyValue();
    new LocalStorageOutbox(storage, 'AAAAAA').enqueue(item('e1'));

    expect(new LocalStorageOutbox(storage, 'BBBBBB').size()).toBe(0);
  });

  it('7일이 지난 항목은 폐기한다 (방 TTL과 동일)', () => {
    const outbox = new LocalStorageOutbox(new MemoryKeyValue(), 'K7QM4X');
    outbox.enqueue(item('old', T0));
    outbox.enqueue(item('new', T0 + OUTBOX_TTL_MS));

    const dropped = outbox.prune(T0 + OUTBOX_TTL_MS);

    expect(dropped.map((i) => i.key)).toEqual(['old']);
    expect(outbox.pending().map((i) => i.key)).toEqual(['new']);
  });

  it('깨진 저장 데이터는 앱을 멈추지 않고 버린다', () => {
    const storage = new MemoryKeyValue();
    storage.set('gt.outbox.K7QM4X', '{이건 JSON이 아님');

    const outbox = new LocalStorageOutbox(storage, 'K7QM4X');

    expect(outbox.size()).toBe(0);
  });

  it('형태가 맞지 않는 항목은 걸러낸다', () => {
    const storage = new MemoryKeyValue();
    storage.set(
      'gt.outbox.K7QM4X',
      JSON.stringify([{ key: 'ok', queuedAt: T0, message: { t: 'catch' } }, { nope: true }, null])
    );

    const outbox = new LocalStorageOutbox(storage, 'K7QM4X');

    expect(outbox.pending().map((i) => i.key)).toEqual(['ok']);
  });

  it('저장소가 막혀 있어도 메모리 큐로는 동작한다 (시크릿 모드)', () => {
    const outbox = new LocalStorageOutbox(new NullKeyValue(), 'K7QM4X');

    outbox.enqueue(item('e1'));

    expect(outbox.size()).toBe(1); // 새로고침하면 잃지만, 세션 중에는 동작한다
  });
});
