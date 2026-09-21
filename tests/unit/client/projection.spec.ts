import { describe, it, expect } from 'vitest';
import { countActive } from '@domain/rules/catchLog';
import { computeRanking } from '@domain/rules/ranking';
import type { RoomState } from '@application/ports/RoomRepository';
import type { WritableClientMessage } from '@application/dto/ws-messages';
import { FixedClock } from '@application/ports/Clock';
import { NoPresence } from '@application/ports/Presence';
import type { UseCaseDeps } from '@application/usecases/deps';
import { applyMessage, tryApplyMessage } from '@application/usecases/applyMessage';
import { ProjectionRoomRepository } from '@infrastructure/client/ProjectionRoomRepository';
import { T0, sec } from '@tests/unit/helpers/fixtures';
import { SeqIdGenerator } from '@tests/unit/helpers/usecase-fixtures';

const ME = 'm-me';
const OTHER = 'm-other';
const ROCK = 'sp-rock';

/** 서버가 내려주는 확정 상태 */
function snapshot(events: RoomState['events'] = []): RoomState {
  return {
    room: {
      code: 'K7QM4X',
      name: '태안 선상',
      hostMemberId: OTHER,
      status: 'active',
      createdAt: T0,
      endedAt: null,
      lastActivityAt: T0,
    },
    members: [
      { id: ME, displayName: '철수', normalized: '철수', joinedAt: T0, hasDevice: true },
      { id: OTHER, displayName: '홍길동', normalized: '홍길동', joinedAt: T0, hasDevice: true },
    ],
    devices: [],
    species: [{ id: ROCK, name: '우럭', normalized: '우럭', createdBy: OTHER, createdAt: T0 }],
    cards: [
      { memberId: ME, speciesId: ROCK, sortOrder: 0, hidden: false },
      { memberId: OTHER, speciesId: ROCK, sortOrder: 0, hidden: false },
    ],
    events,
  };
}

function serverEvent(id: string, memberId: string, at: number): RoomState['events'][number] {
  return {
    id,
    memberId,
    speciesId: ROCK,
    caughtAt: at,
    receivedAt: at + 30,
    voidedAt: null,
    voidActionId: null,
    enteredBy: memberId,
    voidedBy: null,
  };
}

function build() {
  const repo = new ProjectionRoomRepository();
  const clock = new FixedClock(T0);
  const deps: UseCaseDeps = { repo, clock, ids: new SeqIdGenerator(), presence: new NoPresence() };
  return { repo, clock, deps };
}

const tap = (id: string, at: number): WritableClientMessage => ({
  t: 'catch',
  id,
  speciesId: ROCK,
  at,
});

/**
 * Design §2.2.3 — 스냅샷 병합.
 * Plan 최우선 리스크의 UI 쪽 대응: 스냅샷이 와도 내 탭이 화면에서 사라지면 안 된다.
 */
describe('ProjectionRoomRepository.rebase', () => {
  it('미전송 pending이 스냅샷 위에 다시 올라간다', () => {
    const { repo, deps } = build();
    repo.rebase(snapshot(), () => undefined);

    // 오프라인 상태에서 2번 탭 (아직 서버는 모른다)
    applyMessage(deps, ME, tap('local-1', T0 + sec(1)));
    applyMessage(deps, ME, tap('local-2', T0 + sec(20)));
    expect(countActive(repo.listEvents(), ME, ROCK)).toBe(2);

    // 그 사이 다른 사람이 잡은 스냅샷이 도착
    const pending = [tap('local-1', T0 + sec(1)), tap('local-2', T0 + sec(20))];
    repo.rebase(snapshot([serverEvent('srv-1', OTHER, T0 + sec(5))]), (r) => {
      void r;
      for (const m of pending) tryApplyMessage(deps, ME, m);
    });

    // 내 2건이 사라지지 않았고, 남의 1건도 합쳐졌다
    expect(countActive(repo.listEvents(), ME, ROCK)).toBe(2);
    expect(countActive(repo.listEvents(), OTHER, ROCK)).toBe(1);
  });

  it('서버가 이미 반영한 건은 멱등으로 흡수돼 중복되지 않는다', () => {
    const { repo, deps } = build();
    repo.rebase(snapshot(), () => undefined);
    applyMessage(deps, ME, tap('evt-1', T0 + sec(1)));

    // ack를 못 받은 사이 서버는 이미 처리했다 → 스냅샷에 같은 id가 들어있다
    const pending = [tap('evt-1', T0 + sec(1))];
    repo.rebase(snapshot([serverEvent('evt-1', ME, T0 + sec(1))]), () => {
      for (const m of pending) tryApplyMessage(deps, ME, m);
    });

    expect(countActive(repo.listEvents(), ME, ROCK)).toBe(1);
  });

  it('종료된 방 스냅샷이 오면 pending 재적용이 조용히 건너뛰어진다', () => {
    const { repo, deps } = build();
    repo.rebase(snapshot(), () => undefined);

    const ended = snapshot();
    ended.room = { ...ended.room, status: 'ended', endedAt: T0 + sec(60) };
    const pending = [tap('late-1', T0 + sec(70))];

    expect(() => {
      repo.rebase(ended, () => {
        for (const m of pending) tryApplyMessage(deps, ME, m);
      });
    }).not.toThrow();

    expect(countActive(repo.listEvents(), ME, ROCK)).toBe(0);
  });

  it('확정 상태는 pending과 분리 보관된다', () => {
    const { repo, deps } = build();
    repo.rebase(snapshot([serverEvent('srv-1', OTHER, T0)]), () => undefined);

    applyMessage(deps, ME, tap('local-1', T0 + sec(1)));

    expect(repo.confirmedState()?.events).toHaveLength(1); // 서버가 아는 것만
    expect(repo.listEvents()).toHaveLength(2); // 화면에 보이는 것
  });

  it('병합 후 순위가 양쪽 조과를 모두 반영한다', () => {
    const { repo, deps } = build();
    repo.rebase(snapshot(), () => undefined);
    applyMessage(deps, ME, tap('local-1', T0 + sec(1)));
    applyMessage(deps, ME, tap('local-2', T0 + sec(20)));

    const pending = [tap('local-1', T0 + sec(1)), tap('local-2', T0 + sec(20))];
    repo.rebase(snapshot([serverEvent('srv-1', OTHER, T0 + sec(5))]), () => {
      for (const m of pending) tryApplyMessage(deps, ME, m);
    });

    const ranking = computeRanking(repo.listMembers(), repo.listEvents());
    expect(ranking[0]).toMatchObject({ memberId: ME, total: 2, rank: 1 });
    expect(ranking[1]).toMatchObject({ memberId: OTHER, total: 1, rank: 2 });
  });

  it('rebase 전에는 방이 없다', () => {
    const { repo } = build();
    expect(repo.hasRoom()).toBe(false);
    expect(repo.confirmedState()).toBeNull();
  });
});
