import type { Millis } from '../entities/common';
import { HALF_HOUR_MS } from '../entities/common';
import type { MemberId } from '../entities/member';
import type { SpeciesId } from '../entities/species';
import type { CatchEvent } from '../entities/catch-event';
import { activeSortedByTime } from '../rules/catchLog';
import { timeBuckets } from './aggregate';

export interface CatchMoment {
  memberId: MemberId;
  speciesId: SpeciesId;
  at: Millis;
}

export interface PeakBucket {
  bucketStart: Millis;
  total: number;
}

export interface ShortestGap {
  memberId: MemberId;
  gapMs: number;
  at: Millis;
}

export interface Highlights {
  /** 🎯 첫 수 */
  firstCatch: CatchMoment | null;
  /** 🏁 마지막 수 */
  lastCatch: CatchMoment | null;
  /** 🔥 가장 많이 잡힌 30분 */
  peakBucket: PeakBucket | null;
  /** 🐟 최다 어종 */
  topSpecies: { speciesId: SpeciesId; total: number } | null;
  /** 🌈 가장 다양한 어종을 잡은 사람 */
  mostDiverseMember: { memberId: MemberId; speciesCount: number } | null;
  /** ⚡ 최단 간격 연속 조과 (같은 사람의 연속 두 건 사이) */
  shortestGap: ShortestGap | null;
  /** 🔄 1위가 바뀐 횟수 */
  leadChanges: number;
}

export function highlights(
  events: readonly CatchEvent[],
  bucketMs: number = HALF_HOUR_MS
): Highlights {
  const active = activeSortedByTime(events);

  return {
    firstCatch: toMoment(active[0]),
    lastCatch: toMoment(active[active.length - 1]),
    peakBucket: findPeak(events, bucketMs),
    topSpecies: findTopSpecies(active),
    mostDiverseMember: findMostDiverse(active),
    shortestGap: findShortestGap(active),
    leadChanges: countLeadChanges(active),
  };
}

function toMoment(e: CatchEvent | undefined): CatchMoment | null {
  if (e === undefined) return null;
  return { memberId: e.memberId, speciesId: e.speciesId, at: e.caughtAt };
}

function findPeak(events: readonly CatchEvent[], bucketMs: number): PeakBucket | null {
  const buckets = timeBuckets(events, bucketMs);
  let best: PeakBucket | null = null;
  for (const b of buckets) {
    if (b.total === 0) continue;
    // 동률이면 먼저 온 버킷 — "그날 처음 터진 타이밍"이 이야깃거리다
    if (best === null || b.total > best.total) best = { bucketStart: b.bucketStart, total: b.total };
  }
  return best;
}

function findTopSpecies(active: readonly CatchEvent[]): { speciesId: SpeciesId; total: number } | null {
  const counts = new Map<SpeciesId, number>();
  for (const e of active) counts.set(e.speciesId, (counts.get(e.speciesId) ?? 0) + 1);

  let best: { speciesId: SpeciesId; total: number } | null = null;
  for (const [speciesId, total] of counts) {
    if (best === null || total > best.total || (total === best.total && speciesId < best.speciesId)) {
      best = { speciesId, total };
    }
  }
  return best;
}

function findMostDiverse(
  active: readonly CatchEvent[]
): { memberId: MemberId; speciesCount: number } | null {
  const kinds = new Map<MemberId, Set<SpeciesId>>();
  for (const e of active) {
    let set = kinds.get(e.memberId);
    if (set === undefined) {
      set = new Set();
      kinds.set(e.memberId, set);
    }
    set.add(e.speciesId);
  }

  let best: { memberId: MemberId; speciesCount: number } | null = null;
  for (const [memberId, set] of kinds) {
    const speciesCount = set.size;
    if (
      best === null ||
      speciesCount > best.speciesCount ||
      (speciesCount === best.speciesCount && memberId < best.memberId)
    ) {
      best = { memberId, speciesCount };
    }
  }
  return best;
}

/**
 * 같은 사람의 연속 두 조과 사이 최단 간격.
 *
 * 쿨다운이 10초이므로 정상 입력이면 결과는 10초 이상이다.
 * 오프라인 대기열이 몰려 들어온 경우 그보다 짧을 수도 있는데,
 * 그것도 "실제로 그 간격으로 잡았다"는 뜻이므로 그대로 보여준다.
 */
function findShortestGap(active: readonly CatchEvent[]): ShortestGap | null {
  const lastByMember = new Map<MemberId, Millis>();
  let best: ShortestGap | null = null;

  for (const e of active) {
    const prev = lastByMember.get(e.memberId);
    if (prev !== undefined) {
      const gapMs = e.caughtAt - prev;
      if (best === null || gapMs < best.gapMs) {
        best = { memberId: e.memberId, gapMs, at: e.caughtAt };
      }
    }
    lastByMember.set(e.memberId, e.caughtAt);
  }
  return best;
}

/**
 * 1위가 바뀐 횟수 — "역전 드라마" 지표.
 *
 * 조과를 시간순으로 재생하면서 **단독 1위의 주인이 바뀔 때만** 센다.
 *
 * 왜 단독 1위 기준인가:
 * 실제 경기에서 1위 교체는 언제나 동점을 거쳐 일어난다(1:1 → 1:2).
 * "선두 집합이 겹치지 않을 때"를 세면 그 중간 단계 때문에 역전이 한 번도
 * 잡히지 않는다. 공동 1위 구간은 아직 역전이 확정되지 않은 상태로 보고,
 * 누군가 단독으로 치고 나간 순간에 1회로 센다.
 */
function countLeadChanges(active: readonly CatchEvent[]): number {
  const totals = new Map<MemberId, number>();
  let soleLeader: MemberId | null = null;
  let changes = 0;

  for (const e of active) {
    totals.set(e.memberId, (totals.get(e.memberId) ?? 0) + 1);

    let max = 0;
    for (const v of totals.values()) if (v > max) max = v;

    const leaders: MemberId[] = [];
    for (const [id, v] of totals) if (v === max && max > 0) leaders.push(id);

    if (leaders.length !== 1) continue; // 공동 1위 구간은 판정 보류
    const next = leaders[0]!;

    if (soleLeader !== null && soleLeader !== next) changes += 1;
    soleLeader = next;
  }
  return changes;
}
