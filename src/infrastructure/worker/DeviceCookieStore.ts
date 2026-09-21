/**
 * 기기 ID 쿠키 (Plan FR-29).
 *
 * Design Ref: §3.5 — 서버가 같은 도메인에서 발급한 HttpOnly 퍼스트파티 쿠키는
 * 사파리의 스크립트 저장소 정리(ITP)에서 localStorage·IndexedDB보다 오래 살아남는다.
 * 그래서 3중 저장의 1순위다.
 *
 * `__Host-` 접두사는 도메인 고정 + Secure + Path=/ 를 브라우저가 강제하게 한다.
 */
export const DEVICE_COOKIE = '__Host-dev_id';
export const DEVICE_BACKUP_HEADER = 'X-Device-Id-Backup';

/** 10년 — 한 달에 한두 번 쓰는 서비스라 만료는 사실상 없어야 한다 */
const MAX_AGE_SECONDS = 315_360_000;

export function readDeviceCookie(request: Request): string | null {
  const header = request.headers.get('Cookie');
  if (header === null) return null;

  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== DEVICE_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return isValidDeviceId(value) ? value : null;
  }
  return null;
}

/**
 * 클라이언트가 localStorage·IndexedDB 백업값을 보내면 **검증 없이** 그대로 쿠키로 복원한다.
 *
 * Design Ref: §4.2 — 조작 방지를 하지 않기로 했고, 랜덤 UUID 충돌 확률이 0에 수렴하므로
 * 이 값을 신뢰해도 실제 위험이 없다. 신뢰 경계를 세우면 오히려 정상 복구가 막힌다.
 */
export function readBackupHeader(request: Request): string | null {
  const value = request.headers.get(DEVICE_BACKUP_HEADER);
  if (value === null) return null;
  return isValidDeviceId(value) ? value : null;
}

export function deviceCookie(deviceId: string): string {
  return `${DEVICE_COOKIE}=${deviceId}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${String(MAX_AGE_SECONDS)}`;
}

/** UUID 형태만 받는다 — 헤더로 임의 문자열이 들어와 쿠키에 주입되는 것을 막는다 */
export function isValidDeviceId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
