import type { RoomRepository, RoomState } from '@application/ports/RoomRepository';
import { InMemoryRoomRepository } from './InMemoryRoomRepository';

/**
 * 클라이언트 투영 Repository — 낙관적 업데이트의 토대 (Design §2.0, §2.2.3).
 *
 * 서버가 보낸 **확정 상태** 위에 아직 전송되지 않은 **pending**을 얹은 것이
 * 화면에 보이는 상태다. 스냅샷이 도착하면 확정을 통째로 갈아끼우고
 * pending을 다시 올린다.
 *
 * 이 병합 규칙 덕분에 스냅샷이 와도 내가 방금 누른 탭이 화면에서 사라지지 않는다.
 *
 * 재적용을 어떻게 할지(어느 메시지를 어느 UseCase로)는 여기서 정하지 않는다.
 * 그건 `applyMessage`가 갖고, 호출자가 `replay` 콜백으로 넘긴다 —
 * Repository는 저장소일 뿐 유스케이스를 알면 안 된다 (Design §9.3).
 */
export class ProjectionRoomRepository extends InMemoryRoomRepository implements RoomRepository {
  private confirmed: RoomState | null = null;

  /**
   * 서버 스냅샷으로 확정 상태를 교체하고 pending을 재적용한다.
   *
   * @param snapshot 서버가 보낸 확정 상태
   * @param replay   미전송 pending을 이 저장소에 다시 적용하는 콜백
   */
  rebase(snapshot: RoomState, replay: (repo: RoomRepository) => void): void {
    this.confirmed = cloneState(snapshot);
    this.loadState(snapshot);
    replay(this);
  }

  /** 마지막으로 받은 확정 상태 (pending 제외) */
  confirmedState(): RoomState | null {
    return this.confirmed === null ? null : cloneState(this.confirmed);
  }

  hasRoom(): boolean {
    return this.getRoom() !== null;
  }
}

function cloneState(state: RoomState): RoomState {
  return {
    room: { ...state.room },
    members: state.members.map((m) => ({ ...m })),
    devices: state.devices.map((d) => ({ ...d })),
    species: state.species.map((s) => ({ ...s })),
    cards: state.cards.map((c) => ({ ...c })),
    events: state.events.map((e) => ({ ...e })),
  };
}
