import type { MemberId } from '../entities/member';
import type { SpeciesId } from '../entities/species';
import type { CatchEvent } from '../entities/catch-event';
import { isActive } from '../entities/catch-event';

/**
 * −1 대상: 해당 멤버·어종의 유효 건 중 가장 최근 1건.
 *
 * Design Ref: §3.4 — `caughtAt` 동률일 때 `id` 사전순 **내림차순**으로 tie-break 한다.
 *
 * 왜 결정적 tie-break가 필요한가:
 * `caughtAt`은 ms 단위라 대리 입력이나 오프라인 일괄 전송에서 충돌할 수 있다.
 * 클라이언트의 낙관적 예측과 DO의 서버 확정이 **같은 행**을 골라야
 * 화면이 튀지 않는다. 그래서 순서를 완전히 결정적으로 고정한다.
 */
export function pickVoidTarget(
  events: readonly CatchEvent[],
  memberId: MemberId,
  speciesId: SpeciesId
): CatchEvent | null {
  let best: CatchEvent | null = null;
  for (const e of events) {
    if (e.memberId !== memberId) continue;
    if (e.speciesId !== speciesId) continue;
    if (!isActive(e)) continue;
    if (best === null || isLaterThan(e, best)) best = e;
  }
  return best;
}

function isLaterThan(a: CatchEvent, b: CatchEvent): boolean {
  if (a.caughtAt !== b.caughtAt) return a.caughtAt > b.caughtAt;
  return a.id > b.id; // 결정적 tie-break
}

/**
 * 유효 마릿수. speciesId를 주면 그 어종만, 생략하면 어종 무관 총합.
 *
 * Design Ref: §1.2 — 카운트는 전부 여기서 파생한다. 카운터 컬럼을 두지 않는다.
 */
export function countActive(
  events: readonly CatchEvent[],
  memberId: MemberId,
  speciesId?: SpeciesId
): number {
  let n = 0;
  for (const e of events) {
    if (e.memberId !== memberId) continue;
    if (speciesId !== undefined && e.speciesId !== speciesId) continue;
    if (!isActive(e)) continue;
    n += 1;
  }
  return n;
}

/** 방 전체 유효 조과 수 */
export function countActiveTotal(events: readonly CatchEvent[]): number {
  let n = 0;
  for (const e of events) if (isActive(e)) n += 1;
  return n;
}

export function findById(events: readonly CatchEvent[], id: string): CatchEvent | null {
  return events.find((e) => e.id === id) ?? null;
}

export function findByVoidActionId(
  events: readonly CatchEvent[],
  actionId: string
): CatchEvent | null {
  return events.find((e) => e.voidActionId === actionId) ?? null;
}

/** 유효 조과를 caughtAt 오름차순(동률은 id 오름차순)으로 정렬해 돌려준다 */
export function activeSortedByTime(events: readonly CatchEvent[]): CatchEvent[] {
  return events
    .filter(isActive)
    .slice()
    .sort((a, b) => (a.caughtAt !== b.caughtAt ? a.caughtAt - b.caughtAt : a.id < b.id ? -1 : 1));
}
