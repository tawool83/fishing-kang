import type { Millis } from '@domain/entities/common';
import type { Room } from '@domain/entities/room';
import { isHost, isRoomWritable } from '@domain/entities/room';
import { isResumable } from '@domain/rules/roomLifecycle';
import type { Member, MemberId } from '@domain/entities/member';
import { DomainError } from '@domain/errors';
import type { RoomRepository } from '../ports/RoomRepository';
import type { ActorInput } from '../dto/requests';

export function requireRoom(repo: RoomRepository): Room {
  const room = repo.getRoom();
  if (room === null) {
    throw new DomainError('ROOM_NOT_FOUND', '방을 찾을 수 없어요.');
  }
  return room;
}

/** Plan FR-17 — 종료된 방은 방장 포함 전원 입력 잠금. 정정하려면 재개해야 한다 */
export function requireWritable(room: Room): void {
  if (!isRoomWritable(room)) {
    throw new DomainError('ROOM_ENDED', '낚시가 종료됐어요. 방장이 재개하면 다시 기록할 수 있어요.');
  }
}

/**
 * Plan FR-32 — 재개는 종료 후 24시간 이내, 그리고 3일 상한 안에서만.
 *
 * 지나면 방은 결과 열람 전용으로 굳는다. 되돌릴 방법은 없다 —
 * 정정 창을 무한정 열어두면 "최대 3일"도 "종료"도 의미가 없어진다.
 */
export function requireResumable(room: Room, now: Millis): void {
  if (!isResumable(room, now)) {
    throw new DomainError(
      'ROOM_ARCHIVED',
      '정정할 수 있는 시간이 지났어요. 이제 결과만 볼 수 있어요.'
    );
  }
}

export function requireMember(repo: RoomRepository, id: MemberId): Member {
  const member = repo.findMember(id);
  if (member === null) {
    throw new DomainError('MEMBER_NOT_FOUND', '참여자를 찾을 수 없어요.');
  }
  return member;
}

/**
 * Plan FR-17 — 종료/재개는 방장만.
 *
 * Design Ref: §1.2 — 이건 보안이 아니라 역할 구분이다. 조작 방지를 하지 않기로 했으므로
 * "누가 진짜 방장인지"를 암호학적으로 증명시키지 않는다. 멤버 id 대조로 충분하다.
 */
export function requireHost(room: Room, actorMemberId: MemberId): void {
  if (!isHost(room, actorMemberId)) {
    throw new DomainError('FORBIDDEN_PROXY', '방장만 할 수 있어요.');
  }
}

/**
 * 대리 입력 대상 결정 + 권한 검사 (Plan FR-26).
 *
 * `forMemberId`가 없거나 본인이면 그냥 본인.
 * 다르면 **방장일 때만** 허용하고, 아니면 거부한다.
 * 서버가 이 검사를 하는 이유는 일반 참여자 UI에 진입점이 없다는 것만으로는
 * 역할 구분이 불완전하기 때문이다 (Design §5.4 ⑦).
 */
export function resolveTarget(
  room: Room,
  repo: RoomRepository,
  input: ActorInput
): { actor: Member; target: Member; isProxy: boolean } {
  const actor = requireMember(repo, input.actorMemberId);

  const targetId = input.forMemberId ?? actor.id;
  if (targetId === actor.id) {
    return { actor, target: actor, isProxy: false };
  }

  requireHost(room, actor.id);
  const target = requireMember(repo, targetId);
  return { actor, target, isProxy: true };
}
