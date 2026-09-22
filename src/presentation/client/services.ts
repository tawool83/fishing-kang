import { HttpRoomApi } from '@infrastructure/client/HttpRoomApi';
import { TripleDeviceIdStore } from '@infrastructure/client/TripleDeviceIdStore';
import { browserIndexedDb, browserLocalStorage } from '@infrastructure/client/storage';
import { BrowserClock, ClientIdGenerator } from '@infrastructure/client/BrowserClock';
import { detectInAppBrowser } from '@infrastructure/client/InAppBrowserDetector';
import { SoundStore } from './view-models/soundStore';

/**
 * 클라이언트 **Composition Root** (Design §9.2).
 *
 * 브라우저 전역(fetch·localStorage·IndexedDB·UA)을 잡는 곳은 여기 한 군데뿐이다.
 * 나머지 코드는 전부 주입받은 인터페이스만 본다 — 그래서 jsdom 없이 테스트된다.
 */
export const api = new HttpRoomApi();

export const clock = new BrowserClock();
export const ids = new ClientIdGenerator();

export const deviceStore = new TripleDeviceIdStore(
  browserLocalStorage(),
  browserIndexedDb(),
  (backup) => api.resolveDevice(backup)
);

export const localStorageKv = browserLocalStorage();

/** Plan FR-34 — 순위가 바뀌면 딸랑딸랑. 음소거 선택은 이 기기에 남는다 */
export const soundStore = new SoundStore(localStorageKv);

/** Plan FR-05 — 카톡 인앱 브라우저 감지. 식별이 아니라 안내 목적이다 */
export const inAppBrowser = detectInAppBrowser(navigator.userAgent);

/** 이 기기에서 들어갔던 최근 방 (Design §5.4 ①) */
export interface RecentRoom {
  code: string;
  name: string;
  visitedAt: number;
}

const RECENT_KEY = 'gt.recentRooms';
const RECENT_MAX = 5;

export function readRecentRooms(): RecentRoom[] {
  const raw = localStorageKv.get(RECENT_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (r): r is RecentRoom =>
          r !== null &&
          typeof r === 'object' &&
          typeof (r as RecentRoom).code === 'string' &&
          typeof (r as RecentRoom).name === 'string'
      )
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function rememberRoom(code: string, name: string): void {
  const rest = readRecentRooms().filter((r) => r.code !== code);
  const next = [{ code, name, visitedAt: clock.now() }, ...rest].slice(0, RECENT_MAX);
  localStorageKv.set(RECENT_KEY, JSON.stringify(next));
}
