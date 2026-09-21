import type { CatchEvent } from '@domain/entities/catch-event';
import { pickVoidTarget } from '@domain/rules/catchLog';
import { DomainError } from '@domain/errors';
import type { UseCaseDeps } from '../deps';
import type { VoidCatchInput } from '../../dto/requests';
import { requireRoom, requireWritable, resolveTarget } from '../guards';

export interface VoidCatchResult {
  event: CatchEvent;
  idempotent: boolean;
  isProxy: boolean;
}

/**
 * −1 (Plan FR-11).
 *
 * 해당 어종의 **가장 최근 유효 건 1건**을 취소한다. 행을 지우지 않고 `voidedAt`을 찍는다.
 * 0마리면 대상이 없으므로 거부한다 (음수 불가).
 *
 * **쿨다운이 없다** (2026-09-21 확정): 오조작 정정이 목적이라 즉시 눌려야 하고,
 * 0마리에서 비활성되므로 하한은 이미 보호된다.
 *
 * 취소된 건이 쿨다운 기준이었다면 `cooldownBaseline`이 이전 유효 건으로 자동
 * 되돌아간다 — 별도 해제 로직이 없다 (Plan FR-13, domain/rules/cooldown.ts).
 */
export class VoidCatch {
  constructor(private readonly deps: UseCaseDeps) {}

  execute(input: VoidCatchInput): VoidCatchResult {
    const { repo, clock } = this.deps;

    const room = requireRoom(repo);
    requireWritable(room);
    const { actor, target, isProxy } = resolveTarget(room, repo, input);

    // 멱등 — 같은 actionId가 이미 처리됐으면 그 결과를 돌려준다
    const already = repo.findEventByVoidActionId(input.actionId);
    if (already !== null) {
      return { event: already, idempotent: true, isProxy };
    }

    const victim = pickVoidTarget(repo.listEvents(), target.id, input.speciesId);
    if (victim === null) {
      throw new DomainError('NO_ACTIVE_CATCH', '취소할 조과가 없어요.');
    }

    const now = clock.now();
    repo.voidCatch(victim.id, now, input.actionId, actor.id);
    repo.touchActivity(now);

    const updated = repo.findEvent(victim.id);
    if (updated === null) {
      throw new DomainError('NO_ACTIVE_CATCH', '취소할 조과가 없어요.');
    }
    return { event: updated, idempotent: false, isProxy };
  }
}
