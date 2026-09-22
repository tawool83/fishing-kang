import { describe, it, expect, afterEach } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { ARCHIVE_MS, MAX_FISHING_MS } from '@domain/rules/roomLifecycle';
import { SqliteRoomRepository } from '@infrastructure/worker/SqliteRoomRepository';
import { closeAllSockets, createRoom } from './helpers';

afterEach(closeAllSockets);

/** runInDurableObject가 넘겨주는 인스턴스는 넓은 유니온 타입이라 좁혀서 호출한다 */
async function callAlarm(instance: unknown): Promise<void> {
  await (instance as { alarm: () => Promise<void> }).alarm();
}

/** 방 생성 시각을 과거로 옮긴다 — 3일·7일을 진짜로 기다릴 수는 없다 */
function backdateCreation(sql: SqlStorage, by: number): void {
  sql.exec('UPDATE room SET created_at = created_at - ?, last_activity_at = last_activity_at - ?', by, by);
}

/**
 * Design §8.3 L1 #17 — 방 수명 (Plan FR-30~33).
 *
 * 2026-09-22 확정: 낚시 최대 3일 → 자동 종료 → 정정 24h → 열람 7일 → 삭제.
 * 알람은 하나뿐이라 "지금 방 상태에서 다음 마감이 무엇인가"를 매번 다시 판정한다.
 */
describe('방 수명 알람', () => {
  it('#17 3일이 지나면 alarm이 낚시를 자동 종료한다', async () => {
    const { room } = await createRoom();
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(room.code));

    await runInDurableObject(stub, async (instance, state) => {
      const repo = new SqliteRoomRepository(state.storage.sql);
      expect(repo.getRoom()?.status).toBe('active');

      backdateCreation(state.storage.sql, MAX_FISHING_MS + 1000);
      await callAlarm(instance);

      const after = repo.getRoom();
      expect(after?.status).toBe('ended');
      // 종료 시각은 알람이 울린 시각이 아니라 예정 시각이다 (지연이 섞이면 안 된다)
      expect(after?.endedAt).toBe((after?.createdAt ?? 0) + MAX_FISHING_MS);
      // 데이터는 그대로 남아 있다 — 결과를 봐야 하기 때문이다
      expect(repo.listMembers()).toHaveLength(1);
    });
  });

  it('자동 종료 뒤에는 삭제 알람으로 갈아 끼운다', async () => {
    const { room } = await createRoom();
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(room.code));

    await runInDurableObject(stub, async (instance, state) => {
      backdateCreation(state.storage.sql, MAX_FISHING_MS + 1000);
      await callAlarm(instance);

      const repo = new SqliteRoomRepository(state.storage.sql);
      const endedAt = repo.getRoom()?.endedAt ?? 0;
      await expect(state.storage.getAlarm()).resolves.toBe(endedAt + ARCHIVE_MS);
    });
  });

  it('종료 후 7일이 지나면 데이터가 전부 삭제된다', async () => {
    const { room } = await createRoom();
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(room.code));

    await runInDurableObject(stub, async (instance, state) => {
      const repo = new SqliteRoomRepository(state.storage.sql);
      // 8일 전에 종료된 방
      repo.setRoomStatus('ended', Date.now() - ARCHIVE_MS - 86_400_000);

      await callAlarm(instance);

      expect(repo.getRoom()).toBeNull();
      expect(repo.listMembers()).toEqual([]);
      expect(repo.listEvents()).toEqual([]);
    });
  });

  it('종료 후 7일이 안 됐으면 결과를 남겨두고 다시 예약한다', async () => {
    const { room } = await createRoom();
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(room.code));

    await runInDurableObject(stub, async (instance, state) => {
      const repo = new SqliteRoomRepository(state.storage.sql);
      const endedAt = Date.now() - 86_400_000; // 어제 종료
      repo.setRoomStatus('ended', endedAt);

      await callAlarm(instance);

      expect(repo.getRoom()).not.toBeNull();
      expect(repo.listMembers()).toHaveLength(1);
      await expect(state.storage.getAlarm()).resolves.toBe(endedAt + ARCHIVE_MS);
    });
  });

  it('아직 낚시 중이면 아무것도 건드리지 않고 자동 종료 시각으로 예약한다', async () => {
    const { room } = await createRoom();
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(room.code));

    await runInDurableObject(stub, async (instance, state) => {
      const repo = new SqliteRoomRepository(state.storage.sql);
      backdateCreation(state.storage.sql, 86_400_000); // 어제 시작

      await callAlarm(instance);

      const after = repo.getRoom();
      expect(after?.status).toBe('active');
      await expect(state.storage.getAlarm()).resolves.toBe(
        (after?.createdAt ?? 0) + MAX_FISHING_MS
      );
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
