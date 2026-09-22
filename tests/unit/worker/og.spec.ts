import { describe, expect, it } from 'vitest';
import { ogOverridesFor } from '@presentation/worker/og';

const ORIGIN = 'https://fish.allegru.dev';

describe('ogOverridesFor', () => {
  it('초대 링크는 문구를 초대장으로 바꾸고 그 방의 정본 URL을 박는다', () => {
    const overrides = ogOverridesFor('/r/AB3K7M', ORIGIN);

    expect(overrides?.get('og:title')).toBe('낚시 조과 겨루기에 초대받았어요');
    expect(overrides?.get('og:url')).toBe('https://fish.allegru.dev/r/AB3K7M');
  });

  it('트위터·슬랙용 태그도 같이 바꾼다 — 한쪽만 바뀌면 카드가 어긋난다', () => {
    const overrides = ogOverridesFor('/r/AB3K7M', ORIGIN);

    expect(overrides?.get('twitter:title')).toBe(overrides?.get('og:title'));
    expect(overrides?.get('twitter:description')).toBe(overrides?.get('og:description'));
  });

  it('소문자 코드도 정규화해서 정본 URL로 만든다', () => {
    expect(ogOverridesFor('/r/ab3k7m', ORIGIN)?.get('og:url')).toBe(
      'https://fish.allegru.dev/r/AB3K7M'
    );
  });

  it('망가진 코드는 정본으로 박지 않고 홈으로 떨어뜨린다', () => {
    expect(ogOverridesFor('/r/nope', ORIGIN)?.get('og:url')).toBe(ORIGIN);
  });

  it('방 이름·코드가 문구에 들어갈 자리가 없다 (Plan §9)', () => {
    const overrides = ogOverridesFor('/r/AB3K7M', ORIGIN);

    // 카드가 방과 무관하므로 스크랩 요청이 DO를 깨우지 않는다
    expect(overrides?.get('og:description')).not.toContain('AB3K7M');
  });

  it('홈·방 화면은 덮어쓸 게 없다 — index.html 기본 카드를 그대로 쓴다', () => {
    expect(ogOverridesFor('/', ORIGIN)).toBeNull();
    expect(ogOverridesFor('/room/AB3K7M', ORIGIN)).toBeNull();
    expect(ogOverridesFor('/room/AB3K7M/new', ORIGIN)).toBeNull();
  });

  it('이미지는 어느 경로에서도 덮어쓰지 않는다', () => {
    expect(ogOverridesFor('/r/AB3K7M', ORIGIN)?.has('og:image')).toBe(false);
  });
});
