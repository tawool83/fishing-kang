import type { CatchEvent } from '@domain/entities/catch-event';
import { isActive } from '@domain/entities/catch-event';
import { isHost } from '@domain/entities/room';
import { DomainError } from '@domain/errors';
import type { UseCaseDeps } from '../deps';
import type { UndoCatchInput } from '../../dto/requests';
import { requireMember, requireRoom, requireWritable } from '../guards';

export interface UndoCatchResult {
  event: CatchEvent;
  idempotent: boolean;
}

/**
 * +1 되돌리기 — 스낵바의 "되돌리기" (Plan FR-12).
 *
 * VoidCatch와 달리 **이벤트 id를 직접 지정**한다. 방금 만든 그 건을 정확히 취소해야
 * 하기 때문이다(그 사이 다른 +1이 들어왔을 수 있다).
 *
 * 권한: 자기 조과이거나 방장이면 된다. 대리 입력을 받은 대상자도 되돌릴 수 있다
 * (Plan FR-23 — "방장이 우럭 +1 했어요 · 되돌리기").
 */
export class UndoCatch {
  constructor(private readonly deps: UseCaseDeps) {}

  execute(input: UndoCatchInput): UndoCatchResult {
    const { repo, clock } = this.deps;

    const room = requireRoom(repo);
    requireWritable(room);
    const actor = requireMember(repo, input.actorMemberId);

    const event = repo.findEvent(input.targetId);
    if (event === null) {
      throw new DomainError('NO_ACTIVE_CATCH', '되돌릴 조과를 찾을 수 없어요.');
    }

    if (event.memberId !== actor.id && !isHost(room, actor.id)) {
      throw new DomainError('FORBIDDEN_PROXY', '다른 사람의 조과는 방장만 정정할 수 있어요.');
    }

    // 이미 취소된 건이면 멱등하게 통과 (스낵바 더블탭, 대기열 재전송)
    if (!isActive(event)) {
      return { event, idempotent: true };
    }

    const now = clock.now();
    repo.voidCatch(event.id, now, input.actionId, actor.id);
    repo.touchActivity(now);

    const updated = repo.findEvent(event.id);
    return { event: updated ?? event, idempotent: false };
  }
}
