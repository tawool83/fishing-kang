export interface Env {
  ROOM_DO: DurableObjectNamespace;
  /** 정적 자산. 테스트 환경에는 없을 수 있다 */
  ASSETS?: Fetcher;
  APP_ORIGIN?: string;
  COOLDOWN_MS?: string;
}

/** Design Ref: §6.2 — 모든 HTTP 응답은 `{data}` 또는 `{error}` */
export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify({ data }), {
    ...init,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(init.headers ?? {}) },
  });
}

export function errorJson(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
  init: ResponseInit = {}
): Response {
  const body = details === undefined ? { code, message } : { code, message, details };
  return new Response(JSON.stringify({ error: body }), {
    ...init,
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(init.headers ?? {}) },
  });
}
