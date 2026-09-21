import { countActive } from '@domain/rules/catchLog';
import { DomainError } from '@domain/errors';
import type { UseCaseDeps } from '../deps';
import type { RemoveCardInput } from '../../dto/requests';
import { requireRoom, requireWritable, resolveTarget } from '../guards';

/**
 * 어종 카드 삭제 (Plan FR-08) — **0마리일 때만**.
 *
 * 기록이 있으면 통계가 깨지므로 삭제 대신 HideCard를 쓴다.
 * 어종 자체(방 사전)는 지우지 않는다 — 다른 사람이 쓰고 있을 수 있다.
 */
export class RemoveCard {
  constructor(private readonly deps: UseCaseDeps) {}

  execute(input: RemoveCardInput): void {
    const { repo, clock } = this.deps;

    const room = requireRoom(repo);
    requireWritable(room);
    const { target } = resolveTarget(room, repo, input);

    const card = repo.findCard(target.id, input.speciesId);
    if (card === null) {
      throw new DomainError('SPECIES_NOT_FOUND', '카드를 찾을 수 없어요.');
    }

    if (countActive(repo.listEvents(), target.id, input.speciesId) > 0) {
      throw new DomainError('CARD_NOT_EMPTY', '잡은 기록이 있어서 지울 수 없어요. 숨기기를 쓰세요.');
    }

    repo.removeCard(target.id, input.speciesId);
    repo.touchActivity(clock.now());
  }
}
