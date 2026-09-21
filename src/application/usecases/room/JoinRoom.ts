import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN } from '@domain/entities/member';
import { isHost } from '@domain/entities/room';
import { normalizeName, validateName } from '@domain/rules/speciesName';
import { DomainError } from '@domain/errors';
import type { UseCaseDeps } from '../deps';
import type { JoinRoomInput } from '../../dto/requests';
import type { JoinResultDto } from '../../dto/responses';
import { requireRoom, requireWritable } from '../guards';

/**
 * 새 이름으로 방 참여 (Plan FR-02, FR-06).
 *
 * 이름 중복 판정은 **정규화 기준**이다 — "김 철수"와 "김철수"는 같은 이름으로 본다.
 * 중복이면 거부하고, UI가 "이미 있는 이름이에요. 이어서 하려면 아래에서 고르세요"로
 * ClaimMember 쪽으로 안내한다 (Design §6.1).
 */
export class JoinRoom {
  constructor(private readonly deps: UseCaseDeps) {}

  execute(input: JoinRoomInput): JoinResultDto {
    const { repo, clock, ids } = this.deps;

    const room = requireRoom(repo);
    requireWritable(room);

    const displayName = validateName(
      input.displayName,
      DISPLAY_NAME_MIN,
      DISPLAY_NAME_MAX,
      'displayName'
    );
    const normalized = normalizeName(displayName);

    if (repo.findMemberByNormalized(normalized) !== null) {
      throw new DomainError('NAME_TAKEN', '이미 있는 이름이에요.', { field: 'displayName' });
    }

    const now = clock.now();
    const memberId = ids.uuid();

    repo.addMember({ id: memberId, displayName, normalized, joinedAt: now, hasDevice: true });
    repo.linkDevice({
      deviceId: input.deviceId,
      memberId,
      uaLabel: input.uaLabel,
      linkedAt: now,
      lastSeenAt: now,
    });
    repo.touchActivity(now);

    return { memberId, isHost: isHost(room, memberId) };
  }
}
