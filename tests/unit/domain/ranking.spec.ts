import { describe, it, expect, beforeEach } from 'vitest';
import { computeRanking, findRank, medalOf, podium } from '@domain/rules/ranking';
import { T0, katch, member, resetSeq, sec, streak } from '@tests/unit/helpers/fixtures';

/**
 * Design §8.2 L0 #11~12 — 공동 순위.
 * Plan FR-14 (총 마릿수 기준, 동점은 공동 순위, 0마리는 메달 없음).
 */
describe('ranking', () => {
  beforeEach(resetSeq);

  it('#11 12,12,9,9,0 → rank 1,1,3,3,5 (SQL RANK() 동등)', () => {
    const members = [
      member('m-1', '가영'),
      member('m-2', '나윤'),
      member('m-3', '다솜'),
      member('m-4', '라온'),
      member('m-5', '마루'),
    ];
    const events = [
      ...streak('m-1', 's-rock', 12, T0, sec(30)),
      ...streak('m-2', 's-rock', 12, T0, sec(30)),
      ...streak('m-3', 's-rock', 9, T0, sec(30)),
      ...streak('m-4', 's-rock', 9, T0, sec(30)),
      // m-5는 0마리
    ];

    const ranking = computeRanking(members, events);

    expect(ranking.map((e) => e.total)).toEqual([12, 12, 9, 9, 0]);
    expect(ranking.map((e) => e.rank)).toEqual([1, 1, 3, 3, 5]);
    expect(ranking.map((e) => e.tied)).toEqual([true, true, true, true, false]);
  });

  it('#11b 공동 1위 2명이면 은메달 자리는 비고 다음은 동메달이다', () => {
    const members = [member('m-1', '가영'), member('m-2', '나윤'), member('m-3', '다솜')];
    const events = [
      ...streak('m-1', 's-rock', 12, T0, sec(30)),
      ...streak('m-2', 's-rock', 12, T0, sec(30)),
      ...streak('m-3', 's-rock', 9, T0, sec(30)),
    ];

    const p = podium(computeRanking(members, events));

    expect(p.gold.map((e) => e.memberId).sort()).toEqual(['m-1', 'm-2']);
    expect(p.silver).toHaveLength(0); // 공동 1위가 2명이면 2위는 존재하지 않는다
    expect(p.bronze.map((e) => e.memberId)).toEqual(['m-3']);
  });

  it('#12 전원 0마리면 메달이 하나도 없다', () => {
    const members = [member('m-1', '가영'), member('m-2', '나윤')];

    const ranking = computeRanking(members, []);
    const p = podium(ranking);

    expect(ranking.every((e) => e.medal === null)).toBe(true);
    expect(p.gold).toHaveLength(0);
    expect(p.silver).toHaveLength(0);
    expect(p.bronze).toHaveLength(0);
  });

  it('취소된 조과는 순위에 반영되지 않는다', () => {
    const members = [member('m-1', '가영'), member('m-2', '나윤')];
    const events = [
      ...streak('m-1', 's-rock', 3, T0, sec(30)),
      katch({ memberId: 'm-1', caughtAt: T0 + sec(120), voidedAt: T0 + sec(121) }),
      ...streak('m-2', 's-rock', 3, T0, sec(30)),
    ];

    const ranking = computeRanking(members, events);

    expect(ranking.map((e) => e.total)).toEqual([3, 3]);
    expect(ranking.map((e) => e.rank)).toEqual([1, 1]);
  });

  it('단독 1·2·3위면 금·은·동이 각각 하나씩이다', () => {
    const members = [member('m-1', '가영'), member('m-2', '나윤'), member('m-3', '다솜')];
    const events = [
      ...streak('m-1', 's-rock', 5, T0, sec(30)),
      ...streak('m-2', 's-rock', 3, T0, sec(30)),
      ...streak('m-3', 's-rock', 1, T0, sec(30)),
    ];

    const ranking = computeRanking(members, events);

    expect(ranking.map((e) => e.medal)).toEqual(['gold', 'silver', 'bronze']);
    expect(ranking.every((e) => e.tied === false)).toBe(true);
  });

  it('4위 이하는 메달이 없다', () => {
    expect(medalOf(1, 5)).toBe('gold');
    expect(medalOf(2, 5)).toBe('silver');
    expect(medalOf(3, 5)).toBe('bronze');
    expect(medalOf(4, 5)).toBeNull();
    expect(medalOf(1, 0)).toBeNull(); // 0마리는 1위여도 메달 없음
  });

  it('동점자 사이 순서가 결정적이다 — 입력 순서가 달라도 결과가 같다', () => {
    const a = member('m-1', '가영');
    const b = member('m-2', '나윤');
    const events = [
      ...streak('m-1', 's-rock', 2, T0, sec(30)),
      ...streak('m-2', 's-rock', 2, T0, sec(30)),
    ];

    const r1 = computeRanking([a, b], events).map((e) => e.memberId);
    const r2 = computeRanking([b, a], events).map((e) => e.memberId);

    expect(r1).toEqual(r2);
  });

  it('폰 없는 참여자도 순위에 똑같이 나온다 (FR-24)', () => {
    const members = [member('m-1', '가영'), member('m-kid', '철수아들', false)];
    const events = [
      ...streak('m-kid', 's-rock', 4, T0, sec(30)),
      ...streak('m-1', 's-rock', 1, T0, sec(30)),
    ];

    const ranking = computeRanking(members, events);

    expect(findRank(ranking, 'm-kid')).toMatchObject({ rank: 1, medal: 'gold', total: 4 });
  });
});
