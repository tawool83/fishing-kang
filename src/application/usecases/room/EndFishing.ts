import type { Millis } from '@domain/entities/common';
import type { UseCaseDeps } from '../deps';
import type { SetRoomStatusInput } from '../../dto/requests';
import { requireHost, requireRoom } from '../guards';

export interface EndFishingResult {
  endedAt: Millis;
  idempotent: boolean;
}

/**
 * 낚시 종료 (Plan FR-17) — 방장만.
 *
 * 종료하면 방장 포함 **전원 입력 잠금**이고 모든 화면이 통계로 전환된다.
 * 잘못 눌렀거나 정정이 필요하면 ResumeFishing으로 다시 열 수 있다.
 */
export class EndFishing {
  constructor(private readonly deps: UseCaseDeps) {}

  execute(input: SetRoomStatusInput): EndFishingResult {
    const { repo, clock } = this.deps;

    const room = requireRoom(repo);
    requireHost(room, input.actorMemberId);

    if (room.status === 'ended') {
      return { endedAt: room.endedAt ?? room.lastActivityAt, idempotent: true };
    }

    const now = clock.now();
    repo.setRoomStatus('ended', now);
    repo.touchActivity(now);

    return { endedAt: now, idempotent: false };
  }
}
