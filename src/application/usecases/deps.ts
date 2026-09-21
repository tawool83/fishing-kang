import type { RoomRepository } from '../ports/RoomRepository';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { Presence } from '../ports/Presence';

/**
 * UseCase가 받는 의존성 묶음.
 *
 * Design Ref: §9.2 — 전부 Port 인터페이스다. 구현 주입은 조립 지점(composition root)에서
 * 한다: 클라이언트는 `bootstrap.ts`, Worker는 `room-do.ts`.
 *
 * 같은 UseCase가 `repo`만 바꿔 끼우면 클라이언트 낙관적 예측이 되고
 * 서버 확정이 된다 — Option B를 택한 이유다 (Design §2.0).
 */
export interface UseCaseDeps {
  repo: RoomRepository;
  clock: Clock;
  ids: IdGenerator;
  presence: Presence;
}
