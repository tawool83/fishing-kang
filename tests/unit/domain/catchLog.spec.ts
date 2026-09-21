import { describe, it, expect, beforeEach } from 'vitest';
import {
  activeSortedByTime,
  countActive,
  countActiveTotal,
  findById,
  pickVoidTarget,
} from '@domain/rules/catchLog';
import { T0, katch, resetSeq, sec, streak } from '@tests/unit/helpers/fixtures';

/**
 * Design §8.2 L0 #8~10 — −1 대상 선택.
 * Plan FR-11 (가장 최근 1건 취소, 0마리면 불가).
 */
describe('catchLog', () => {
  beforeEach(resetSeq);

  it('#8 −1은 해당 어종의 가장 최근 유효 건만 취소한다', () => {
    const events = streak('m-1', 's-rock', 3, T0, sec(30));

    const target = pickVoidTarget(events, 'm-1', 's-rock');

    expect(target).not.toBeNull();
    expect(target!.caughtAt).toBe(T0 + sec(60)); // 3번째 = 가장 최근
  });

  it('#8b 다른 어종·다른 사람의 건은 대상이 아니다', () => {
    const events = [
      katch({ memberId: 'm-1', speciesId: 's-rock', caughtAt: T0 }),
      katch({ memberId: 'm-1', speciesId: 's-flat', caughtAt: T0 + sec(60) }), // 더 최근이지만 다른 어종
      katch({ memberId: 'm-2', speciesId: 's-rock', caughtAt: T0 + sec(90) }), // 더 최근이지만 다른 사람
    ];

    const target = pickVoidTarget(events, 'm-1', 's-rock');

    expect(target!.caughtAt).toBe(T0);
  });

  it('#8c 이미 취소된 건은 다시 대상이 되지 않는다', () => {
    const events = [
      katch({ memberId: 'm-1', caughtAt: T0 }),
      katch({ memberId: 'm-1', caughtAt: T0 + sec(30), voidedAt: T0 + sec(31) }),
    ];

    const target = pickVoidTarget(events, 'm-1', 's-rock');

    expect(target!.caughtAt).toBe(T0);
  });

  it('#9 caughtAt이 동률이면 id 사전순으로 결정적으로 고른다', () => {
    // 클라이언트 예측과 서버 확정이 반드시 같은 행을 골라야 화면이 튀지 않는다.
    const a = katch({ id: 'e-aaa', memberId: 'm-1', caughtAt: T0 });
    const b = katch({ id: 'e-zzz', memberId: 'm-1', caughtAt: T0 });

    // 배열 순서를 뒤집어도 같은 결과여야 한다
    expect(pickVoidTarget([a, b], 'm-1', 's-rock')!.id).toBe('e-zzz');
    expect(pickVoidTarget([b, a], 'm-1', 's-rock')!.id).toBe('e-zzz');
  });

  it('#10 0마리면 −1 대상이 없다 (음수 불가)', () => {
    expect(pickVoidTarget([], 'm-1', 's-rock')).toBeNull();

    const allVoided = [katch({ memberId: 'm-1', caughtAt: T0, voidedAt: T0 + sec(1) })];
    expect(pickVoidTarget(allVoided, 'm-1', 's-rock')).toBeNull();
  });

  it('countActive는 취소된 건을 세지 않는다', () => {
    const events = [
      ...streak('m-1', 's-rock', 3, T0, sec(30)),
      katch({ memberId: 'm-1', speciesId: 's-flat', caughtAt: T0 + sec(120) }),
      katch({ memberId: 'm-1', speciesId: 's-rock', caughtAt: T0 + sec(150), voidedAt: T0 + sec(151) }),
      katch({ memberId: 'm-2', speciesId: 's-rock', caughtAt: T0 + sec(180) }),
    ];

    expect(countActive(events, 'm-1', 's-rock')).toBe(3);
    expect(countActive(events, 'm-1', 's-flat')).toBe(1);
    expect(countActive(events, 'm-1')).toBe(4); // 어종 무관
    expect(countActiveTotal(events)).toBe(5);
  });

  it('activeSortedByTime은 시간 오름차순, 동률은 id 오름차순이다', () => {
    const events = [
      katch({ id: 'e-b', caughtAt: T0 + sec(10) }),
      katch({ id: 'e-a', caughtAt: T0 + sec(10) }),
      katch({ id: 'e-c', caughtAt: T0 }),
      katch({ id: 'e-d', caughtAt: T0 + sec(20), voidedAt: T0 + sec(21) }),
    ];

    expect(activeSortedByTime(events).map((e) => e.id)).toEqual(['e-c', 'e-a', 'e-b']);
  });

  it('findById는 멱등 처리의 기반이다', () => {
    const events = [katch({ id: 'e-known' })];

    expect(findById(events, 'e-known')?.id).toBe('e-known');
    expect(findById(events, 'e-unknown')).toBeNull();
  });
});
