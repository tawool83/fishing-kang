import type { CatchEvent } from '@domain/entities/catch-event';
import { isActive } from '@domain/entities/catch-event';
import { isHost } from '@domain/entities/room';
import { DomainError } from '@domain/errors';
import type { UseCaseDeps } from '../deps';
import type { RestoreCatchInput } from '../../dto/requests';
import { requireMember, requireRoom, requireWritable } from '../guards';

export interface RestoreCatchResult {
  event: CatchEvent;
  idempotent: boolean;
}

/**
 * −1 되돌리기 — 취소했던 건을 되살린다 (Plan FR-12).
 *
 * `actionId`로 "어느 −1을 되돌릴지"를 찾는다. `voidActionId`가 UNIQUE라
 * 그 −1이 어느 이벤트를 취소했는지 역추적할 수 있다.
 */
export class RestoreCatch {
  constructor(private readonly deps: UseCaseDeps) {}

  execute(input: RestoreCatchInput): RestoreCatchResult {
    const { repo, clock } = this.deps;

    const room = requireRoom(repo);
    requireWritable(room);
    const actor = requireMember(repo, input.actorMemberId);

    const event = repo.findEventByVoidActionId(input.actionId);
    if (event === null) {
      throw new DomainError('NO_ACTIVE_CATCH', '되돌릴 취소 기록을 찾을 수 없어요.');
    }

    if (event.memberId !== actor.id && !isHost(room, actor.id)) {
      throw new DomainError('FORBIDDEN_PROXY', '다른 사람의 조과는 방장만 정정할 수 있어요.');
    }

    if (isActive(event)) {
      return { event, idempotent: true };
    }

    const now = clock.now();
    repo.restoreCatch(event.id);
    repo.touchActivity(now);

    const updated = repo.findEvent(event.id);
    return { event: updated ?? event, idempotent: false };
  }
}
