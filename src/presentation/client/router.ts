import { signal } from '@preact/signals';
import { isValidCode, normalizeCodeInput } from '@domain/rules/inviteCode';

export type Route =
  | { name: 'home' }
  | { name: 'created'; code: string }
  | { name: 'join'; code: string }
  | { name: 'room'; code: string };

export const route = signal<Route>(parse(location.pathname));

/**
 * 아주 작은 경로 라우터.
 *
 *   /                 홈
 *   /r/:CODE          입장 (단톡방에 뿌리는 공유 링크)
 *   /room/:CODE/new   방 생성 완료
 *   /room/:CODE       조과 화면
 *
 * 라우터 라이브러리를 쓰지 않는다 — 경로가 4개뿐이고 번들 예산이 빠듯하다
 * (Plan NFR: gzip 150KB).
 */
export function parse(pathname: string): Route {
  const shared = /^\/r\/([^/]+)\/?$/.exec(pathname);
  if (shared !== null) {
    const code = normalizeCodeInput(shared[1] ?? '');
    return { name: 'join', code: isValidCode(code) ? code : '' };
  }

  const created = /^\/room\/([^/]+)\/new\/?$/.exec(pathname);
  if (created !== null) {
    return { name: 'created', code: normalizeCodeInput(created[1] ?? '') };
  }

  const room = /^\/room\/([^/]+)\/?$/.exec(pathname);
  if (room !== null) {
    return { name: 'room', code: normalizeCodeInput(room[1] ?? '') };
  }

  return { name: 'home' };
}

export function pathOf(target: Route): string {
  switch (target.name) {
    case 'home':
      return '/';
    case 'join':
      return `/r/${target.code}`;
    case 'created':
      return `/room/${target.code}/new`;
    case 'room':
      return `/room/${target.code}`;
  }
}

export function navigate(target: Route, replace = false): void {
  const path = pathOf(target);
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  route.value = target;
}

export function startRouter(): void {
  addEventListener('popstate', () => {
    route.value = parse(location.pathname);
  });
}
