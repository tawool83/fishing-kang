import type { Room } from '@domain/entities/room';
import { nextDeadlineOf } from '@domain/rules/roomLifecycle';

/**
 * 방 수명 알람 (Plan FR-30~33).
 *
 * DO 알람은 **한 번에 하나만** 예약할 수 있다. 그래서 "자동 종료"와 "삭제"를
 * 각각 걸 수 없고, 방의 현재 상태에서 다음 마감 하나를 골라 건다:
 *
 *   낚시 중 → 생성 + 3일 (자동 종료)
 *   종료됨 → 종료 + 7일 (삭제)
 *
 * 자동 종료가 일어나면 방 상태가 바뀌므로, 호출자가 곧바로 `schedule`을 다시 불러
 * 삭제 알람으로 갈아 끼운다. 판정 자체는 전부 도메인(`roomLifecycle`)에 있고
 * 여기는 storage에 시각을 꽂는 일만 한다.
 */
export class RoomLifecycleAlarm {
  constructor(private readonly storage: DurableObjectStorage) {}

  /** 방 상태에 맞는 다음 마감으로 알람을 건다 */
  async schedule(room: Room): Promise<void> {
    await this.storage.setAlarm(nextDeadlineOf(room));
  }
}
