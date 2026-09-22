import type { MemberId } from '@domain/entities/member';
import type { IdGenerator } from '@application/ports/IdGenerator';
import type { Presence } from '@application/ports/Presence';
import { FixedClock } from '@application/ports/Clock';
import type { UseCaseDeps } from '@application/usecases/deps';
import { InMemoryRoomRepository } from '@infrastructure/client/InMemoryRoomRepository';
import { CreateRoom } from '@application/usecases/room/CreateRoom';
import { JoinRoom } from '@application/usecases/room/JoinRoom';
import { AddSpecies } from '@application/usecases/species/AddSpecies';
import { T0 } from './fixtures';

/** 결정적 ID — 테스트가 uuid 값에 의존해도 흔들리지 않게 한다 */
export class SeqIdGenerator implements IdGenerator {
  private n = 0;
  private c = 0;

  uuid(): string {
    this.n += 1;
    return `id-${String(this.n).padStart(3, '0')}`;
  }

  inviteCode(): string {
    this.c += 1;
    return `CODE${String(this.c).padStart(2, '0')}`;
  }
}

export class FakePresence implements Presence {
  private readonly online = new Set<MemberId>();

  setOnline(memberId: MemberId, value: boolean): void {
    if (value) this.online.add(memberId);
    else this.online.delete(memberId);
  }

  isOnline(memberId: MemberId): boolean {
    return this.online.has(memberId);
  }

  onlineMembers(): MemberId[] {
    return [...this.online];
  }
}

export interface Harness {
  deps: UseCaseDeps;
  repo: InMemoryRoomRepository;
  clock: FixedClock;
  presence: FakePresence;
}

export function harness(at = T0): Harness {
  const repo = new InMemoryRoomRepository();
  const clock = new FixedClock(at);
  const presence = new FakePresence();
  const deps: UseCaseDeps = { repo, clock, ids: new SeqIdGenerator(), presence };
  return { deps, repo, clock, presence };
}

export interface Fixture extends Harness {
  hostId: MemberId;
  guestId: MemberId;
  rockId: string;
  flatId: string;
}

/**
 * 방장 1명 + 참여자 1명 + 어종 2종이 준비된 방.
 * 대리 입력·권한 시나리오 대부분이 이 구성을 쓴다.
 */
export function roomFixture(at = T0): Fixture {
  const h = harness(at);

  const host = new CreateRoom(h.deps).execute({
    code: 'K7QM4X',
    roomName: '9월 27일 태안 선상',
    displayName: '홍길동',
    deviceId: 'dev-host',
    uaLabel: 'iPhone · Safari',
  });

  const guest = new JoinRoom(h.deps).execute({
    displayName: '철수',
    deviceId: 'dev-guest',
    uaLabel: 'Android · Chrome',
  });

  const rock = new AddSpecies(h.deps).execute({
    id: 'sp-rock',
    name: '우럭',
    actorMemberId: guest.memberId,
  });
  const flat = new AddSpecies(h.deps).execute({
    id: 'sp-flat',
    name: '광어',
    actorMemberId: guest.memberId,
  });

  // 방장 카드는 따로 만들지 않는다 — 어종을 추가하면 방 전원에게 깔린다
  // (2026-09-23, cardFanout.ts)

  return {
    ...h,
    hostId: host.memberId,
    guestId: guest.memberId,
    rockId: rock.species.id,
    flatId: flat.species.id,
  };
}
