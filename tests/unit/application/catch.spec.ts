import { describe, it, expect } from 'vitest';
import { DomainError } from '@domain/errors';
import { countActive } from '@domain/rules/catchLog';
import { canRecordCatch } from '@domain/rules/cooldown';
import { RecordCatch } from '@application/usecases/catch/RecordCatch';
import { VoidCatch } from '@application/usecases/catch/VoidCatch';
import { UndoCatch } from '@application/usecases/catch/UndoCatch';
import { RestoreCatch } from '@application/usecases/catch/RestoreCatch';
import { EndFishing } from '@application/usecases/room/EndFishing';
import { roomFixture } from '@tests/unit/helpers/usecase-fixtures';
import { T0, sec } from '@tests/unit/helpers/fixtures';

/**
 * Design §8.2 L0 #15~17 — UseCase 레벨 검증.
 * Plan FR-19 (멱등), FR-26 (대리 입력 권한), FR-17 (종료 잠금).
 */
describe('RecordCatch', () => {
  it('#15 같은 id로 두 번 실행해도 이벤트는 하나다 (멱등)', () => {
    const f = roomFixture();
    const uc = new RecordCatch(f.deps);
    const input = {
      id: 'evt-1',
      actorMemberId: f.guestId,
      speciesId: f.rockId,
      caughtAt: T0,
    };

    const first = uc.execute(input);
    const second = uc.execute(input);

    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(f.repo.listEvents()).toHaveLength(1);
    expect(countActive(f.repo.listEvents(), f.guestId, f.rockId)).toBe(1);
  });

  it('#16 일반 참여자가 남의 이름으로 입력하면 거부된다 (FR-26)', () => {
    const f = roomFixture();

    try {
      new RecordCatch(f.deps).execute({
        id: 'evt-1',
        actorMemberId: f.guestId, // 방장이 아님
        forMemberId: f.hostId,
        speciesId: f.rockId,
        caughtAt: T0,
      });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError);
      expect((e as DomainError).code).toBe('FORBIDDEN_PROXY');
    }
    expect(f.repo.listEvents()).toHaveLength(0);
  });

  it('#16b 방장은 남의 이름으로 입력할 수 있고, entered_by에 방장이 남는다 (FR-25)', () => {
    const f = roomFixture();

    const r = new RecordCatch(f.deps).execute({
      id: 'evt-1',
      actorMemberId: f.hostId,
      forMemberId: f.guestId,
      speciesId: f.rockId,
      caughtAt: T0,
    });

    expect(r.isProxy).toBe(true);
    expect(r.event.memberId).toBe(f.guestId); // 조과의 주인은 대상자
    expect(r.event.enteredBy).toBe(f.hostId); // 실제 입력자는 방장
  });

  it('#16c 대리 입력은 대상자의 쿨다운을 건다 (FR-22)', () => {
    const f = roomFixture();

    new RecordCatch(f.deps).execute({
      id: 'evt-1',
      actorMemberId: f.hostId,
      forMemberId: f.guestId,
      speciesId: f.rockId,
      caughtAt: T0,
    });

    const events = f.repo.listEvents();
    // 철수는 막히고, 방장 본인은 자유롭다 — 중복 입력이 자연히 차단된다
    expect(canRecordCatch(events, f.guestId, T0 + sec(3))).toBe(false);
    expect(canRecordCatch(events, f.hostId, T0 + sec(3))).toBe(true);
  });

  it('#17 종료된 방에서는 방장도 입력할 수 없다 (FR-17)', () => {
    const f = roomFixture();
    new EndFishing(f.deps).execute({ actorMemberId: f.hostId });

    try {
      new RecordCatch(f.deps).execute({
        id: 'evt-1',
        actorMemberId: f.hostId,
        speciesId: f.rockId,
        caughtAt: T0,
      });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as DomainError).code).toBe('ROOM_ENDED');
    }
  });

  it('서버는 쿨다운을 검증하지 않는다 — 오프라인 대기열이 몰려와도 전부 받는다', () => {
    // Design §1.2 — 서버가 도착 시각으로 막으면 정상 입력이 무더기로 거부된다.
    const f = roomFixture();
    const uc = new RecordCatch(f.deps);

    // 1초 간격으로 5건 (쿨다운 10초보다 훨씬 촘촘하다)
    for (let i = 0; i < 5; i += 1) {
      uc.execute({
        id: `evt-${String(i)}`,
        actorMemberId: f.guestId,
        speciesId: f.rockId,
        caughtAt: T0 + sec(i),
      });
    }

    expect(countActive(f.repo.listEvents(), f.guestId, f.rockId)).toBe(5);
  });

  it('caughtAt은 클라이언트 값 그대로, receivedAt만 서버 시각이다', () => {
    const f = roomFixture();
    f.clock.set(T0 + sec(600)); // 오프라인이었다가 10분 뒤 전송된 상황

    const r = new RecordCatch(f.deps).execute({
      id: 'evt-1',
      actorMemberId: f.guestId,
      speciesId: f.rockId,
      caughtAt: T0,
    });

    expect(r.event.caughtAt).toBe(T0);
    expect(r.event.receivedAt).toBe(T0 + sec(600));
  });

  it('카드가 없으면 만들어 준다 — addSpecies의 ack만 유실된 경우 대비', () => {
    const f = roomFixture();
    f.repo.removeCard(f.guestId, f.rockId);

    new RecordCatch(f.deps).execute({
      id: 'evt-1',
      actorMemberId: f.guestId,
      speciesId: f.rockId,
      caughtAt: T0,
    });

    expect(f.repo.findCard(f.guestId, f.rockId)).not.toBeNull();
  });
});

describe('VoidCatch / UndoCatch / RestoreCatch', () => {
  function withThreeCatches() {
    const f = roomFixture();
    const uc = new RecordCatch(f.deps);
    for (let i = 0; i < 3; i += 1) {
      uc.execute({
        id: `evt-${String(i)}`,
        actorMemberId: f.guestId,
        speciesId: f.rockId,
        caughtAt: T0 + sec(i * 30),
      });
    }
    return f;
  }

  it('−1은 가장 최근 유효 건을 취소한다', () => {
    const f = withThreeCatches();

    const r = new VoidCatch(f.deps).execute({
      actionId: 'act-1',
      actorMemberId: f.guestId,
      speciesId: f.rockId,
    });

    expect(r.event.id).toBe('evt-2');
    expect(countActive(f.repo.listEvents(), f.guestId, f.rockId)).toBe(2);
  });

  it('같은 actionId로 −1을 재전송해도 한 건만 취소된다 (멱등)', () => {
    const f = withThreeCatches();
    const uc = new VoidCatch(f.deps);
    const input = { actionId: 'act-1', actorMemberId: f.guestId, speciesId: f.rockId };

    uc.execute(input);
    const again = uc.execute(input);

    expect(again.idempotent).toBe(true);
    expect(countActive(f.repo.listEvents(), f.guestId, f.rockId)).toBe(2);
  });

  it('0마리면 −1이 거부된다', () => {
    const f = roomFixture();

    expect(() =>
      new VoidCatch(f.deps).execute({
        actionId: 'act-1',
        actorMemberId: f.guestId,
        speciesId: f.rockId,
      })
    ).toThrow(DomainError);
  });

  it('−1 → 되돌리기로 원래 상태가 복원된다', () => {
    const f = withThreeCatches();
    new VoidCatch(f.deps).execute({
      actionId: 'act-1',
      actorMemberId: f.guestId,
      speciesId: f.rockId,
    });

    new RestoreCatch(f.deps).execute({ actionId: 'act-1', actorMemberId: f.guestId });

    expect(countActive(f.repo.listEvents(), f.guestId, f.rockId)).toBe(3);
  });

  it('+1 되돌리기는 지정한 그 건만 취소한다', () => {
    const f = withThreeCatches();

    new UndoCatch(f.deps).execute({
      actionId: 'act-1',
      targetId: 'evt-0',
      actorMemberId: f.guestId,
    });

    expect(f.repo.findEvent('evt-0')?.voidedAt).not.toBeNull();
    expect(f.repo.findEvent('evt-2')?.voidedAt).toBeNull();
  });

  it('대리 입력 받은 대상자도 되돌릴 수 있다 (FR-23)', () => {
    const f = roomFixture();
    new RecordCatch(f.deps).execute({
      id: 'evt-1',
      actorMemberId: f.hostId,
      forMemberId: f.guestId,
      speciesId: f.rockId,
      caughtAt: T0,
    });

    const r = new UndoCatch(f.deps).execute({
      actionId: 'act-1',
      targetId: 'evt-1',
      actorMemberId: f.guestId, // 대상자 본인
    });

    expect(r.idempotent).toBe(false);
    expect(countActive(f.repo.listEvents(), f.guestId, f.rockId)).toBe(0);
  });

  it('남의 조과는 방장이 아니면 되돌릴 수 없다', () => {
    const f = roomFixture();
    new RecordCatch(f.deps).execute({
      id: 'evt-1',
      actorMemberId: f.hostId,
      speciesId: f.rockId,
      caughtAt: T0,
    });

    try {
      new UndoCatch(f.deps).execute({
        actionId: 'act-1',
        targetId: 'evt-1',
        actorMemberId: f.guestId,
      });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as DomainError).code).toBe('FORBIDDEN_PROXY');
    }
  });

  it('되돌리기 후 쿨다운이 즉시 풀린다 (FR-13, 어종 오타 정정 흐름)', () => {
    const f = roomFixture();
    // 광어를 눌러야 하는데 우럭을 눌렀다
    new RecordCatch(f.deps).execute({
      id: 'evt-mistake',
      actorMemberId: f.guestId,
      speciesId: f.rockId,
      caughtAt: T0,
    });
    expect(canRecordCatch(f.repo.listEvents(), f.guestId, T0 + sec(1))).toBe(false);

    new UndoCatch(f.deps).execute({
      actionId: 'act-1',
      targetId: 'evt-mistake',
      actorMemberId: f.guestId,
    });

    // 10초 기다릴 필요 없이 바로 광어를 누를 수 있어야 한다
    expect(canRecordCatch(f.repo.listEvents(), f.guestId, T0 + sec(1))).toBe(true);
  });
});
