import { describe, it, expect, beforeEach } from 'vitest';
import {
  COOLDOWN_MS,
  canRecordCatch,
  cooldownBaseline,
  cooldownProgress,
  cooldownRemainingMs,
} from '@domain/rules/cooldown';
import { T0, katch, resetSeq, sec } from '@tests/unit/helpers/fixtures';

/**
 * Design §8.2 L0 #1~7 — 쿨다운 규칙.
 * Plan FR-10 (사람 단위 10초), FR-13 (취소 시 해제), FR-22 (대리 입력은 대상자 기준).
 */
describe('cooldown', () => {
  beforeEach(resetSeq);

  it('#1 +1 직후 9.9초 시점에는 아직 누를 수 없다', () => {
    const events = [katch({ memberId: 'm-1', caughtAt: T0 })];
    const now = T0 + 9_900;

    expect(canRecordCatch(events, 'm-1', now)).toBe(false);
    expect(cooldownRemainingMs(events, 'm-1', now)).toBe(100);
  });

  it('#2 +1 직후 정확히 10.0초가 지나면 누를 수 있다', () => {
    const events = [katch({ memberId: 'm-1', caughtAt: T0 })];
    const now = T0 + COOLDOWN_MS;

    expect(canRecordCatch(events, 'm-1', now)).toBe(true);
    expect(cooldownRemainingMs(events, 'm-1', now)).toBe(0);
  });

  it('#3 쿨다운은 사람 단위다 — 다른 어종을 눌러도 막힌다 (FR-10)', () => {
    const events = [katch({ memberId: 'm-1', speciesId: 's-rock', caughtAt: T0 })];
    const now = T0 + sec(5);

    // 어종이 달라도 같은 사람이면 쿨다운이 걸린다. 어종별 잔여시간 개념 자체가 없다.
    expect(canRecordCatch(events, 'm-1', now)).toBe(false);
  });

  it('#4 +1을 되돌리면 쿨다운 기준이 이전 유효 건으로 돌아간다 (FR-13)', () => {
    // 광어를 눌러야 하는데 우럭을 눌렀다 → 되돌리기 → 광어를 즉시 누를 수 있어야 한다
    const mistake = katch({ memberId: 'm-1', speciesId: 's-rock', caughtAt: T0 });
    const now = T0 + sec(1);

    expect(canRecordCatch([mistake], 'm-1', now)).toBe(false);

    const voided = { ...mistake, voidedAt: now };
    expect(canRecordCatch([voided], 'm-1', now)).toBe(true);
    expect(cooldownBaseline([voided], 'm-1')).toBeNull();
  });

  it('#4b 되돌린 뒤에는 그 이전 유효 건이 새 기준이 된다', () => {
    const older = katch({ memberId: 'm-1', caughtAt: T0 });
    const newer = katch({ memberId: 'm-1', caughtAt: T0 + sec(30) });
    const voidedNewer = { ...newer, voidedAt: T0 + sec(31) };

    expect(cooldownBaseline([older, voidedNewer], 'm-1')).toBe(T0);
    // 기준이 T0로 돌아갔고 이미 31초가 지났으므로 즉시 가능
    expect(canRecordCatch([older, voidedNewer], 'm-1', T0 + sec(31))).toBe(true);
  });

  it('#5 유효 건이 하나도 없으면 즉시 가능하다', () => {
    expect(cooldownBaseline([], 'm-1')).toBeNull();
    expect(cooldownRemainingMs([], 'm-1', T0)).toBe(0);
    expect(canRecordCatch([], 'm-1', T0)).toBe(true);
  });

  it('#6 방장이 대신 누르면 대상자의 쿨다운이 걸린다 (FR-22)', () => {
    // 방장(m-host)이 철수(m-1) 대신 +1 → 철수 본인이 곧바로 누르려 해도 막혀야 한다.
    // 이 규칙이 "방장이 대신 눌렀는지 모르고 또 누르는" 중복 입력을 막아준다.
    const proxied = katch({ memberId: 'm-1', enteredBy: 'm-host', caughtAt: T0 });
    const now = T0 + sec(3);

    expect(canRecordCatch([proxied], 'm-1', now)).toBe(false);
  });

  it('#7 대리 입력은 방장 본인 쿨다운에는 영향이 없다 (FR-22)', () => {
    const proxied = katch({ memberId: 'm-1', enteredBy: 'm-host', caughtAt: T0 });

    expect(canRecordCatch([proxied], 'm-host', T0 + sec(1))).toBe(true);
  });

  it('진행률은 0에서 1로 선형 증가한다 (UI 원형 게이지)', () => {
    const events = [katch({ memberId: 'm-1', caughtAt: T0 })];

    expect(cooldownProgress(events, 'm-1', T0)).toBe(0);
    expect(cooldownProgress(events, 'm-1', T0 + sec(5))).toBeCloseTo(0.5, 5);
    expect(cooldownProgress(events, 'm-1', T0 + sec(10))).toBe(1);
    expect(cooldownProgress(events, 'm-1', T0 + sec(20))).toBe(1);
  });

  it('여러 이벤트 중 가장 최근 유효 건이 기준이다', () => {
    const events = [
      katch({ memberId: 'm-1', caughtAt: T0 }),
      katch({ memberId: 'm-1', caughtAt: T0 + sec(60) }),
      katch({ memberId: 'm-2', caughtAt: T0 + sec(90) }), // 다른 사람은 무관
    ];

    expect(cooldownBaseline(events, 'm-1')).toBe(T0 + sec(60));
  });
});
