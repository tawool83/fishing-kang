import type { Millis } from '../entities/common';
import { HALF_HOUR_MS } from '../entities/common';
import type { Member, MemberId } from '../entities/member';
import type { Species, SpeciesId } from '../entities/species';
import type { CatchEvent } from '../entities/catch-event';
import type { Room } from '../entities/room';
import { activeSortedByTime, countActive, countActiveTotal } from '../rules/catchLog';

export interface StatsSummary {
  totalCatch: number;
  memberCount: number;
  /** 실제로 잡힌 어종 수 (카드만 만들고 0마리인 어종은 세지 않는다) */
  speciesCount: number;
  /** 첫 입력 ~ 종료(진행 중이면 마지막 입력)까지. 조과가 없으면 0 */
  durationMs: number;
  firstCaughtAt: Millis | null;
  lastCaughtAt: Millis | null;
}

export interface CountBy<TId> {
  id: TId;
  name: string;
  total: number;
}

export interface TimeBucket {
  bucketStart: Millis;
  total: number;
  /** memberId → 그 버킷의 마릿수 */
  byMember: Record<MemberId, number>;
}

export interface CumulativePoint {
  at: Millis;
  /** memberId → 그 시점까지의 누적 마릿수 */
  byMember: Record<MemberId, number>;
}

export interface SpeciesMatrix {
  memberIds: MemberId[];
  speciesIds: SpeciesId[];
  /** rows[memberIndex][speciesIndex] */
  rows: number[][];
}

export function summarize(
  room: Room,
  members: readonly Member[],
  events: readonly CatchEvent[]
): StatsSummary {
  const active = activeSortedByTime(events);
  const first = active[0]?.caughtAt ?? null;
  const last = active[active.length - 1]?.caughtAt ?? null;

  const species = new Set<SpeciesId>();
  for (const e of active) species.add(e.speciesId);

  // 종료된 방은 종료 시각까지, 진행 중이면 마지막 조과까지
  const end = room.endedAt ?? last;
  const durationMs = first !== null && end !== null ? Math.max(0, end - first) : 0;

  return {
    totalCatch: countActiveTotal(events),
    memberCount: members.length,
    speciesCount: species.size,
    durationMs,
    firstCaughtAt: first,
    lastCaughtAt: last,
  };
}

/** 사람별 조과 — 많은 순 (Design §5.4 ⑥ 가로 막대) */
export function perMember(
  members: readonly Member[],
  events: readonly CatchEvent[]
): CountBy<MemberId>[] {
  return members
    .map((m) => ({ id: m.id, name: m.displayName, total: countActive(events, m.id) }))
    .sort((a, b) => (a.total !== b.total ? b.total - a.total : a.name < b.name ? -1 : 1));
}

/** 어종별 조과 — 많은 순 */
export function perSpecies(
  species: readonly Species[],
  events: readonly CatchEvent[]
): CountBy<SpeciesId>[] {
  const counts = new Map<SpeciesId, number>();
  for (const e of events) {
    if (e.voidedAt !== null) continue;
    counts.set(e.speciesId, (counts.get(e.speciesId) ?? 0) + 1);
  }
  return species
    .map((s) => ({ id: s.id, name: s.name, total: counts.get(s.id) ?? 0 }))
    .sort((a, b) => (a.total !== b.total ? b.total - a.total : a.name < b.name ? -1 : 1));
}

/** 사람 × 어종 매트릭스 (Design §5.4 ⑥ 셀 색 농도) */
export function memberBySpeciesMatrix(
  members: readonly Member[],
  species: readonly Species[],
  events: readonly CatchEvent[]
): SpeciesMatrix {
  const memberIds = members.map((m) => m.id);
  const speciesIds = species.map((s) => s.id);
  const mi = new Map(memberIds.map((id, i) => [id, i]));
  const si = new Map(speciesIds.map((id, i) => [id, i]));

  const rows: number[][] = memberIds.map(() => speciesIds.map(() => 0));
  for (const e of events) {
    if (e.voidedAt !== null) continue;
    const r = mi.get(e.memberId);
    const c = si.get(e.speciesId);
    if (r === undefined || c === undefined) continue;
    const row = rows[r];
    if (row === undefined) continue;
    row[c] = (row[c] ?? 0) + 1;
  }
  return { memberIds, speciesIds, rows };
}

/**
 * 시간대별 조과 — 기본 30분 버킷 (Plan FR-27).
 *
 * 버킷 경계는 epoch 기준 `floor(caughtAt / bucketMs) * bucketMs`.
 * 조과가 하나도 없으면 빈 배열이다. 중간에 빈 버킷은 0으로 채워
 * 막대 그래프에 구멍이 생기지 않게 한다.
 */
export function timeBuckets(
  events: readonly CatchEvent[],
  bucketMs: number = HALF_HOUR_MS
): TimeBucket[] {
  const active = activeSortedByTime(events);
  if (active.length === 0 || bucketMs <= 0) return [];

  const startOf = (t: Millis) => Math.floor(t / bucketMs) * bucketMs;
  const first = startOf(active[0]!.caughtAt);
  const last = startOf(active[active.length - 1]!.caughtAt);

  const buckets = new Map<Millis, TimeBucket>();
  for (let b = first; b <= last; b += bucketMs) {
    buckets.set(b, { bucketStart: b, total: 0, byMember: {} });
  }
  for (const e of active) {
    const b = buckets.get(startOf(e.caughtAt));
    if (b === undefined) continue;
    b.total += 1;
    b.byMember[e.memberId] = (b.byMember[e.memberId] ?? 0) + 1;
  }
  return [...buckets.values()];
}

/** 사람별 누적 추이 — 역전 드라마 확인용 선 그래프 (Plan FR-27) */
export function cumulativeSeries(events: readonly CatchEvent[]): CumulativePoint[] {
  const active = activeSortedByTime(events);
  const running: Record<MemberId, number> = {};
  const points: CumulativePoint[] = [];

  for (const e of active) {
    running[e.memberId] = (running[e.memberId] ?? 0) + 1;
    points.push({ at: e.caughtAt, byMember: { ...running } });
  }
  return points;
}
