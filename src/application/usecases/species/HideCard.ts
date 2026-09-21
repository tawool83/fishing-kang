import { DomainError } from '@domain/errors';
import type { UseCaseDeps } from '../deps';
import type { SetCardHiddenInput } from '../../dto/requests';
import { requireRoom, requireWritable, resolveTarget } from '../guards';

/**
 * 어종 카드 숨기기/펼치기 (Plan FR-08).
 *
 * 잡은 기록이 있는 카드는 삭제할 수 없고 숨기기만 된다 — 통계에서 그 어종이
 * 사라지면 안 되기 때문이다. 삭제는 RemoveCard(0마리일 때만)가 담당한다.
 */
export class HideCard {
  constructor(private readonly deps: UseCaseDeps) {}

  execute(input: SetCardHiddenInput): void {
    const { repo, clock } = this.deps;

    const room = requireRoom(repo);
    requireWritable(room);
    const { target } = resolveTarget(room, repo, input);

    const card = repo.findCard(target.id, input.speciesId);
    if (card === null) {
      throw new DomainError('SPECIES_NOT_FOUND', '카드를 찾을 수 없어요.');
    }

    repo.setCardHidden(target.id, input.speciesId, input.hidden);
    repo.touchActivity(clock.now());
  }
}
