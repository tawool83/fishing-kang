import type { Millis } from '../entities/common';
import type { MemberId } from '../entities/member';
import type { CatchEvent } from '../entities/catch-event';

/** Plan FR-10 — +1은 10초 간격. 사람 단위, 어종 무관 */
export const COOLDOWN_MS = 10_000;

/**
 * 쿨다운 기준 = 해당 멤버의 **취소되지 않은** 가장 최근 +1의 caughtAt.
 *
 * Plan FR-13 — 이 정의 하나로 "쿨다운 해제"가 자연히 풀린다.
 * 광어를 눌러야 하는데 우럭을 눌렀다 → 되돌리기 → 그 건이 voided 되므로
 * 기준이 그 이전 유효 건으로 돌아가고, 광어를 즉시 누를 수 있다.
 * 별도의 해제 로직이 필요 없다.
 */
export function cooldownBaseline(
  events: readonly CatchEvent[],
  memberId: MemberId
): Millis | null {
  let latest: Millis | null = null;
  for (const e of events) {
    if (e.memberId !== memberId) continue;
    if (e.voidedAt !== null) continue; // 취소된 건은 기준에서 제외
    if (latest === null || e.caughtAt > latest) latest = e.caughtAt;
  }
  return latest;
}

/** 남은 쿨다운(ms). 0이면 지금 누를 수 있다 */
export function cooldownRemainingMs(
  events: readonly CatchEvent[],
  memberId: MemberId,
  now: Millis,
  cooldownMs: number = COOLDOWN_MS
): number {
  const base = cooldownBaseline(events, memberId);
  if (base === null) return 0;
  return Math.max(0, base + cooldownMs - now);
}

/**
 * Plan FR-10, FR-22 — 쿨다운 대상은 **조과의 주인**(memberId)이다.
 *
 * 방장이 철수 대신 +1을 누르면 철수의 쿨다운이 걸린다. 방장 본인 쿨다운과는 별개다.
 * 효과: 방장이 대신 누른 직후 철수가 모르고 또 누르는 중복 입력을 쿨다운이 막아준다.
 */
export function canRecordCatch(
  events: readonly CatchEvent[],
  memberId: MemberId,
  now: Millis,
  cooldownMs: number = COOLDOWN_MS
): boolean {
  return cooldownRemainingMs(events, memberId, now, cooldownMs) === 0;
}

/** UI 원형 게이지용 진행률 0~1 (1 = 쿨다운 끝) */
export function cooldownProgress(
  events: readonly CatchEvent[],
  memberId: MemberId,
  now: Millis,
  cooldownMs: number = COOLDOWN_MS
): number {
  if (cooldownMs <= 0) return 1;
  const remaining = cooldownRemainingMs(events, memberId, now, cooldownMs);
  return 1 - remaining / cooldownMs;
}
