import type { DeviceIdStore } from '@application/ports/DeviceIdStore';
import type { AsyncKeyValue, SyncKeyValue } from './storage';

export const DEVICE_KEY = 'gt.deviceId';

/** 서버에 기기 ID를 묻는다. 백업값을 주면 서버가 그걸로 쿠키를 복원한다 */
export type ResolveDeviceId = (
  backup: string | null
) => Promise<{ deviceId: string; restored: boolean }>;

/**
 * 기기 ID 3중 저장 (Plan FR-29).
 *
 * Design Ref: §3.5 — 세 축의 역할이 다르다.
 *
 *  1. **서버 발급 HttpOnly 쿠키** — JS가 읽을 수 없다. 대신 `GET /api/device`가
 *     쿠키를 보고 권위 있는 값을 돌려준다. 사파리 ITP에서 가장 오래 살아남는 축이다.
 *  2. **localStorage** — 빠르고 동기적. 쿠키가 날아갔을 때의 1차 백업.
 *  3. **IndexedDB** — localStorage와 함께 지워지는 경우가 많지만 항상은 아니다.
 *
 * 흐름: 로컬 백업을 읽어 서버에 보낸다 → 서버가 (쿠키 또는 백업값 기준으로)
 * 권위 있는 ID를 돌려준다 → 그 값을 두 로컬 저장소에 **다시 써넣는다**.
 * 그래서 하나만 살아있어도 나머지가 복구된다.
 *
 * 셋 다 날아간 경우는 "이름 선택 복구"(ClaimMember)가 메운다.
 */
export class TripleDeviceIdStore implements DeviceIdStore {
  constructor(
    private readonly local: SyncKeyValue,
    private readonly idb: AsyncKeyValue,
    private readonly resolve: ResolveDeviceId
  ) {}

  async read(): Promise<string | null> {
    const backup = await this.readLocalBackup();

    let authoritative: string;
    try {
      const result = await this.resolve(backup);
      authoritative = result.deviceId;
    } catch {
      // 오프라인이라 서버에 물어볼 수 없다. 로컬 백업이라도 있으면 그걸 쓴다.
      // (방 입장은 어차피 온라인이 필요하지만, 재입장 판단은 로컬로도 가능하다)
      return backup;
    }

    await this.write(authoritative);
    return authoritative;
  }

  async write(deviceId: string): Promise<void> {
    this.local.set(DEVICE_KEY, deviceId);
    try {
      await this.idb.set(DEVICE_KEY, deviceId);
    } catch {
      /* IndexedDB가 막혀 있어도 계속 간다 */
    }
  }

  async clear(): Promise<void> {
    this.local.remove(DEVICE_KEY);
    try {
      await this.idb.remove(DEVICE_KEY);
    } catch {
      /* 무시 */
    }
  }

  /** 두 로컬 저장소 중 살아있는 값을 찾는다 */
  private async readLocalBackup(): Promise<string | null> {
    const fromLocal = this.local.get(DEVICE_KEY);
    if (fromLocal !== null && fromLocal !== '') return fromLocal;

    try {
      const fromIdb = await this.idb.get(DEVICE_KEY);
      if (fromIdb !== null && fromIdb !== '') {
        this.local.set(DEVICE_KEY, fromIdb); // 비어 있던 쪽을 채워둔다
        return fromIdb;
      }
    } catch {
      /* 무시 */
    }
    return null;
  }
}
