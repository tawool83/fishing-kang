import { describe, it, expect, afterEach } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { SqliteRoomRepository } from '@infrastructure/worker/SqliteRoomRepository';
import { TtlAlarmScheduler, ttlDaysFrom } from '@infrastructure/worker/TtlAlarmScheduler';
import { closeAllSockets, createRoom } from './helpers';

afterEach(closeAllSockets);

const DAY = 86_400_000;

/** runInDurableObject가 넘겨주는 인스턴스는 넓은 유니온 타입이라 좁혀서 호출한다 */
async function callAlarm(instance: unknown): Promise<void> {
  await (instance as { alarm: () => Promise<void> }).alarm();
}

/**
 * Design §8.3 L1 #17 — 방 데이터 자동 삭제 (Plan FR-30).
 *
 * 2026-09-21 확정: 마지막 활동 후 **7일**(기획서의 90일 제안에서 변경).
 * 개인정보 최소화가 목적이다 — 출조가 끝나면 데이터의 가치가 급감한다.
 */
describe('TTL alarm', () => {
  it('마지막 활동 후 7일이 지나면 만료로 판정한다', () => {
    const ttl = new TtlAlarmScheduler({} as DurableObjectStorage, 7);
    const lastActivity = 1_790_000_000_000;

    expect(ttl.expiresAt(lastActivity)).toBe(lastActivity + 7 * DAY);
    expect(ttl.isExpired(lastActivity, lastActivity + 7 * DAY - 1)).toBe(false);
    expect(ttl.isExpired(lastActivity, lastActivity + 7 * DAY)).toBe(true);
  });

  it('잘못된 환경변수는 기본값 7일로 떨어진다', () => {
    expect(ttlDaysFrom('7')).toBe(7);
    expect(ttlDaysFrom('30')).toBe(30);
    expect(ttlDaysFrom(undefined)).toBe(7);
    expect(ttlDaysFrom('그런거없음')).toBe(7);
    expect(ttlDaysFrom('-1')).toBe(7);
  });

  it('#17 만료된 방은 alarm에서 데이터가 전부 삭제된다', async () => {
    const { room } = await createRoom();
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(room.code));

    // 마지막 활동을 8일 전으로 되돌린 뒤 alarm을 직접 돌린다
    await runInDurableObject(stub, async (instance, state) => {
      const repo = new SqliteRoomRepository(state.storage.sql);
      expect(repo.getRoom()).not.toBeNull();

      repo.touchActivity(Date.now() - 8 * DAY);
      await callAlarm(instance);

      expect(repo.getRoom()).toBeNull();
      expect(repo.listMembers()).toEqual([]);
      expect(repo.listEvents()).toEqual([]);
    });
  });

  it('아직 만료되지 않았으면 alarm이 데이터를 지우지 않고 다시 예약한다', async () => {
    const { room } = await createRoom();
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(room.code));

    await runInDurableObject(stub, async (instance, state) => {
      const repo = new SqliteRoomRepository(state.storage.sql);

      // 어제까지 활동이 있었다 — 아직 살아 있어야 한다
      repo.touchActivity(Date.now() - DAY);
      await callAlarm(instance);

      expect(repo.getRoom()).not.toBeNull();
      expect(repo.listMembers()).toHaveLength(1);
      // 만료 시각이 뒤로 밀려 다시 예약됐다
      await expect(state.storage.getAlarm()).resolves.not.toBeNull();
    });
  });

  it('방이 없으면 alarm은 아무 일도 하지 않는다', async () => {
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName('TTLEMP'));

    await expect(
      runInDurableObject(stub, async (instance) => {
        await callAlarm(instance);
      })
    ).resolves.toBeUndefined();
  });
});
