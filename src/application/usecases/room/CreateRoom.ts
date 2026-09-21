import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN } from '@domain/entities/member';
import { ROOM_NAME_MAX, ROOM_NAME_MIN } from '@domain/entities/room';
import { normalizeName, validateName } from '@domain/rules/speciesName';
import { DomainError } from '@domain/errors';
import type { UseCaseDeps } from '../deps';
import type { CreateRoomInput } from '../../dto/requests';
import type { JoinResultDto } from '../../dto/responses';

/**
 * 방 생성 (Plan FR-01).
 *
 * 초대코드는 라우터가 만들어 넘긴다. DO 이름이 코드라서 충돌 재시도를
 * DO 바깥에서 해야 하기 때문이다 (presentation/worker/http-router.ts).
 *
 * 만든 사람이 방장이 된다. 방장 권한은 기기가 아니라 **멤버**에 붙으므로
 * 폰을 바꿔도 이름 선택으로 복구하면 권한이 따라온다 (Design §3.2).
 */
export class CreateRoom {
  constructor(private readonly deps: UseCaseDeps) {}

  execute(input: CreateRoomInput): JoinResultDto {
    const { repo, clock, ids } = this.deps;

    if (repo.getRoom() !== null) {
      // DO 이름 충돌 — 라우터가 다른 코드로 재시도한다
      throw new DomainError('NAME_TAKEN', '이미 사용 중인 초대코드예요.', { field: 'code' });
    }

    const roomName = validateName(input.roomName, ROOM_NAME_MIN, ROOM_NAME_MAX, 'roomName');
    const displayName = validateName(
      input.displayName,
      DISPLAY_NAME_MIN,
      DISPLAY_NAME_MAX,
      'displayName'
    );

    const now = clock.now();
    const memberId = ids.uuid();

    repo.createRoom({
      code: input.code,
      name: roomName,
      hostMemberId: memberId,
      status: 'active',
      createdAt: now,
      endedAt: null,
      lastActivityAt: now,
    });

    repo.addMember({
      id: memberId,
      displayName,
      normalized: normalizeName(displayName),
      joinedAt: now,
      hasDevice: true,
    });

    repo.linkDevice({
      deviceId: input.deviceId,
      memberId,
      uaLabel: input.uaLabel,
      linkedAt: now,
      lastSeenAt: now,
    });

    return { memberId, isHost: true };
  }
}
