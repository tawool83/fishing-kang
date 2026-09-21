import type { MemberId } from '@domain/entities/member';
import { computeRanking } from '@domain/rules/ranking';
import { countActive } from '@domain/rules/catchLog';
import type { RoomRepository } from '@application/ports/RoomRepository';
import type { Presence } from '@application/ports/Presence';
import type {
  CardCountDto,
  CardDto,
  MemberDto,
  RoomDto,
  RoomInfoDto,
  RoomSnapshotDto,
  SpeciesDto,
} from '@application/dto/responses';

export function roomDto(repo: RoomRepository): RoomDto {
  const room = repo.getRoom();
  if (room === null) throw new Error('room missing');
  return {
    code: room.code,
    name: room.name,
    status: room.status,
    hostMemberId: room.hostMemberId,
    createdAt: room.createdAt,
    endedAt: room.endedAt,
  };
}

export function memberDtos(repo: RoomRepository, presence: Presence): MemberDto[] {
  const room = repo.getRoom();
  const devices = repo.listDevices();

  return repo.listMembers().map((m) => ({
    id: m.id,
    displayName: m.displayName,
    online: presence.isOnline(m.id),
    hasDevice: m.hasDevice,
    isHost: room?.hostMemberId === m.id,
    deviceCount: devices.filter((d) => d.memberId === m.id).length,
  }));
}

export function speciesDtos(repo: RoomRepository): SpeciesDto[] {
  const events = repo.listEvents();
  return repo.listSpecies().map((s) => {
    let roomTotal = 0;
    for (const e of events) {
      if (e.voidedAt === null && e.speciesId === s.id) roomTotal += 1;
    }
    return { id: s.id, name: s.name, roomTotal };
  });
}

export function cardDtos(repo: RoomRepository): CardDto[] {
  const events = repo.listEvents();
  return repo.listCards().map((c) => ({
    memberId: c.memberId,
    speciesId: c.speciesId,
    sortOrder: c.sortOrder,
    hidden: c.hidden,
    count: countActive(events, c.memberId, c.speciesId),
  }));
}

export function cardCountsFor(repo: RoomRepository, memberId: MemberId): CardCountDto[] {
  const events = repo.listEvents();
  return repo
    .listCards()
    .filter((c) => c.memberId === memberId)
    .map((c) => ({
      memberId: c.memberId,
      speciesId: c.speciesId,
      count: countActive(events, c.memberId, c.speciesId),
    }));
}

export function snapshotDto(repo: RoomRepository, presence: Presence): RoomSnapshotDto {
  return {
    room: roomDto(repo),
    members: memberDtos(repo, presence),
    species: speciesDtos(repo),
    cards: cardDtos(repo),
    // Design §2.2.3 — 이벤트 원본을 그대로 보낸다. 클라이언트가 같은 도메인 함수로
    // 카운트를 파생시켜야 낙관적 예측과 어긋나지 않는다.
    events: repo.listEvents(),
    ranking: computeRanking(repo.listMembers(), repo.listEvents()),
  };
}

export function roomInfoDto(
  repo: RoomRepository,
  presence: Presence,
  myMemberId: MemberId | null
): RoomInfoDto {
  return { room: roomDto(repo), members: memberDtos(repo, presence), myMemberId };
}
