import type { Millis } from '@domain/entities/common';
import { autoEndAt, isFishingExpired } from '@domain/rules/roomLifecycle';
import type { UseCaseDeps } from '../deps';
import { requireRoom } from '../guards';

export interface AutoEndFishingResult {
  /** 이번 호출에서 실제로 종료시켰는가 */
  ended: boolean;
  endedAt: Millis | null;
}

/**
 * 3일이 지난 방을 자동으로 종료한다 (Plan FR-31).
 *
 * `EndFishing`과 달리 **방장을 요구하지 않는다** — 부르는 쪽이 DO 알람이라
 * 행위자가 없기 때문이다. 대신 "정말 3일이 지났는가"를 도메인에 물어 확인한다.
 *
 * 종료 시각은 `now`가 아니라 **예정 시각(`autoEndAt`)** 을 쓴다. 알람은 몇 초씩
 * 늦게 울릴 수 있는데, 그 지연이 통계의 출조 시간에 섞여 들어가면 안 된다.
 */
export class AutoEndFishing {
  constructor(private readonly deps: UseCaseDeps) {}

  execute(): AutoEndFishingResult {
    const { repo, clock } = this.deps;

    const room = requireRoom(repo);
    if (!isFishingExpired(room, clock.now())) {
      return { ended: false, endedAt: room.endedAt };
    }

    const endedAt = autoEndAt(room);
    repo.setRoomStatus('ended', endedAt);

    return { ended: true, endedAt };
  }
}
