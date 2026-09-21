import { describe, it, expect, beforeEach } from 'vitest';
import { HALF_HOUR_MS } from '@domain/entities/common';
import {
  cumulativeSeries,
  memberBySpeciesMatrix,
  perMember,
  perSpecies,
  summarize,
  timeBuckets,
} from '@domain/stats/aggregate';
import { highlights } from '@domain/stats/highlights';
import { T0, katch, member, min, resetSeq, room, sec, species, streak } from '@tests/unit/helpers/fixtures';

/**
 * Design §8.2 L0 #19~20 — 통계 집계와 하이라이트.
 * Plan FR-27 (표·차트), FR-28 (하이라이트).
 */
describe('stats/aggregate', () => {
  beforeEach(resetSeq);

  const members = [member('m-1', '가영'), member('m-2', '나윤')];
  const dict = [species('s-rock', '우럭'), species('s-flat', '광어')];

  it('#19 30분 경계 전후 이벤트가 올바른 버킷에 들어간다', () => {
    // 버킷 시작을 epoch 기준으로 맞춘 뒤 경계 직전/직후에 하나씩 둔다
    const base = Math.floor(T0 / HALF_HOUR_MS) * HALF_HOUR_MS;
    const events = [
      katch({ memberId: 'm-1', caughtAt: base + 1 }), // 버킷 0
      katch({ memberId: 'm-1', caughtAt: base + HALF_HOUR_MS - 1 }), // 버킷 0 (경계 직전)
      katch({ memberId: 'm-2', caughtAt: base + HALF_HOUR_MS }), // 버킷 1 (경계 정각)
    ];

    const buckets = timeBuckets(events);

    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({ bucketStart: base, total: 2 });
    expect(buckets[0]!.byMember['m-1']).toBe(2);
    expect(buckets[1]).toMatchObject({ bucketStart: base + HALF_HOUR_MS, total: 1 });
    expect(buckets[1]!.byMember['m-2']).toBe(1);
  });

  it('#19b 중간에 빈 버킷도 0으로 채워 막대 그래프에 구멍이 생기지 않는다', () => {
    const base = Math.floor(T0 / HALF_HOUR_MS) * HALF_HOUR_MS;
    const events = [
      katch({ caughtAt: base + 1 }),
      katch({ caughtAt: base + HALF_HOUR_MS * 3 + 1 }), // 두 버킷 건너뜀
    ];

    const buckets = timeBuckets(events);

    expect(buckets).toHaveLength(4);
    expect(buckets.map((b) => b.total)).toEqual([1, 0, 0, 1]);
  });

  it('조과가 없으면 빈 배열이다', () => {
    expect(timeBuckets([])).toEqual([]);
    expect(cumulativeSeries([])).toEqual([]);
  });

  it('취소된 조과는 모든 집계에서 빠진다', () => {
    const events = [
      ...streak('m-1', 's-rock', 3, T0, min(1)),
      katch({ memberId: 'm-1', speciesId: 's-rock', caughtAt: T0 + min(5), voidedAt: T0 + min(6) }),
      ...streak('m-2', 's-flat', 2, T0, min(1)),
    ];

    expect(perMember(members, events).map((r) => r.total)).toEqual([3, 2]);
    expect(perSpecies(dict, events)).toEqual([
      { id: 's-rock', name: '우럭', total: 3 },
      { id: 's-flat', name: '광어', total: 2 },
    ]);
  });

  it('summarize는 첫 수부터 종료까지를 출조 시간으로 본다', () => {
    const events = streak('m-1', 's-rock', 3, T0, min(30));
    const ended = room({ status: 'ended', endedAt: T0 + min(90) });

    const s = summarize(ended, members, events);

    expect(s.totalCatch).toBe(3);
    expect(s.memberCount).toBe(2);
    expect(s.speciesCount).toBe(1); // 실제로 잡힌 어종만
    expect(s.firstCaughtAt).toBe(T0);
    expect(s.lastCaughtAt).toBe(T0 + min(60));
    expect(s.durationMs).toBe(min(90));
  });

  it('진행 중인 방은 마지막 조과까지를 출조 시간으로 본다', () => {
    const events = streak('m-1', 's-rock', 3, T0, min(30));

    expect(summarize(room(), members, events).durationMs).toBe(min(60));
  });

  it('조과가 하나도 없으면 출조 시간은 0이다', () => {
    const s = summarize(room(), members, []);

    expect(s.durationMs).toBe(0);
    expect(s.firstCaughtAt).toBeNull();
  });

  it('사람 × 어종 매트릭스가 행·열 순서대로 채워진다', () => {
    const events = [
      ...streak('m-1', 's-rock', 3, T0, min(1)),
      ...streak('m-1', 's-flat', 1, T0 + min(10), min(1)),
      ...streak('m-2', 's-flat', 2, T0, min(1)),
    ];

    const m = memberBySpeciesMatrix(members, dict, events);

    expect(m.memberIds).toEqual(['m-1', 'm-2']);
    expect(m.speciesIds).toEqual(['s-rock', 's-flat']);
    expect(m.rows).toEqual([
      [3, 1], // 가영: 우럭 3, 광어 1
      [0, 2], // 나윤: 우럭 0, 광어 2
    ]);
  });

  it('누적 추이는 조과마다 한 점씩 쌓인다', () => {
    const events = [
      katch({ memberId: 'm-1', caughtAt: T0 }),
      katch({ memberId: 'm-2', caughtAt: T0 + min(1) }),
      katch({ memberId: 'm-1', caughtAt: T0 + min(2) }),
    ];

    const pts = cumulativeSeries(events);

    expect(pts).toHaveLength(3);
    expect(pts[2]!.byMember).toEqual({ 'm-1': 2, 'm-2': 1 });
  });
});

describe('stats/highlights', () => {
  beforeEach(resetSeq);

  it('#20 첫 수·마지막 수를 정확히 집어낸다', () => {
    const events = [
      katch({ memberId: 'm-2', speciesId: 's-flat', caughtAt: T0 + min(50) }),
      katch({ memberId: 'm-1', speciesId: 's-rock', caughtAt: T0 }),
      katch({ memberId: 'm-1', speciesId: 's-rock', caughtAt: T0 + min(20) }),
    ];

    const h = highlights(events);

    expect(h.firstCatch).toMatchObject({ memberId: 'm-1', at: T0 });
    expect(h.lastCatch).toMatchObject({ memberId: 'm-2', at: T0 + min(50) });
  });

  it('#20b 역전 횟수를 센다', () => {
    // m-1이 1마리로 앞섬 → m-2가 2마리로 역전 → m-1이 3마리로 재역전 = 2회
    const events = [
      katch({ memberId: 'm-1', caughtAt: T0 + sec(10) }),
      katch({ memberId: 'm-2', caughtAt: T0 + sec(20) }), // 1:1 동점 — 선두 집합이 겹치므로 역전 아님
      katch({ memberId: 'm-2', caughtAt: T0 + sec(30) }), // m-2 단독 선두 → 역전 1
      katch({ memberId: 'm-1', caughtAt: T0 + sec(40) }), // 2:2 동점 — 겹침
      katch({ memberId: 'm-1', caughtAt: T0 + sec(50) }), // m-1 단독 선두 → 역전 2
    ];

    expect(highlights(events).leadChanges).toBe(2);
  });

  it('#20c 혼자 계속 1위면 역전이 0회다', () => {
    const events = streak('m-1', 's-rock', 5, T0, sec(30));

    expect(highlights(events).leadChanges).toBe(0);
  });

  it('피크 타임은 가장 많이 잡힌 30분이다', () => {
    const base = Math.floor(T0 / HALF_HOUR_MS) * HALF_HOUR_MS;
    const events = [
      katch({ caughtAt: base + 1 }),
      ...streak('m-2', 's-rock', 4, base + HALF_HOUR_MS + 1, sec(60)),
    ];

    expect(highlights(events).peakBucket).toEqual({
      bucketStart: base + HALF_HOUR_MS,
      total: 4,
    });
  });

  it('최다 어종과 가장 다양하게 잡은 사람을 찾는다', () => {
    const events = [
      ...streak('m-1', 's-rock', 4, T0, min(1)),
      ...streak('m-1', 's-flat', 1, T0 + min(10), min(1)),
      ...streak('m-1', 's-gree', 1, T0 + min(20), min(1)),
      ...streak('m-2', 's-rock', 2, T0, min(1)),
    ];

    const h = highlights(events);

    expect(h.topSpecies).toEqual({ speciesId: 's-rock', total: 6 });
    expect(h.mostDiverseMember).toEqual({ memberId: 'm-1', speciesCount: 3 });
  });

  it('최단 간격은 같은 사람의 연속 두 건 사이를 본다', () => {
    const events = [
      katch({ memberId: 'm-1', caughtAt: T0 }),
      katch({ memberId: 'm-2', caughtAt: T0 + sec(2) }), // 다른 사람이라 간격 계산 대상 아님
      katch({ memberId: 'm-1', caughtAt: T0 + sec(12) }), // m-1 간격 12초
      katch({ memberId: 'm-1', caughtAt: T0 + sec(23) }), // m-1 간격 11초 ← 최단
    ];

    expect(highlights(events).shortestGap).toEqual({
      memberId: 'm-1',
      gapMs: sec(11),
      at: T0 + sec(23),
    });
  });

  it('조과가 없으면 하이라이트가 전부 비어 있다', () => {
    const h = highlights([]);

    expect(h.firstCatch).toBeNull();
    expect(h.lastCatch).toBeNull();
    expect(h.peakBucket).toBeNull();
    expect(h.topSpecies).toBeNull();
    expect(h.mostDiverseMember).toBeNull();
    expect(h.shortestGap).toBeNull();
    expect(h.leadChanges).toBe(0);
  });

  it('조과가 한 건뿐이면 최단 간격이 없다', () => {
    expect(highlights([katch({ memberId: 'm-1', caughtAt: T0 })]).shortestGap).toBeNull();
  });
});
