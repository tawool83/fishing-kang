import type { Env } from './env';
import { errorJson } from './env';
import { handleApi } from './http-router';
import { ogOverridesFor } from './og';

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

    let response = await env.ASSETS.fetch(request);

    // Plan §9 / Design §7 — 방 페이지는 검색에 노출되지 않는다
    if (url.pathname.startsWith('/r/')) {
      const headers = new Headers(response.headers);
      headers.set('X-Robots-Tag', 'noindex');
      response = new Response(response.body, { status: response.status, headers });
    }

    // 기본 미리보기 카드는 index.html에 있다. 초대 링크(/r/:CODE)만 문구를
    // 초대장으로 바꿔 끼운다 (og.ts). 검색 노출(noindex)과는 별개로,
    // 카톡·라인 스크래퍼는 og:* 만 읽는다.
    const overrides = ogOverridesFor(url.pathname, env.APP_ORIGIN ?? url.origin);
    if (overrides !== null && isHtmlDocument(response)) {
      response = rewriteOgTags(response, overrides);
    }

    return response;
  },
};

function isHtmlDocument(response: Response): boolean {
  // HEAD 응답처럼 본문이 없으면 고쳐 쓸 것도 없다
  if (response.body === null) return false;
  return (response.headers.get('Content-Type') ?? '').includes('text/html');
}

function rewriteOgTags(response: Response, overrides: Map<string, string>): Response {
  return new HTMLRewriter()
    .on('meta', {
      element(meta) {
        const key = meta.getAttribute('property') ?? meta.getAttribute('name');
        if (key === null) return;

        const content = overrides.get(key);
        if (content !== undefined) meta.setAttribute('content', content);
      },
    })
    .transform(response);
}
