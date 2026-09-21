import type { RankEntry } from '@domain/rules/ranking';
import { computeRanking } from '@domain/rules/ranking';
import type { UseCaseDeps } from '../deps';
import { requireRoom } from '../guards';

/**
 * 순위 계산 (Plan FR-14).
 *
 * 브로드캐스트 때마다 전체를 다시 계산한다. 10명·수백 행 규모라 부담이 없고,
 * 클라이언트도 **같은 `computeRanking`**을 호출하므로 결과가 어긋날 수 없다.
 */
export class GetRanking {
  constructor(private readonly deps: UseCaseDeps) {}

  execute(): RankEntry[] {
    const { repo } = this.deps;
    requireRoom(repo);
    return computeRanking(repo.listMembers(), repo.listEvents());
  }
}
