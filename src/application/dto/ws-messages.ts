import type { Millis } from '@domain/entities/common';
import type { MemberId } from '@domain/entities/member';
import type { SpeciesId } from '@domain/entities/species';
import type { DomainErrorCode } from '@domain/errors';
import type { RankEntry } from '@domain/rules/ranking';
import type { RoomSnapshotDto, CardCountDto } from './responses';

/**
 * Design Ref: §4.3 — WebSocket 프로토콜.
 *
 * 판별자는 `t`. 모든 쓰기 메시지는 **클라이언트가 만든 멱등키**를 동반한다
 * (`id` 또는 `actionId`). 재전송돼도 서버가 같은 건으로 흡수한다.
 *
 * `forMemberId`는 대리 입력일 때만 넣는다. 생략하면 발신자 본인이다.
 * 발신자와 다르면 서버가 방장 여부를 검사하고, 아니면 거부한다 (Plan FR-26).
 */

export interface HelloMessage {
  t: 'hello';
}

export interface CatchMessage {
  t: 'catch';
  /** 멱등키 */
  id: string;
  speciesId: SpeciesId;
  /** 탭한 시각 (클라이언트). 서버가 덮지 않는다 */
  at: Millis;
  forMemberId?: MemberId;
}

export interface UncatchMessage {
  t: 'uncatch';
  actionId: string;
  speciesId: SpeciesId;
  forMemberId?: MemberId;
}

export interface UndoMessage {
  t: 'undo';
  actionId: string;
  /** 되돌릴 +1 이벤트의 id */
  targetId: string;
}

export interface RestoreMessage {
  t: 'restore';
  /** 복원할 −1의 actionId */
  actionId: string;
}

export interface AddSpeciesMessage {
  t: 'addSpecies';
  /** 새 어종을 만들 때 쓸 id (이미 사전에 있으면 무시되고 기존 것이 재사용된다) */
  id: string;
  name: string;
  forMemberId?: MemberId;
}

export interface HideCardMessage {
  t: 'hideCard';
  speciesId: SpeciesId;
  hidden: boolean;
  forMemberId?: MemberId;
}

/** Plan FR-08 — 0마리 카드만 삭제 가능. 기록이 있으면 서버가 거부한다 */
export interface RemoveCardMessage {
  t: 'removeCard';
  speciesId: SpeciesId;
  forMemberId?: MemberId;
}

export interface EndMessage {
  t: 'end';
}

export interface ResumeMessage {
  t: 'resume';
}

export interface AddMemberMessage {
  t: 'addMember';
  id: string;
  name: string;
}

export type ClientMessage =
  | HelloMessage
  | CatchMessage
  | UncatchMessage
  | UndoMessage
  | RestoreMessage
  | AddSpeciesMessage
  | HideCardMessage
  | RemoveCardMessage
  | EndMessage
  | ResumeMessage
  | AddMemberMessage;

export type ClientMessageType = ClientMessage['t'];

/** 멱등키를 가진 메시지 — Outbox에 쌓이는 것들 */
export type WritableClientMessage = Exclude<ClientMessage, HelloMessage>;

// ── 서버 → 클라이언트 ──

export interface SnapshotMessage {
  t: 'snapshot';
  snapshot: RoomSnapshotDto;
  /** 이 연결의 주인. 기기 ID로 매핑되지 않으면 null */
  myMemberId: MemberId | null;
}

export interface UpdateMessage {
  t: 'update';
  ranking: RankEntry[];
  changedCards: CardCountDto[];
  roomStatus: 'active' | 'ended';
  /**
   * 지금 접속 중인 멤버 (Design §5.4 ⑤ 초록 점).
   *
   * 접속 여부는 스냅샷에만 있었는데, 누가 **새로 접속해도** 브로드캐스트가
   * 없어 다른 사람 화면의 점이 갱신되지 않았다. 매 update에 실어 보낸다 —
   * 10명 규모라 배열 하나가 늘어도 비용이 없다.
   */
  onlineMemberIds: MemberId[];
}

export interface AckMessage {
  t: 'ack';
  /** Outbox에서 제거할 키 */
  id: string;
}

/** 대리 입력 대상자에게만 보내는 알림 (Plan FR-23) */
export interface ProxiedMessage {
  t: 'proxied';
  by: string;
  speciesName: string;
  /** +1이면 1, −1이면 -1 */
  delta: 1 | -1;
  /** 대상자가 되돌릴 수 있도록 해당 이벤트 id를 준다 */
  targetId: string;
}

export interface EndedMessage {
  t: 'ended';
  endedAt: Millis;
}

export interface ResumedMessage {
  t: 'resumed';
}

export interface ErrorMessage {
  t: 'error';
  code: DomainErrorCode | 'BAD_MESSAGE';
  message: string;
  /** 어느 요청이 거부됐는지. 클라이언트는 이 키의 pending을 롤백한다 */
  refId: string | null;
}

export type ServerMessage =
  | SnapshotMessage
  | UpdateMessage
  | AckMessage
  | ProxiedMessage
  | EndedMessage
  | ResumedMessage
  | ErrorMessage;

/** 멱등키 추출 — Outbox 키이자 `ack`/`error`의 refId */
export function idempotencyKeyOf(message: ClientMessage): string | null {
  switch (message.t) {
    case 'catch':
    case 'addSpecies':
    case 'addMember':
      return message.id;
    case 'uncatch':
    case 'undo':
    case 'restore':
      return message.actionId;
    case 'hideCard':
      return `hide:${message.forMemberId ?? 'self'}:${message.speciesId}:${String(message.hidden)}`;
    case 'removeCard':
      return `remove:${message.forMemberId ?? 'self'}:${message.speciesId}`;
    case 'end':
      return 'end';
    case 'resume':
      return 'resume';
    case 'hello':
      return null;
  }
}
