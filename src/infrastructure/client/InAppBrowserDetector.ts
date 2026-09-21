export type InAppBrowser = 'kakaotalk' | 'line' | 'naver' | 'instagram' | 'facebook' | null;

/**
 * 인앱 브라우저 감지 (Plan FR-05).
 *
 * Design Ref: §3.5 — 한국에서 **가장 흔한 기기 ID 유실 경로**다.
 * 단톡방 링크를 카톡 인앱 브라우저로 열면 저장소가 사파리와 분리돼 있어서,
 * 나중에 사파리로 열면 다른 기기로 인식된다.
 *
 * 여기서 UA를 보는 건 **식별이 아니라 안내**를 위해서다.
 * 기기 식별에는 UA를 일절 쓰지 않는다 (Design §7).
 */
export function detectInAppBrowser(userAgent: string): InAppBrowser {
  if (/KAKAOTALK/i.test(userAgent)) return 'kakaotalk';
  if (/\bLine\//i.test(userAgent)) return 'line';
  if (/NAVER\(inapp/i.test(userAgent)) return 'naver';
  if (/Instagram/i.test(userAgent)) return 'instagram';
  if (/FBAN|FBAV/i.test(userAgent)) return 'facebook';
  return null;
}

export function inAppBrowserLabel(kind: NonNullable<InAppBrowser>): string {
  switch (kind) {
    case 'kakaotalk':
      return '카카오톡';
    case 'line':
      return '라인';
    case 'naver':
      return '네이버';
    case 'instagram':
      return '인스타그램';
    case 'facebook':
      return '페이스북';
  }
}

/**
 * 외부 브라우저로 열기.
 *
 * 카카오톡은 전용 스킴을 지원한다. 그 외는 사용자가 직접 "다른 브라우저로 열기"를
 * 눌러야 하므로 안내 문구만 보여준다.
 */
export function externalBrowserUrl(kind: NonNullable<InAppBrowser>, url: string): string | null {
  if (kind === 'kakaotalk') {
    return `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
  }
  return null;
}
