import { describe, it, expect, afterEach } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';

import type { RoomRepository } from '@application/ports/RoomRepository';
import type { UseCaseDeps } from '@application/usecases/deps';
import type { IdGenerator } from '@application/ports/IdGenerator';
import { FixedClock } from '@application/ports/Clock';
import { NoPresence } from '@application/ports/Presence';

import { CreateRoom } from '@application/usecases/room/CreateRoom';
import { JoinRoom } from '@application/usecases/room/JoinRoom';
import { AddPhonelessMember } from '@application/usecases/room/AddPhonelessMember';
import { EndFishing } from '@application/usecases/room/EndFishing';
import { ResumeFishing } from '@application/usecases/room/ResumeFishing';
import { AddSpecies } from '@application/usecases/species/AddSpecies';
import { RecordCatch } from '@application/usecases/catch/RecordCatch';
import { VoidCatch } from '@application/usecases/catch/VoidCatch';
import { UndoCatch } from '@application/usecases/catch/UndoCatch';
import { RestoreCatch } from '@application/usecases/catch/RestoreCatch';

import { computeRanking } from '@domain/rules/ranking';
import { countActive } from '@domain/rules/catchLog';
import { cooldownRemainingMs } from '@domain/rules/cooldown';
import { highlights } from '@domain/stats/highlights';
import { summarize } from '@domain/stats/aggregate';

import { InMemoryRoomRepository } from '@infrastructure/client/InMemoryRoomRepository';
import { SqliteRoomRepository } from '@infrastructure/worker/SqliteRoomRepository';
import { closeAllSockets } from './helpers';

afterEach(closeAllSockets);

const T = 1_790_000_000_000;
const sec = (n: number) => n * 1000;

class SeqIds implements IdGenerator {
  private n = 0;
  uuid(): string {
    this.n += 1;
    return `id-${String(this.n).padStart(3, '0')}`;
  }
  inviteCode(): string {
    return 'EQUIV1';
  }
}

/**
 * 두 Repository 구현 위에서 **똑같이** 실행할 시나리오.
 *
 * 방 생성 → 참여 → 폰 없는 참여자 → 어종 추가(표기 분열 포함) →
 * 조과 다수(대리 입력 포함) → −1 → 되돌리기 → 복원 → 종료 → 재개 → 추가 조과.
 */
function runScenario(deps: UseCaseDeps, clock: FixedClock): void {
  const host = new CreateRoom(deps).execute({
    code: 'EQUIV1',
    roomName: '9월 27일 태안 선상',
    displayName: '홍길동',
    deviceId: 'dev-host',
    uaLabel: 'iPhone · Safari',
  });
  const guest = new JoinRoom(deps).execute({
    displayName: '철수',
    deviceId: 'dev-guest',
    uaLabel: 'Android · Chrome',
  });
  new AddPhonelessMember(deps).execute({
    id: 'm-kid',
    name: '철수아들',
    actorMemberId: host.memberId,
  });

  const rock = new AddSpecies(deps).execute({
    id: 'sp-rock',
    name: '우럭',
    actorMemberId: guest.memberId,
  });
  // 표기 분열 — 정규화되어 같은 어종으로 합쳐져야 한다
  const rockAgain = new AddSpecies(deps).execute({
    id: 'sp-rock-dup',
    name: '우 럭',
    actorMemberId: host.memberId,
  });
  const flat = new AddSpecies(deps).execute({
    id: 'sp-flat',
    name: '광어',
    actorMemberId: guest.memberId,
  });
  new AddSpecies(deps).execute({ id: 'sp-flat2', name: '광어', actorMemberId: host.memberId });

  const catches: Array<[string, string, string, number, string?]> = [
    ['e01', guest.memberId, rock.species.id, 0],
    ['e02', host.memberId, rockAgain.species.id, 12],
    ['e03', guest.memberId, flat.species.id, 30],
    ['e04', host.memberId, flat.species.id, 45],
    ['e05', guest.memberId, rock.species.id, 61],
    // 방장이 폰 없는 참여자 대신 입력
    ['e06', 'm-kid', rock.species.id, 75, host.memberId],
    ['e07', host.memberId, rock.species.id, 90],
    ['e08', guest.memberId, rock.species.id, 122],
    ['e09', 'm-kid', flat.species.id, 140, host.memberId],
    ['e10', host.memberId, flat.species.id, 155],
  ];

  for (const [id, member, species, offset, by] of catches) {
    clock.set(T + sec(offset) + 5);
    new RecordCatch(deps).execute({
      id,
      actorMemberId: by ?? member,
      ...(by === undefined ? {} : { forMemberId: member }),
      speciesId: species,
      caughtAt: T + sec(offset),
    });
  }

  // 같은 id 재전송 — 멱등이 양쪽에서 똑같이 걸려야 한다
  clock.set(T + sec(200));
  new RecordCatch(deps).execute({
    id: 'e05',
    actorMemberId: guest.memberId,
    speciesId: rock.species.id,
    caughtAt: T + sec(61),
  });

  // −1 → 되돌리기(복원)
  clock.set(T + sec(210));
  new VoidCatch(deps).execute({
    actionId: 'act-1',
    actorMemberId: guest.memberId,
    speciesId: rock.species.id,
  });
  clock.set(T + sec(215));
  new RestoreCatch(deps).execute({ actionId: 'act-1', actorMemberId: guest.memberId });

  // 방장이 대리로 −1
  clock.set(T + sec(220));
  new VoidCatch(deps).execute({
    actionId: 'act-2',
    actorMemberId: host.memberId,
    forMemberId: 'm-kid',
    speciesId: flat.species.id,
  });

  // +1 되돌리기
  clock.set(T + sec(230));
  new UndoCatch(deps).execute({
    actionId: 'act-3',
    targetId: 'e02',
    actorMemberId: host.memberId,
  });

  // 종료 → 재개 → 정정 → 재종료
  clock.set(T + sec(300));
  new EndFishing(deps).execute({ actorMemberId: host.memberId });
  clock.set(T + sec(310));
  new ResumeFishing(deps).execute({ actorMemberId: host.memberId });
  clock.set(T + sec(320));
  new RecordCatch(deps).execute({
    id: 'e11',
    actorMemberId: host.memberId,
    speciesId: rock.species.id,
    caughtAt: T + sec(315),
  });
  clock.set(T + sec(330));
  new EndFishing(deps).execute({ actorMemberId: host.memberId });
}

/** 비교 대상: 관측 가능한 파생 상태 전부 */
function observe(repo: RoomRepository) {
  const room = repo.getRoom();
  const members = repo.listMembers();
  const events = repo.listEvents();

  return {
    room,
    members,
    species: repo.listSpecies(),
    cards: repo.listCards(),
    devices: repo.listDevices(),
    events,
    ranking: computeRanking(members, events),
    counts: members.flatMap((m) =>
      repo.listSpecies().map((s) => ({
        memberId: m.id,
        speciesId: s.id,
        count: countActive(events, m.id, s.id),
      }))
    ),
    cooldowns: members.map((m) => ({
      memberId: m.id,
      remaining: cooldownRemainingMs(events, m.id, T + sec(325)),
    })),
    summary: room === null ? null : summarize(room, members, events),
    highlights: highlights(events),
  };
}

/**
 * Design §8.2 L0 #18 — **규칙 동등성 검증**.
 *
 * Option B(Clean Architecture)를 택한 근거가 바로 이것이다:
 * 같은 UseCase를 Repository 구현만 바꿔 끼워도 결과가 완전히 같아야
 * 클라이언트의 낙관적 예측이 서버 확정에 덮여 화면이 튀는 일이 없다.
 *
 * 왼쪽은 클라이언트가 쓸 메모리 구현, 오른쪽은 **진짜 DO SQLite**다.
 */
describe('RoomRepository 구현 동등성 (Design §2.0)', () => {
  it('#18 메모리 구현과 DO SQLite가 완전히 같은 상태를 만든다', async () => {
    // 왼쪽 — 클라이언트 낙관적 예측 경로
    const memRepo = new InMemoryRoomRepository();
    const memClock = new FixedClock(T);
    runScenario(
      { repo: memRepo, clock: memClock, ids: new SeqIds(), presence: new NoPresence() },
      memClock
    );
    const fromMemory = observe(memRepo);

    // 오른쪽 — 서버 확정 경로 (실제 Durable Object 안에서 실행)
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName('EQUIV-TEST'));
    const fromSqlite = await runInDurableObject(stub, (_instance, state) => {
      const sqlRepo = new SqliteRoomRepository(state.storage.sql);
      const sqlClock = new FixedClock(T);
      runScenario(
        { repo: sqlRepo, clock: sqlClock, ids: new SeqIds(), presence: new NoPresence() },
        sqlClock
      );
      return observe(sqlRepo);
    });

    expect(fromSqlite.room).toEqual(fromMemory.room);
    expect(fromSqlite.members).toEqual(fromMemory.members);
    expect(fromSqlite.species).toEqual(fromMemory.species);
    expect(fromSqlite.devices).toEqual(fromMemory.devices);
    expect(fromSqlite.events).toEqual(fromMemory.events);
    expect(fromSqlite.counts).toEqual(fromMemory.counts);
    expect(fromSqlite.cooldowns).toEqual(fromMemory.cooldowns);
    expect(fromSqlite.ranking).toEqual(fromMemory.ranking);
    expect(fromSqlite.summary).toEqual(fromMemory.summary);
    expect(fromSqlite.highlights).toEqual(fromMemory.highlights);

    // 정렬 계약(RoomRepository 주석)에 따라 카드 순서도 정확히 같아야 한다
    expect(fromSqlite.cards).toEqual(fromMemory.cards);
  });

  it('시나리오가 실제로 의미 있는 상태를 만들었는지 확인한다', () => {
    // 위 동등성 테스트가 "둘 다 비어 있어서 같다"로 통과하는 것을 막는 가드
    const repo = new InMemoryRoomRepository();
    const clock = new FixedClock(T);
    runScenario({ repo, clock, ids: new SeqIds(), presence: new NoPresence() }, clock);

    const events = repo.listEvents();
    expect(events).toHaveLength(11); // e05 재전송은 멱등으로 흡수
    expect(events.filter((e) => e.voidedAt !== null)).toHaveLength(2); // act-2, act-3
    expect(events.filter((e) => e.enteredBy !== e.memberId)).toHaveLength(2); // 대리 입력
    expect(repo.listMembers()).toHaveLength(3);
    expect(repo.listSpecies()).toHaveLength(2); // 표기 분열이 합쳐졌다
    expect(repo.getRoom()?.status).toBe('ended');
  });
});
