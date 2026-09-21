import type { Millis } from '@domain/entities/common';
import type { WritableClientMessage } from '../dto/ws-messages';

export interface OutboxItem {
  /** 멱등키 — 메시지의 `id` 또는 `actionId` */
  key: string;
  /** `hello`는 상태를 바꾸지 않으므로 대기열에 들어가지 않는다 */
  message: WritableClientMessage;
  queuedAt: Millis;
}

/**
 * 미전송 이벤트 대기열 — 클라이언트 전용 (Plan FR-19).
 *
 * Design Ref: §2.2.2 — 낚시터 전파가 끊겨도 탭은 여기 쌓이고,
 * 재연결하면 순서대로 재전송된다. 서버가 `ack`를 보내면 제거한다.
 * 같은 키로 재전송돼도 서버가 멱등 처리하므로 중복이 생기지 않는다.
 */
export interface Outbox {
  enqueue(item: OutboxItem): void;
  pending(): OutboxItem[];
  ack(key: string): void;
  /** `before` 이전에 쌓인 항목 폐기 (방 TTL과 동일하게 7일) */
  prune(before: Millis): OutboxItem[];
  size(): number;
}
