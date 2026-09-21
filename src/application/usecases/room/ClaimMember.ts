import { isHost } from '@domain/entities/room';
import { DomainError } from '@domain/errors';
import type { UseCaseDeps } from '../deps';
import type { ClaimMemberInput } from '../../dto/requests';
import type { JoinResultDto } from '../../dto/responses';
import { requireMember, requireRoom } from '../guards';

/**
 * 이름 선택 복구 — 기존 멤버에 이 기기를 **추가 연결**한다 (Plan FR-04, FR-29).
 *
 * Design Ref: §3.5 — 기기 ID가 날아가는 상황은 흔하다:
 *  · 카톡 인앱 브라우저로 열었다가 나중에 사파리로 여는 경우 (한국에서 가장 흔함)
 *  · 홈 화면에 추가한 뒤 첫 실행
 *  · 사파리가 오래 안 쓴 사이트의 스크립트 저장소를 지운 경우
 *
 * **PIN이 없다** (확정). 조작 방지를 하지 않으므로 인증 단계를 두지 않는다.
 * 대신 그 이름이 지금 다른 기기에서 접속 중이면 확인창을 띄운다 —
 * 이건 남의 이름을 막으려는 게 아니라 **실수로 다른 사람을 고르는 것**을 막기 위함이다.
 *
 * 한 멤버에 기기를 여러 개 연결할 수 있다 (사파리 + 홈 화면 앱 + 카톡 인앱).
 * 종료된 방에서도 허용한다 — 통계를 보려면 내가 누군지 알아야 하기 때문이다.
 */
export class ClaimMember {
  constructor(private readonly deps: UseCaseDeps) {}

  execute(input: ClaimMemberInput): JoinResultDto {
    const { repo, clock, presence } = this.deps;

    const room = requireRoom(repo);
    const member = requireMember(repo, input.memberId);

    if (!input.confirmedOnlineConflict && presence.isOnline(member.id)) {
      throw new DomainError(
        'MEMBER_ONLINE',
        '이 이름은 지금 다른 폰에서 접속 중이에요. 본인 맞나요?',
        { memberId: member.id }
      );
    }

    const now = clock.now();
    const existing = repo.findDevice(input.deviceId);

    if (existing !== null && existing.memberId === member.id) {
      repo.touchDevice(input.deviceId, now); // 이미 연결됨 — 멱등
    } else {
      repo.linkDevice({
        deviceId: input.deviceId,
        memberId: member.id,
        uaLabel: input.uaLabel,
        linkedAt: now,
        lastSeenAt: now,
      });
    }

    // 폰 없는 참여자였다면 이제 기기가 생겼다 (Plan FR-24)
    if (!member.hasDevice) {
      repo.setMemberHasDevice(member.id, true);
    }

    return { memberId: member.id, isHost: isHost(room, member.id) };
  }
}
