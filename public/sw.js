/**
 * 앱 셸 서비스 워커 (Plan §2.1, Design §6-8).
 *
 * 목적은 하나다: **전파가 없는 곳에서도 페이지가 열리게** 하는 것.
 * 화면만 뜨면 오프라인 대기열이 탭을 받아 쌓아두므로, 신호가 돌아왔을 때
 * 전송된다. 페이지 자체가 안 열리면 그 앞단이 통째로 무너진다.
 *
 * 설치 유도는 하지 않는다 — 이건 웹 서비스다 (Plan §2.1).
 * 홈 화면에 추가한 사람에게만 부수적으로 이득이 간다.
 */

const CACHE = 'gt-shell-v1';

/**
 * 정적 자산만 캐시한다.
 *
 * `/api/*`는 **절대 캐시하지 않는다** — 조과 데이터가 낡은 채로 보이면
 * 없는 것보다 나쁘다. 오프라인 시 API는 그냥 실패하고,
 * 클라이언트가 대기열·스냅샷 재요청으로 알아서 복구한다.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['/', '/manifest.webmanifest', '/icon.svg']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // 조과 데이터는 캐시 금지

  // 페이지 이동(SPA 라우트)은 네트워크 우선, 실패하면 캐시된 앱 셸
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached ?? Response.error()))
    );
    return;
  }

  // 정적 자산은 캐시 우선 (해시 파일명이라 갱신 걱정이 없다)
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached !== undefined) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
