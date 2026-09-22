import type { UseCaseDeps } from '../deps';
import type { SetRoomStatusInput } from '../../dto/requests';
import { requireHost, requireResumable, requireRoom } from '../guards';

export interface ResumeFishingResult {
  idempotent: boolean;
}

/**
 * 낚시 재개 (Plan FR-17) — 방장만.
 *
 * Design Ref: §5.4 ⑦ — 종료 후 정정이 필요하면 재개 → 수정 → 다시 종료가 정해진 흐름이다.
 * 종료된 방에서는 방장도 입력할 수 없기 때문이다.
 *
 * Plan FR-32 — 다만 정정 창은 종료 후 24시간이다. 그 뒤에는 결과 열람만 남는다.
 */
export class ResumeFishing {
  constructor(private readonly deps: UseCaseDeps) {}

  execute(input: SetRoomStatusInput): ResumeFishingResult {
    const { repo, clock } = this.deps;

    const room = requireRoom(repo);
    requireHost(room, input.actorMemberId);

    if (room.status === 'active') {
      return { idempotent: true };
    }

    const now = clock.now();
    requireResumable(room, now);
    repo.setRoomStatus('active', null);
    repo.touchActivity(now);

    return { idempotent: false };
  }
}
