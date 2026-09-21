import { describe, it, expect } from 'vitest';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  generateCode,
  isValidCode,
  normalizeCodeInput,
} from '@domain/rules/inviteCode';

/**
 * Design §8.2 L0 #14 — 초대코드.
 * Plan FR-01 (헷갈리는 문자 0·O·1·I 제외 6자리), FR-02 (대문자 자동 변환).
 */
describe('inviteCode', () => {
  /** 결정적 의사난수 — Domain이 crypto를 직접 부르지 않으므로 주입한다 */
  function seededRand(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x1_0000_0000;
    };
  }

  it('#14 10만 회 생성해도 0·O·1·I가 섞이지 않고 전부 6자리다', () => {
    const rand = seededRand(42);
    const seen = new Set<string>();
    let badLength = 0;
    let invalid = 0;

    // 루프 안에서 expect를 부르면 10만 회 × 여러 건이라 타임아웃이 난다.
    // 위반 건수만 모아서 마지막에 한 번 단언한다.
    for (let i = 0; i < 100_000; i += 1) {
      const code = generateCode(rand);
      if (code.length !== CODE_LENGTH) badLength += 1;
      if (!isValidCode(code)) invalid += 1;
      for (const ch of code) seen.add(ch);
    }

    expect(badLength).toBe(0);
    expect(invalid).toBe(0);
    for (const ch of ['0', 'O', '1', 'I']) expect(seen.has(ch)).toBe(false);
    // 32자 알파벳이 10만 회면 전부 한 번씩은 나온다 — 알파벳 밖 문자가 섞이지 않았다는 확인
    expect([...seen].sort().join('')).toBe([...CODE_ALPHABET].sort().join(''));
  });

  it('알파벳은 32자이고 혼동 문자를 포함하지 않는다', () => {
    expect(CODE_ALPHABET).toHaveLength(32);
    expect(CODE_ALPHABET).not.toMatch(/[0O1I]/);
  });

  it('같은 시드면 같은 코드가 나온다 (테스트 결정성)', () => {
    expect(generateCode(seededRand(7))).toBe(generateCode(seededRand(7)));
  });

  it('입력은 대문자로 변환된다', () => {
    expect(normalizeCodeInput('k7qm4x')).toBe('K7QM4X');
  });

  it('알파벳에 없는 문자는 버린다', () => {
    expect(normalizeCodeInput('K7-QM 4X')).toBe('K7QM4X');
    expect(normalizeCodeInput('K7QM4X!!!')).toBe('K7QM4X');
  });

  it('혼동 문자를 임의로 교정하지 않는다', () => {
    // 'O'를 '0'으로 바꿔 추측하면 엉뚱한 방에 들어갈 수 있다.
    // 잘못 넣느니 "방을 찾을 수 없음"이 낫다.
    expect(normalizeCodeInput('KOQM4X')).toBe('KQM4X');
  });

  it('6자리를 넘으면 잘라낸다', () => {
    expect(normalizeCodeInput('K7QM4XZZZ')).toBe('K7QM4X');
  });

  it('isValidCode는 길이와 알파벳을 모두 본다', () => {
    expect(isValidCode('K7QM4X')).toBe(true);
    expect(isValidCode('K7QM4')).toBe(false); // 5자리
    expect(isValidCode('K7QM4XZ')).toBe(false); // 7자리
    expect(isValidCode('K0QM4X')).toBe(false); // 0 포함
    expect(isValidCode('k7qm4x')).toBe(false); // 소문자
    expect(isValidCode('')).toBe(false);
  });
});
