import { describe, it, expect } from 'vitest';
import { DomainError } from '@domain/errors';
import { AddSpecies } from '@application/usecases/species/AddSpecies';
import { HideCard } from '@application/usecases/species/HideCard';
import { RemoveCard } from '@application/usecases/species/RemoveCard';
import { RecordCatch } from '@application/usecases/catch/RecordCatch';
import { GetRoomStats } from '@application/usecases/stats/GetRoomStats';
import { harness, roomFixture } from '@tests/unit/helpers/usecase-fixtures';
import { CreateRoom } from '@application/usecases/room/CreateRoom';
import { JoinRoom } from '@application/usecases/room/JoinRoom';
import { T0, min } from '@tests/unit/helpers/fixtures';

describe('AddSpecies', () => {
  it('같은 이름이면 방 사전의 기존 어종을 재사용한다 (FR-07)', () => {
    const h = harness();
    const host = new CreateRoom(h.deps).execute({
      code: 'K7QM4X',
      roomName: '태안 선상',
      displayName: '홍길동',
      deviceId: 'dev-1',
      uaLabel: null,
    });
    const guest = new JoinRoom(h.deps).execute({
      displayName: '철수',
      deviceId: 'dev-2',
      uaLabel: null,
    });

    const a = new AddSpecies(h.deps).execute({
      id: 'sp-1',
      name: '우럭',
      actorMemberId: host.memberId,
    });
    // 철수가 "우 럭"을 추가 — 정규화하면 같은 어종이다
    const b = new AddSpecies(h.deps).execute({
      id: 'sp-2',
      name: '우 럭',
      actorMemberId: guest.memberId,
    });

    expect(b.reused).toBe(true);
    expect(b.species.id).toBe(a.species.id);
    expect(h.repo.listSpecies()).toHaveLength(1); // 표기 분열이 생기지 않았다
    // 카드는 사람마다 따로 생긴다
    expect(h.repo.listCards()).toHaveLength(2);
  });

  it('카드는 내 목록 끝에 추가 순서로 생긴다', () => {
    const f = roomFixture();

    const cards = f.repo.listCards().filter((c) => c.memberId === f.guestId);
    expect(cards.map((c) => c.sortOrder)).toEqual([0, 1]);
  });

  it('이미 내 카드에 있으면 아무것도 하지 않는다 (멱등)', () => {
    const f = roomFixture();

    const r = new AddSpecies(f.deps).execute({
      id: 'sp-dup',
      name: '우럭',
      actorMemberId: f.guestId,
    });

    expect(r.idempotent).toBe(true);
    expect(f.repo.listCards().filter((c) => c.memberId === f.guestId)).toHaveLength(2);
  });

  it('방장은 남의 카드도 추가할 수 있고, 일반 참여자는 못 한다', () => {
    const f = roomFixture();

    const ok = new AddSpecies(f.deps).execute({
      id: 'sp-new',
      name: '노래미',
      actorMemberId: f.hostId,
      forMemberId: f.guestId,
    });
    expect(ok.isProxy).toBe(true);
    expect(f.repo.findCard(f.guestId, ok.species.id)).not.toBeNull();

    expect(() =>
      new AddSpecies(f.deps).execute({
        id: 'sp-x',
        name: '쥐치',
        actorMemberId: f.guestId,
        forMemberId: f.hostId,
      })
    ).toThrow(DomainError);
  });
});

describe('HideCard / RemoveCard', () => {
  it('0마리 카드는 지울 수 있다 (FR-08)', () => {
    const f = roomFixture();

    new RemoveCard(f.deps).execute({ speciesId: f.rockId, actorMemberId: f.guestId });

    expect(f.repo.findCard(f.guestId, f.rockId)).toBeNull();
    // 어종 자체는 남는다 — 다른 사람이 쓰고 있을 수 있다
    expect(f.repo.findSpecies(f.rockId)).not.toBeNull();
  });

  it('기록이 있는 카드는 지울 수 없고 숨기기만 된다', () => {
    const f = roomFixture();
    new RecordCatch(f.deps).execute({
      id: 'evt-1',
      actorMemberId: f.guestId,
      speciesId: f.rockId,
      caughtAt: T0,
    });

    try {
      new RemoveCard(f.deps).execute({ speciesId: f.rockId, actorMemberId: f.guestId });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as DomainError).code).toBe('CARD_NOT_EMPTY');
    }

    new HideCard(f.deps).execute({ speciesId: f.rockId, hidden: true, actorMemberId: f.guestId });
    expect(f.repo.findCard(f.guestId, f.rockId)?.hidden).toBe(true);
  });
});

describe('GetRoomStats', () => {
  it('대리 입력 건수를 따로 센다 (FR-25)', () => {
    const f = roomFixture();

    new RecordCatch(f.deps).execute({
      id: 'e1',
      actorMemberId: f.guestId,
      speciesId: f.rockId,
      caughtAt: T0,
    });
    new RecordCatch(f.deps).execute({
      id: 'e2',
      actorMemberId: f.hostId,
      forMemberId: f.guestId,
      speciesId: f.rockId,
      caughtAt: T0 + min(1),
    });

    const stats = new GetRoomStats(f.deps).execute();

    expect(stats.summary.totalCatch).toBe(2);
    expect(stats.proxiedCount).toBe(1);
  });

  it('진행 중에도 통계를 볼 수 있다 (FR-18)', () => {
    const f = roomFixture();
    new RecordCatch(f.deps).execute({
      id: 'e1',
      actorMemberId: f.guestId,
      speciesId: f.rockId,
      caughtAt: T0,
    });

    const stats = new GetRoomStats(f.deps).execute();

    expect(f.repo.getRoom()?.status).toBe('active');
    expect(stats.ranking[0]?.memberId).toBe(f.guestId);
    expect(stats.highlights.firstCatch?.at).toBe(T0);
  });
});
