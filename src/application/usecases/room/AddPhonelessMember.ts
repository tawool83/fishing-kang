import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN } from '@domain/entities/member';
import { normalizeName, validateName } from '@domain/rules/speciesName';
import { DomainError } from '@domain/errors';
import type { UseCaseDeps } from '../deps';
import type { AddPhonelessMemberInput } from '../../dto/requests';
import type { JoinResultDto } from '../../dto/responses';
import { requireHost, requireRoom, requireWritable } from '../guards';

/**
 * 폰 없는 참여자 등록 (Plan FR-24) — 방장 전용.
 *
 * 아이, 어르신, 배터리가 나간 사람처럼 기기를 연결할 수 없는 참여자를
 * 이름만으로 만든다. 순위·포디움·통계에는 똑같이 나온다.
 * 나중에 그 사람이 폰으로 들어오면 ClaimMember로 이어서 쓸 수 있다.
 */
export class AddPhonelessMember {
  constructor(private readonly deps: UseCaseDeps) {}

  execute(input: AddPhonelessMemberInput): JoinResultDto {
    const { repo, clock } = this.deps;

    const room = requireRoom(repo);
    requireWritable(room);
    requireHost(room, input.actorMemberId);

    // 멱등 — 같은 id로 재전송되면 그대로 돌려준다
    const existing = repo.findMember(input.id);
    if (existing !== null) {
      return { memberId: existing.id, isHost: false };
    }

    const displayName = validateName(input.name, DISPLAY_NAME_MIN, DISPLAY_NAME_MAX, 'name');
    const normalized = normalizeName(displayName);

    if (repo.findMemberByNormalized(normalized) !== null) {
      throw new DomainError('NAME_TAKEN', '이미 있는 이름이에요.', { field: 'name' });
    }

    const now = clock.now();
    repo.addMember({
      id: input.id,
      displayName,
      normalized,
      joinedAt: now,
      hasDevice: false, // 연결된 기기가 없는 멤버
    });
    repo.touchActivity(now);

    return { memberId: input.id, isHost: false };
  }
}
