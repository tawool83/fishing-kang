/**
 * 초대코드 알파벳 — 헷갈리는 문자 0·O·1·I 제외 (Plan FR-01).
 *
 * 32자 × 6자리 ≈ 10억 조합. 지인 규모 서비스에는 과할 만큼 충분하다.
 */
export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 6;

/**
 * 난수원을 인자로 받는다.
 *
 * Design Ref: §10.4 — Domain은 `crypto`를 직접 부르지 않는다.
 * Worker는 `crypto.getRandomValues` 기반 함수를, 테스트는 결정적 함수를 넘긴다.
 *
 * @param rand 0 이상 1 미만의 실수를 돌려주는 함수
 */
export function generateCode(rand: () => number): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    const idx = Math.floor(rand() * CODE_ALPHABET.length) % CODE_ALPHABET.length;
    out += CODE_ALPHABET[idx] ?? CODE_ALPHABET[0];
  }
  return out;
}

/**
 * 사용자 입력 정리 — 대문자 변환 후 알파벳에 없는 문자는 버린다 (Plan FR-02).
 *
 * 소문자 l이나 o를 친 경우까지 자동 교정하지는 않는다.
 * 잘못 추측해서 엉뚱한 방에 넣는 것보다 "방을 찾을 수 없음"이 낫다.
 */
export function normalizeCodeInput(raw: string): string {
  const upper = raw.toUpperCase();
  let out = '';
  for (const ch of upper) {
    if (CODE_ALPHABET.includes(ch)) out += ch;
  }
  return out.slice(0, CODE_LENGTH);
}

export function isValidCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return false;
  return true;
}
