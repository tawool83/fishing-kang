import type { Env } from './env';
import { errorJson } from './env';
import { handleApi } from './http-router';

export { RoomDurableObject } from './room-do';

/**
 * Worker 엔트리 (Design §2.1).
 *
 * 정적 자산 + API + DO 프록시를 한 번에 배포한다. 정적 요청은 무료라
 * 무료 플랜 한도를 API·DO 쪽에 온전히 쓸 수 있다 (Plan §7.2).
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch {
        return errorJson(500, 'INTERNAL', '잠시 후 다시 시도해주세요.');
      }
    }

    if (env.ASSETS === undefined) {
      // 테스트 환경에는 정적 자산 바인딩이 없다
      return new Response('Not found', { status: 404 });
    }

    const response = await env.ASSETS.fetch(request);

    // Plan §9 / Design §7 — 방 페이지는 검색에 노출되지 않는다
    if (url.pathname.startsWith('/r/')) {
      const headers = new Headers(response.headers);
      headers.set('X-Robots-Tag', 'noindex');
      return new Response(response.body, { status: response.status, headers });
    }

    return response;
  },
};
