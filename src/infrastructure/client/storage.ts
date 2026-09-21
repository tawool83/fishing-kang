/**
 * 저장소 백엔드 추상화.
 *
 * `localStorage`·IndexedDB·`WebSocket` 같은 브라우저 전역을 어댑터가 직접 잡지 않고
 * 이 인터페이스로 주입받는다. 그래야 오프라인 대기열이나 기기 ID 복구처럼
 * **눈으로 검증하기 어려운 로직**을 jsdom 없이 node에서 그대로 테스트할 수 있다.
 */
export interface SyncKeyValue {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface AsyncKeyValue {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** 저장소가 없거나 막힌 환경(시크릿 모드, 사파리 차단)용 — 조용히 실패한다 */
export class NullKeyValue implements SyncKeyValue {
  get(): string | null {
    return null;
  }
  set(): void {
    /* no-op */
  }
  remove(): void {
    /* no-op */
  }
}

export class MemoryKeyValue implements SyncKeyValue {
  private readonly map = new Map<string, string>();

  get(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.map.set(key, value);
  }
  remove(key: string): void {
    this.map.delete(key);
  }
}

/** SyncKeyValue를 비동기 인터페이스로 감싼다 (테스트·폴백용) */
export class AsyncFromSync implements AsyncKeyValue {
  constructor(private readonly inner: SyncKeyValue) {}

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.inner.get(key));
  }
  set(key: string, value: string): Promise<void> {
    this.inner.set(key, value);
    return Promise.resolve();
  }
  remove(key: string): Promise<void> {
    this.inner.remove(key);
    return Promise.resolve();
  }
}

/**
 * `localStorage` 어댑터.
 *
 * 사파리 시크릿 모드나 저장소 차단 상태에서는 접근만 해도 예외가 난다.
 * 전부 삼키고 없는 것처럼 동작한다 — 저장소가 없다고 앱이 멈추면 안 된다.
 */
export function browserLocalStorage(): SyncKeyValue {
  try {
    const probe = '__gt_probe__';
    globalThis.localStorage.setItem(probe, '1');
    globalThis.localStorage.removeItem(probe);
  } catch {
    return new NullKeyValue();
  }

  return {
    get(key) {
      try {
        return globalThis.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        globalThis.localStorage.setItem(key, value);
      } catch {
        /* 용량 초과·차단 — 무시 */
      }
    },
    remove(key) {
      try {
        globalThis.localStorage.removeItem(key);
      } catch {
        /* 무시 */
      }
    },
  };
}

const IDB_NAME = 'gangtaegong';
const IDB_STORE = 'kv';

/**
 * IndexedDB 어댑터 — 3중 저장의 마지막 축.
 *
 * Design Ref: §3.5 — 사파리가 오래 안 쓴 사이트의 스크립트 저장소를 지울 때
 * localStorage와 IndexedDB가 같이 날아가는 경우가 많지만, 항상 그렇지는 않다.
 * 하나라도 살아있으면 복구되므로 넣어둘 값이 있다.
 */
export function browserIndexedDb(): AsyncKeyValue {
  const open = (): Promise<IDBDatabase | null> =>
    new Promise((resolve) => {
      try {
        const request = globalThis.indexedDB.open(IDB_NAME, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore(IDB_STORE);
        };
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          resolve(null);
        };
        request.onblocked = () => {
          resolve(null);
        };
      } catch {
        resolve(null);
      }
    });

  const run = <T>(
    mode: IDBTransactionMode,
    body: (store: IDBObjectStore) => IDBRequest,
    fallback: T
  ): Promise<T> =>
    open().then(
      (db) =>
        new Promise<T>((resolve) => {
          if (db === null) {
            resolve(fallback);
            return;
          }
          try {
            const tx = db.transaction(IDB_STORE, mode);
            const request = body(tx.objectStore(IDB_STORE));
            request.onsuccess = () => {
              resolve((request.result as T) ?? fallback);
            };
            request.onerror = () => {
              resolve(fallback);
            };
          } catch {
            resolve(fallback);
          }
        })
    );

  return {
    get: (key) => run<string | null>('readonly', (s) => s.get(key), null),
    set: (key, value) =>
      run<unknown>('readwrite', (s) => s.put(value, key), null).then(() => undefined),
    remove: (key) => run<unknown>('readwrite', (s) => s.delete(key), null).then(() => undefined),
  };
}
