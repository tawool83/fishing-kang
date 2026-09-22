import { isValidCode, normalizeCodeInput } from '@domain/rules/inviteCode';

/**
 * 단톡방 링크 미리보기(OG) 카드 — 경로별 덮어쓰기.
 *
 * 기본 카드는 `index.html`에 정적으로 박혀 있다. Workers Assets는 실제 파일이 있는
 * 경로(`/`, `/og.png`)를 **워커를 거치지 않고** 내보내므로 (Plan §7.2 — 정적 요청은 무료),
 * 홈 카드를 워커가 만들면 아예 닿지 않는다.
 *
 * 반면 `/r/:CODE`는 파일이 없어 SPA 폴백으로 워커를 탄다. 이 서비스의 기본 유입
 * 경로가 바로 그 링크라서(Design §5.4 ②), 여기서만 문구를 초대장으로 바꿔 끼운다.
 *
 * **방 이름은 싣지 않는다.** 사용자가 적은 문자열이고 스크래퍼 캐시에 남는데,
 * 링크를 받는 쪽은 이미 어느 단톡방인지 알고 있어 얻는 게 없다 (Plan §9 / Design §7).
 * 덕분에 카드가 방과 무관해져서 스크랩 요청이 DO를 깨우지 않는다.
 */

const INVITE_TITLE = '낚시 조과 겨루기에 초대받았어요';
const INVITE_DESCRIPTION =
  '링크를 열고 이름만 넣으면 바로 시작. 가입 없이 실시간으로 순위가 올라가요.';

/**
 * `<meta>`의 `property`/`name` → 새 `content`.
 *
 * 덮어쓸 게 없으면 `null`. 그때는 워커가 HTMLRewriter 자체를 태우지 않는다.
 */
export function ogOverridesFor(pathname: string, origin: string): Map<string, string> | null {
  const shared = /^\/r\/([^/]+)\/?$/.exec(pathname);
  if (shared === null) return null;

  const code = normalizeCodeInput(shared[1] ?? '');
  // 코드가 망가진 링크까지 정본으로 박아두지 않는다
  const url = isValidCode(code) ? `${origin}/r/${code}` : origin;

  return new Map([
    ['og:title', INVITE_TITLE],
    ['og:description', INVITE_DESCRIPTION],
    ['og:url', url],
    ['twitter:title', INVITE_TITLE],
    ['twitter:description', INVITE_DESCRIPTION],
  ]);
}
