import { render } from 'preact';
import './styles/global.css';
import { App } from './App';
import { startRouter } from './router';
import { deviceStore } from './services';

/**
 * 앱 진입점.
 *
 * Plan FR-29 — 화면을 그리기 전에 기기 ID를 먼저 해석한다.
 * 그래야 첫 요청부터 "이 기기가 이미 멤버인지"를 서버가 판단할 수 있다 (FR-03).
 *
 * 실패해도 앱은 뜬다 — 오프라인이거나 저장소가 막혀 있어도
 * 이름 선택 복구 경로가 남아 있기 때문이다 (Design §3.5).
 */
async function boot(): Promise<void> {
  try {
    await deviceStore.read();
  } catch {
    /* 기기 ID 없이도 진행한다 */
  }

  registerServiceWorker();
  startRouter();

  const root = document.getElementById('app');
  if (root !== null) render(<App />, root);
}

/**
 * 앱 셸 캐싱 (Design §6-8).
 *
 * 등록 실패는 무시한다 — 서비스 워커가 없어도 앱은 완전히 동작한다.
 * 얻는 건 "전파 없는 곳에서 페이지가 열린다" 하나뿐이고, 그건 보너스다.
 */
function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  // dev 서버에서는 등록하지 않는다 — HMR과 충돌한다
  if (import.meta.env.DEV) return;

  addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

void boot();
