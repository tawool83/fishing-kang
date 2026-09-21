import { describe, it, expect, vi } from 'vitest';
import { DEVICE_KEY, TripleDeviceIdStore } from '@infrastructure/client/TripleDeviceIdStore';
import { AsyncFromSync, MemoryKeyValue, NullKeyValue } from '@infrastructure/client/storage';

const SERVER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const LOCAL_ID = '11111111-2222-3333-4444-555555555555';

function build(options: {
  local?: MemoryKeyValue | NullKeyValue;
  idb?: MemoryKeyValue;
  resolve?: (backup: string | null) => Promise<{ deviceId: string; restored: boolean }>;
}) {
  const local = options.local ?? new MemoryKeyValue();
  const idbInner = options.idb ?? new MemoryKeyValue();
  const resolve =
    options.resolve ??
    ((backup: string | null) =>
      Promise.resolve({ deviceId: backup ?? SERVER_ID, restored: backup !== null }));

  const store = new TripleDeviceIdStore(local, new AsyncFromSync(idbInner), resolve);
  return { store, local, idb: idbInner };
}

/**
 * Plan FR-29 — 기기 ID 3중 저장.
 * Design §3.5 — 하나라도 살아있으면 복구하고 나머지를 다시 채운다.
 */
describe('TripleDeviceIdStore', () => {
  it('아무 것도 없으면 서버가 발급한 값을 받아 두 저장소에 써넣는다', async () => {
    const { store, local, idb } = build({});

    const id = await store.read();

    expect(id).toBe(SERVER_ID);
    expect(local.get(DEVICE_KEY)).toBe(SERVER_ID);
    expect(idb.get(DEVICE_KEY)).toBe(SERVER_ID);
  });

  it('localStorage만 살아있으면 그 값을 서버에 보내 복원한다', async () => {
    const local = new MemoryKeyValue();
    local.set(DEVICE_KEY, LOCAL_ID);
    const resolve = vi.fn((backup: string | null) =>
      Promise.resolve({ deviceId: backup ?? SERVER_ID, restored: backup !== null })
    );
    const { store, idb } = build({ local, resolve });

    const id = await store.read();

    expect(resolve).toHaveBeenCalledWith(LOCAL_ID);
    expect(id).toBe(LOCAL_ID);
    expect(idb.get(DEVICE_KEY)).toBe(LOCAL_ID); // 비어 있던 IndexedDB가 채워졌다
  });

  it('IndexedDB만 살아있어도 복구되고 localStorage가 다시 채워진다', async () => {
    const idb = new MemoryKeyValue();
    idb.set(DEVICE_KEY, LOCAL_ID);
    const { store, local } = build({ idb });

    const id = await store.read();

    expect(id).toBe(LOCAL_ID);
    expect(local.get(DEVICE_KEY)).toBe(LOCAL_ID);
  });

  it('서버 쿠키가 권위를 갖는다 — 로컬 백업과 다르면 서버 값으로 맞춘다', async () => {
    const local = new MemoryKeyValue();
    local.set(DEVICE_KEY, LOCAL_ID);
    const { store, idb } = build({
      local,
      // 서버에 쿠키가 남아 있어서 백업을 무시하고 자기 값을 돌려준 경우
      resolve: () => Promise.resolve({ deviceId: SERVER_ID, restored: false }),
    });

    const id = await store.read();

    expect(id).toBe(SERVER_ID);
    expect(local.get(DEVICE_KEY)).toBe(SERVER_ID);
    expect(idb.get(DEVICE_KEY)).toBe(SERVER_ID);
  });

  it('오프라인이면 로컬 백업으로라도 버틴다', async () => {
    const local = new MemoryKeyValue();
    local.set(DEVICE_KEY, LOCAL_ID);
    const { store } = build({
      local,
      resolve: () => Promise.reject(new Error('offline')),
    });

    await expect(store.read()).resolves.toBe(LOCAL_ID);
  });

  it('오프라인이고 로컬도 비었으면 null — 이름 선택 복구로 넘어간다', async () => {
    const { store } = build({ resolve: () => Promise.reject(new Error('offline')) });

    await expect(store.read()).resolves.toBeNull();
  });

  it('저장소가 막혀 있어도 서버 값으로 동작한다 (시크릿 모드)', async () => {
    const { store } = build({ local: new NullKeyValue() });

    await expect(store.read()).resolves.toBe(SERVER_ID);
  });

  it('clear는 두 저장소를 모두 비운다', async () => {
    const { store, local, idb } = build({});
    await store.write(SERVER_ID);

    await store.clear();

    expect(local.get(DEVICE_KEY)).toBeNull();
    expect(idb.get(DEVICE_KEY)).toBeNull();
  });

  it('빈 문자열은 유효한 백업으로 취급하지 않는다', async () => {
    const local = new MemoryKeyValue();
    local.set(DEVICE_KEY, '');
    const resolve = vi.fn(() => Promise.resolve({ deviceId: SERVER_ID, restored: false }));
    const { store } = build({ local, resolve });

    await store.read();

    expect(resolve).toHaveBeenCalledWith(null);
  });
});
