import type { Millis } from './common';
import type { MemberId } from './member';
import type { SpeciesId } from './species';

/**
 * 조과 이벤트 — +1 한 번이 1행이다.
 *
 * Design Ref: §1.2 — 카운터 컬럼이 아니라 이벤트 로그인 이유:
 *  1. 오프라인 대기열이 재전송돼도 `id`(클라이언트 생성 UUID)로 중복이 걸러진다
 *  2. −1을 "삭제"가 아니라 "voided 마킹"으로 처리하면 시간대별 통계가 정확해진다
 *     (몇 시에 잡은 게 취소됐는지 남는다)
 *  3. 카운트는 전부 `voidedAt === null` 필터로 파생한다
 */
export interface CatchEvent {
  /** 클라이언트가 만든 UUID = 멱등키. 재전송돼도 같은 id면 한 건이다 (Plan FR-19) */
  id: string;
  /** 조과의 주인. 방장이 대리 입력해도 여기는 대상자다 (Plan FR-22) */
  memberId: MemberId;
  speciesId: SpeciesId;
  /**
   * 탭한 시각 (클라이언트 기준).
   *
   * Design Ref: §2.2.2 — 오프라인 재전송 시에도 이 값을 서버 수신 시각으로 덮지 않는다.
   * 시간대별 통계가 "실제로 잡은 시각"을 반영해야 하기 때문이다.
   */
  caughtAt: Millis;
  /** 서버 수신 시각. 기기 시각 차이 보정에 쓸 수 있다 (P2) */
  receivedAt: Millis;
  /** null이면 유효한 조과 */
  voidedAt: Millis | null;
  /** −1 요청의 멱등키 */
  voidActionId: string | null;
  /** 실제로 입력한 사람 — 본인 또는 방장 (Plan FR-25) */
  enteredBy: MemberId;
  voidedBy: MemberId | null;
}

/** 유효한(취소되지 않은) 조과인가 */
export function isActive(event: CatchEvent): boolean {
  return event.voidedAt === null;
}
