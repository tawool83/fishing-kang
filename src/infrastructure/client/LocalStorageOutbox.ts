import type { Millis } from '@domain/entities/common';
import type { Outbox, OutboxItem } from '@application/ports/Outbox';
import type { SyncKeyValue } from './storage';

const KEY_PREFIX = 'gt.outbox.';

/** 방 TTL과 같은 7일 (Plan FR-30) */
export const OUTBOX_TTL_MS = 7 * 86_400_000;

/**
 * 미전송 이벤트 대기열 (Plan FR-19).
 *
 * Design Ref: §2.2.2 — 낚시터에서 소켓이 끊긴 사이 탭한 게 증발하면
 * 서비스 신뢰가 바로 무너진다. 그래서 전송이 아니라 **적재가 먼저**다.
 *
 * 매 변경마다 통째로 직렬화한다. 한 출조에서 쌓이는 건 많아야 수백 건이고,
 * 부분 갱신을 하려다 일관성을 깨뜨리는 것보다 낫다.
 *
 * 저장소가 막혀 있어도(시크릿 모드 등) 메모리 큐로는 계속 동작한다 —
 * 그 경우 새로고침하면 잃지만, 아무것도 못 하는 것보다 낫다.
 */
export class LocalStorageOutbox implements Outbox {
  private readonly key: string;
  private items: OutboxItem[];

  constructor(
    private readonly storage: SyncKeyValue,
    roomCode: string
  ) {
    this.key = KEY_PREFIX + roomCode;
    this.items = this.load();
  }

  enqueue(item: OutboxItem): void {
    // 같은 멱등키가 이미 있으면 덮어쓴다 (재시도 중 같은 동작이 다시 들어온 경우)
    const index = this.items.findIndex((i) => i.key === item.key);
    if (index >= 0) this.items[index] = item;
    else this.items.push(item);
    this.persist();
  }

  pending(): OutboxItem[] {
    // 적재 순서를 유지한다 — 서버가 같은 순서로 처리해야 결과가 같다
    return this.items.map((i) => ({ ...i }));
  }

  ack(key: string): void {
    const next = this.items.filter((i) => i.key !== key);
    if (next.length === this.items.length) return;
    this.items = next;
    this.persist();
  }

  prune(before: Millis): OutboxItem[] {
    const dropped = this.items.filter((i) => i.queuedAt < before);
    if (dropped.length === 0) return [];
    this.items = this.items.filter((i) => i.queuedAt >= before);
    this.persist();
    return dropped;
  }

  size(): number {
    return this.items.length;
  }

  private load(): OutboxItem[] {
    const raw = this.storage.get(this.key);
    if (raw === null) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isOutboxItem);
    } catch {
      // 깨진 데이터 — 버린다. 여기서 throw하면 앱이 아예 안 뜬다
      return [];
    }
  }

  private persist(): void {
    try {
      this.storage.set(this.key, JSON.stringify(this.items));
    } catch {
      /* 저장 실패 — 메모리 큐로는 계속 동작한다 */
    }
  }
}

function isOutboxItem(value: unknown): value is OutboxItem {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Partial<OutboxItem>;
  return (
    typeof v.key === 'string' &&
    typeof v.queuedAt === 'number' &&
    v.message !== undefined &&
    typeof v.message === 'object' &&
    typeof (v.message as { t?: unknown }).t === 'string'
  );
}
