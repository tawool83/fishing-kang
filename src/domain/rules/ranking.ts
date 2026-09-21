import type { Member, MemberId } from '../entities/member';
import type { CatchEvent } from '../entities/catch-event';
import { countActive } from './catchLog';

export type Medal = 'gold' | 'silver' | 'bronze';

export interface RankEntry {
  memberId: MemberId;
  displayName: string;
  /** 어종 무관 총 마릿수 (취소 제외) */
  total: number;
  /** SQL `RANK()`와 동일 — 동점이면 같은 rank, 다음은 건너뛴다 */
  rank: number;
  /** 같은 rank가 2명 이상인가 (UI "공동 N위" 배지) */
  tied: boolean;
  /** 0마리는 메달 없음 (Plan FR-14) */
  medal: Medal | null;
}

export interface Podium {
  gold: RankEntry[];
  silver: RankEntry[];
  bronze: RankEntry[];
}

/**
 * Plan FR-14 — 어종 무관 총 마릿수 내림차순, 동점은 공동 순위.
 *
 * 예) 12, 12, 9, 9, 0  →  rank 1, 1, 3, 3, 5
 *     메달:              금  금  동  동  없음
 *
 * 은메달 자리가 비는 것이 맞다. 공동 1위가 2명이면 2위는 존재하지 않는다.
 * UI는 빈 메달 자리를 "—"로 표시한다 (Design §5.4 ④).
 */
export interface MemberTotal {
  memberId: MemberId;
  displayName: string;
  total: number;
}

export function computeRanking(
  members: readonly Member[],
  events: readonly CatchEvent[]
): RankEntry[] {
  return rankTotals(
    members.map((m) => ({
      memberId: m.id,
      displayName: m.displayName,
      total: countActive(events, m.id),
    }))
  );
}

/**
 * 총계 목록을 순위로 바꾼다.
 *
 * 클라이언트는 서버가 브로드캐스트한 순위에 자기 미전송분을 더한 뒤
 * 이 함수로 다시 랭킹을 매긴다 — 순위 규칙이 두 벌이 되지 않게 하기 위함이다.
 */
export function rankTotals(input: readonly MemberTotal[]): RankEntry[] {
  const totals = input.map((t) => ({ ...t }));

  // 동점자 사이 순서도 결정적이어야 화면이 흔들리지 않는다: 이름 → id 순
  totals.sort((a, b) => {
    if (a.total !== b.total) return b.total - a.total;
    if (a.displayName !== b.displayName) return a.displayName < b.displayName ? -1 : 1;
    return a.memberId < b.memberId ? -1 : 1;
  });

  const counts = new Map<number, number>();
  for (const t of totals) counts.set(t.total, (counts.get(t.total) ?? 0) + 1);

  const entries: RankEntry[] = [];
  let rank = 0;
  let seen = 0;
  let prevTotal: number | null = null;

  for (const t of totals) {
    seen += 1;
    if (prevTotal === null || t.total !== prevTotal) {
      rank = seen; // RANK(): 동점 그룹이 끝나면 건너뛴 만큼 점프
      prevTotal = t.total;
    }
    entries.push({
      memberId: t.memberId,
      displayName: t.displayName,
      total: t.total,
      rank,
      tied: (counts.get(t.total) ?? 0) > 1,
      medal: medalOf(rank, t.total),
    });
  }

  return entries;
}

/** rank 1·2·3만 메달. 0마리는 rank와 무관하게 메달 없음 */
export function medalOf(rank: number, total: number): Medal | null {
  if (total <= 0) return null;
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return null;
}

/** 포디움 3칸. 각 칸은 공동 수상자를 여러 명 가질 수 있다 */
export function podium(ranking: readonly RankEntry[]): Podium {
  return {
    gold: ranking.filter((e) => e.medal === 'gold'),
    silver: ranking.filter((e) => e.medal === 'silver'),
    bronze: ranking.filter((e) => e.medal === 'bronze'),
  };
}

export function findRank(ranking: readonly RankEntry[], memberId: MemberId): RankEntry | null {
  return ranking.find((e) => e.memberId === memberId) ?? null;
}
