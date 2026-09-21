import { isValidCode, normalizeCodeInput } from '@domain/rules/inviteCode';
import { CryptoIdGenerator } from '@infrastructure/worker/CryptoIdGenerator';
import {
  deviceCookie,
  readBackupHeader,
  readDeviceCookie,
} from '@infrastructure/worker/DeviceCookieStore';
import type { Env } from './env';
import { errorJson, json } from './env';

const ids = new CryptoIdGenerator();

/** 초대코드 충돌 시 재시도 횟수. 32^6 ≈ 10억이라 실제로는 1회로 끝난다 */
const CODE_ATTEMPTS = 5;

/**
 * Design Ref: §4.1 — HTTP 엔드포인트.
 *
 * 방 관련 요청은 전부 DO로 위임한다. 워커가 직접 하는 일은 둘뿐이다:
 *  1. 기기 ID 쿠키 해석·발급 (DO가 쿠키를 모르게 한다)
 *  2. 방 생성 시 초대코드 채번과 충돌 재시도 (DO 이름이 코드라서 DO 바깥에서만 가능)
 */
export async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;

  if (path === '/api/device' && request.method === 'GET') {
    return handleDevice(request);
  }

  if (path === '/api/rooms' && request.method === 'POST') {
    return handleCreateRoom(request, env);
  }

  const roomMatch = /^\/api\/rooms\/([^/]+)(\/.*)?$/.exec(path);
  if (roomMatch !== null) {
    const rawCode = roomMatch[1] ?? '';
    const sub = roomMatch[2] ?? '';
    return forwardToRoom(request, env, rawCode, sub);
  }

  return errorJson(404, 'NOT_FOUND', '경로를 찾을 수 없어요.');
}

/**
 * Plan FR-29 — 기기 ID 발급/복구.
 *
 * 쿠키가 있으면 그대로, 없고 클라이언트가 localStorage/IndexedDB 백업값을 보내면
 * 그 값으로 쿠키를 복원한다. 둘 다 없으면 새로 발급한다.
 */
function handleDevice(request: Request): Response {
  const existing = readDeviceCookie(request);
  if (existing !== null) {
    return json({ deviceId: existing, restored: false });
  }

  const backup = readBackupHeader(request);
  const deviceId = backup ?? ids.uuid();

  return json(
    { deviceId, restored: backup !== null },
    { headers: { 'Set-Cookie': deviceCookie(deviceId) } }
  );
}

async function handleCreateRoom(request: Request, env: Env): Promise<Response> {
  const { deviceId, setCookie } = resolveDevice(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const code = ids.inviteCode();
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(code));

    const response = await stub.fetch('https://do/create', {
      method: 'POST',
      headers: deviceHeaders(request, deviceId),
      body: JSON.stringify({ ...body, code }),
    });

    if (response.status === 409) continue; // 코드 충돌 — 다른 코드로 재시도

    if (!response.ok) return withCookie(response, setCookie);

    const payload = (await response.json()) as { data: { memberId: string; isHost: boolean } };
    const origin = env.APP_ORIGIN ?? new URL(request.url).origin;

    return withCookie(
      json(
        {
          code,
          memberId: payload.data.memberId,
          isHost: payload.data.isHost,
          shareUrl: `${origin}/r/${code}`,
        },
        { status: 201 }
      ),
      setCookie
    );
  }

  return errorJson(503, 'INTERNAL', '방을 만들지 못했어요. 다시 시도해주세요.');
}

async function forwardToRoom(
  request: Request,
  env: Env,
  rawCode: string,
  sub: string
): Promise<Response> {
  const code = normalizeCodeInput(rawCode);
  if (!isValidCode(code)) {
    return errorJson(404, 'ROOM_NOT_FOUND', '방을 찾을 수 없어요.');
  }

  const target = routeOf(request.method, sub);
  if (target === null) {
    return errorJson(404, 'NOT_FOUND', '경로를 찾을 수 없어요.');
  }

  const { deviceId, setCookie } = resolveDevice(request);
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(code));

  const init: RequestInit = {
    method: request.method,
    headers: deviceHeaders(request, deviceId),
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.text();
  }

  const response = await stub.fetch(`https://do${target}`, init);

  // WebSocket 업그레이드 응답은 그대로 흘려보낸다
  if (response.status === 101) return response;

  return withCookie(response, setCookie);
}

function routeOf(method: string, sub: string): string | null {
  if (method === 'GET' && sub === '') return '/info';
  if (method === 'GET' && sub === '/stats') return '/stats';
  if (method === 'GET' && sub === '/ws') return '/ws';
  if (method === 'POST' && sub === '/join') return '/join';
  if (method === 'POST' && sub === '/claim') return '/claim';
  return null;
}

/** 쿠키 → 백업 헤더 → 신규 발급 순으로 기기 ID를 정한다 */
function resolveDevice(request: Request): { deviceId: string; setCookie: string | null } {
  const existing = readDeviceCookie(request);
  if (existing !== null) return { deviceId: existing, setCookie: null };

  const deviceId = readBackupHeader(request) ?? ids.uuid();
  return { deviceId, setCookie: deviceCookie(deviceId) };
}

function deviceHeaders(request: Request, deviceId: string): Headers {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('X-Device-Id', deviceId);

  // Design §3.5 — UA는 식별이 아니라 "연결된 기기" 표시용 요약으로만 쓴다
  const ua = request.headers.get('User-Agent');
  if (ua !== null) headers.set('X-Ua-Label', summarizeUa(ua));

  const upgrade = request.headers.get('Upgrade');
  if (upgrade !== null) headers.set('Upgrade', upgrade);

  return headers;
}

function withCookie(response: Response, setCookie: string | null): Response {
  if (setCookie === null) return response;
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie', setCookie);
  return new Response(response.body, { status: response.status, headers });
}

/** "iPhone · Safari" 수준의 짧은 표시용 요약. 식별 로직은 이 값을 보지 않는다 */
export function summarizeUa(ua: string): string {
  const device = /iPhone/i.test(ua)
    ? 'iPhone'
    : /iPad/i.test(ua)
      ? 'iPad'
      : /Android/i.test(ua)
        ? 'Android'
        : /Macintosh/i.test(ua)
          ? 'Mac'
          : /Windows/i.test(ua)
            ? 'Windows'
            : '기기';

  const browser = /KAKAOTALK/i.test(ua)
    ? '카카오톡'
    : /Edg\//i.test(ua)
      ? 'Edge'
      : /Chrome\//i.test(ua)
        ? 'Chrome'
        : /Safari\//i.test(ua)
          ? 'Safari'
          : '브라우저';

  return `${device} · ${browser}`;
}
