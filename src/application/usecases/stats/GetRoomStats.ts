import { HALF_HOUR_MS } from '@domain/entities/common';
import { computeRanking } from '@domain/rules/ranking';
import {
  cumulativeSeries,
  memberBySpeciesMatrix,
  perMember,
  perSpecies,
  summarize,
  timeBuckets,
} from '@domain/stats/aggregate';
import { highlights } from '@domain/stats/highlights';
import type { UseCaseDeps } from '../deps';
import type { StatsDto } from '../../dto/responses';
import { requireRoom } from '../guards';

/**
 * 통계 조회 (Plan FR-27, FR-28).
 *
 * 종료 후뿐 아니라 **진행 중에도** 누구나 볼 수 있다 (Plan FR-18).
 * 전부 `catch_event`에서 파생하므로 별도 집계 테이블이 없다.
 */
export class GetRoomStats {
  constructor(private readonly deps: UseCaseDeps) {}

  execute(bucketMs: number = HALF_HOUR_MS): StatsDto {
    const { repo } = this.deps;

    const room = requireRoom(repo);
    const members = repo.listMembers();
    const species = repo.listSpecies();
    const events = repo.listEvents();

    let proxiedCount = 0;
    for (const e of events) {
      if (e.voidedAt === null && e.enteredBy !== e.memberId) proxiedCount += 1;
    }

    return {
      summary: summarize(room, members, events),
      ranking: computeRanking(members, events),
      perMember: perMember(members, events),
      perSpecies: perSpecies(species, events),
      matrix: memberBySpeciesMatrix(members, species, events),
      buckets: timeBuckets(events, bucketMs),
      cumulative: cumulativeSeries(events),
      highlights: highlights(events, bucketMs),
      proxiedCount,
    };
  }
}
