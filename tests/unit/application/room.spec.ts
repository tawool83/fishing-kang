import { describe, it, expect } from 'vitest';
import { DomainError } from '@domain/errors';
import { CreateRoom } from '@application/usecases/room/CreateRoom';
import { JoinRoom } from '@application/usecases/room/JoinRoom';
import { ClaimMember } from '@application/usecases/room/ClaimMember';
import { AddPhonelessMember } from '@application/usecases/room/AddPhonelessMember';
import { EndFishing } from '@application/usecases/room/EndFishing';
import { ResumeFishing } from '@application/usecases/room/ResumeFishing';
import { RecordCatch } from '@application/usecases/catch/RecordCatch';
import { computeRanking } from '@domain/rules/ranking';
import { harness, roomFixture } from '@tests/unit/helpers/usecase-fixtures';
import { T0 } from '@tests/unit/helpers/fixtures';

describe('CreateRoom', () => {
  it('만든 사람이 방장이 되고 기기가 연결된다 (FR-01)', () => {
    const h = harness();

    const r = new CreateRoom(h.deps).execute({
      code: 'K7QM4X',
      roomName: '9월 27일 태안 선상',
      displayName: '홍길동',
      deviceId: 'dev-1',
      uaLabel: 'iPhone · Safari',
    });

    expect(r.isHost).toBe(true);
    expect(h.repo.getRoom()?.hostMemberId).toBe(r.memberId);
    expect(h.repo.findDevice('dev-1')?.memberId).toBe(r.memberId);
  });

  it('이미 방이 있으면 거부한다 — 라우터가 다른 코드로 재시도한다', () => {
    const f = roomFixture();

    expect(() =>
      new CreateRoom(f.deps).execute({
        code: 'OTHER1',
        roomName: '다른 방',
        displayName: '누군가',
        deviceId: 'dev-9',
        uaLabel: null,
      })
    ).toThrow(DomainError);
  });

  it('이름이 비었거나 너무 길면 거부한다', () => {
    const h = harness();
    const uc = new CreateRoom(h.deps);

    expect(() =>
      uc.execute({
        code: 'K7QM4X',
        roomName: '방',
        displayName: '   ',
        deviceId: 'dev-1',
        uaLabel: null,
      })
    ).toThrow(DomainError);
  });
});

describe('JoinRoom', () => {
  it('정규화 기준으로 이름이 중복되면 거부한다 (FR-06)', () => {
    const f = roomFixture();

    try {
      // "철수"가 이미 있다. "철 수"도 같은 이름으로 본다
      new JoinRoom(f.deps).execute({
        displayName: '철 수',
        deviceId: 'dev-3',
        uaLabel: null,
      });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as DomainError).code).toBe('NAME_TAKEN');
    }
  });

  it('종료된 방에는 새로 참여할 수 없다', () => {
    const f = roomFixture();
    new EndFishing(f.deps).execute({ actorMemberId: f.hostId });

    try {
      new JoinRoom(f.deps).execute({ displayName: '영희', deviceId: 'dev-3', uaLabel: null });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as DomainError).code).toBe('ROOM_ENDED');
    }
  });
});

describe('ClaimMember', () => {
  it('처음 보는 기기에서 이름을 고르면 그 멤버에 연결된다 (FR-04)', () => {
    const f = roomFixture();

    const r = new ClaimMember(f.deps).execute({
      memberId: f.guestId,
      deviceId: 'dev-new',
      uaLabel: 'iPhone · Safari',
      confirmedOnlineConflict: false,
    });

    expect(r.memberId).toBe(f.guestId);
    expect(f.repo.findDevice('dev-new')?.memberId).toBe(f.guestId);
    // 한 멤버에 기기 여러 개 — 기존 연결도 살아 있다
    expect(f.repo.findDevice('dev-guest')?.memberId).toBe(f.guestId);
  });

  it('접속 중인 이름을 고르면 확인창을 요구한다 (실수 방지, 인증 아님)', () => {
    const f = roomFixture();
    f.presence.setOnline(f.guestId, true);

    try {
      new ClaimMember(f.deps).execute({
        memberId: f.guestId,
        deviceId: 'dev-new',
        uaLabel: null,
        confirmedOnlineConflict: false,
      });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as DomainError).code).toBe('MEMBER_ONLINE');
    }
  });

  it('확인창을 통과하면 PIN 없이 연결된다 (확정: PIN 없음)', () => {
    const f = roomFixture();
    f.presence.setOnline(f.guestId, true);

    const r = new ClaimMember(f.deps).execute({
      memberId: f.guestId,
      deviceId: 'dev-new',
      uaLabel: null,
      confirmedOnlineConflict: true,
    });

    expect(r.memberId).toBe(f.guestId);
  });

  it('방장이 폰을 바꿔도 이름 선택으로 방장 권한이 따라온다', () => {
    const f = roomFixture();

    const r = new ClaimMember(f.deps).execute({
      memberId: f.hostId,
      deviceId: 'dev-newphone',
      uaLabel: null,
      confirmedOnlineConflict: false,
    });

    expect(r.isHost).toBe(true);
  });

  it('종료된 방에서도 복구할 수 있다 — 통계를 보려면 내가 누군지 알아야 한다', () => {
    const f = roomFixture();
    new EndFishing(f.deps).execute({ actorMemberId: f.hostId });

    const r = new ClaimMember(f.deps).execute({
      memberId: f.guestId,
      deviceId: 'dev-new',
      uaLabel: null,
      confirmedOnlineConflict: false,
    });

    expect(r.memberId).toBe(f.guestId);
  });
});

describe('AddPhonelessMember', () => {
  it('방장이 이름만으로 참여자를 만들 수 있다 (FR-24)', () => {
    const f = roomFixture();

    const r = new AddPhonelessMember(f.deps).execute({
      id: 'm-kid',
      name: '철수아들',
      actorMemberId: f.hostId,
    });

    const member = f.repo.findMember(r.memberId);
    expect(member?.hasDevice).toBe(false);
    expect(f.repo.listDevices().some((d) => d.memberId === r.memberId)).toBe(false);
  });

  it('폰 없는 참여자도 순위에 똑같이 나온다', () => {
    const f = roomFixture();
    new AddPhonelessMember(f.deps).execute({
      id: 'm-kid',
      name: '철수아들',
      actorMemberId: f.hostId,
    });
    new RecordCatch(f.deps).execute({
      id: 'evt-1',
      actorMemberId: f.hostId,
      forMemberId: 'm-kid',
      speciesId: f.rockId,
      caughtAt: T0,
    });

    const ranking = computeRanking(f.repo.listMembers(), f.repo.listEvents());
    expect(ranking[0]).toMatchObject({ memberId: 'm-kid', rank: 1, medal: 'gold' });
  });

  it('일반 참여자는 추가할 수 없다', () => {
    const f = roomFixture();

    try {
      new AddPhonelessMember(f.deps).execute({
        id: 'm-kid',
        name: '철수아들',
        actorMemberId: f.guestId,
      });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as DomainError).code).toBe('FORBIDDEN_PROXY');
    }
  });
});

describe('EndFishing / ResumeFishing', () => {
  it('방장만 종료할 수 있다 (FR-17)', () => {
    const f = roomFixture();

    try {
      new EndFishing(f.deps).execute({ actorMemberId: f.guestId });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as DomainError).code).toBe('FORBIDDEN_PROXY');
    }
    expect(f.repo.getRoom()?.status).toBe('active');
  });

  it('종료 → 재개 → 수정 → 재종료 흐름이 동작한다', () => {
    const f = roomFixture();

    const ended = new EndFishing(f.deps).execute({ actorMemberId: f.hostId });
    expect(f.repo.getRoom()?.status).toBe('ended');
    expect(f.repo.getRoom()?.endedAt).toBe(ended.endedAt);

    new ResumeFishing(f.deps).execute({ actorMemberId: f.hostId });
    expect(f.repo.getRoom()?.status).toBe('active');
    expect(f.repo.getRoom()?.endedAt).toBeNull();

    new RecordCatch(f.deps).execute({
      id: 'evt-fix',
      actorMemberId: f.hostId,
      speciesId: f.rockId,
      caughtAt: T0,
    });

    new EndFishing(f.deps).execute({ actorMemberId: f.hostId });
    expect(f.repo.getRoom()?.status).toBe('ended');
  });

  it('이미 종료된 방을 또 종료해도 시각이 바뀌지 않는다 (멱등)', () => {
    const f = roomFixture();
    const first = new EndFishing(f.deps).execute({ actorMemberId: f.hostId });

    f.clock.advance(60_000);
    const second = new EndFishing(f.deps).execute({ actorMemberId: f.hostId });

    expect(second.idempotent).toBe(true);
    expect(second.endedAt).toBe(first.endedAt);
  });
});
