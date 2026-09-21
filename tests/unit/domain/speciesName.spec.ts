import { describe, it, expect } from 'vitest';
import {
  findExisting,
  normalizeName,
  toDisplayName,
  validateName,
} from '@domain/rules/speciesName';
import { DomainError } from '@domain/errors';
import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN } from '@domain/entities/member';
import { species } from '@tests/unit/helpers/fixtures';

/**
 * Design §8.2 L0 #13 — 이름 정규화.
 * Plan FR-06 (방 안 이름 중복 금지), FR-07 (어종 표기 통일).
 */
describe('speciesName', () => {
  it('#13 "우럭" / "우 럭" / "우럭 "은 같은 어종이다', () => {
    expect(normalizeName('우럭')).toBe(normalizeName('우 럭'));
    expect(normalizeName('우럭')).toBe(normalizeName('우럭 '));
    expect(normalizeName('우럭')).toBe(normalizeName(' 우  럭 '));
  });

  it('#13b 대소문자를 무시한다', () => {
    expect(normalizeName('Rockfish')).toBe(normalizeName('rockfish'));
    expect(normalizeName('ROCKFISH')).toBe(normalizeName('RockFish'));
  });

  it('#13c 사람 이름도 같은 기준이다 — "김 철수"와 "김철수"는 같은 사람', () => {
    // SQLite COLLATE NOCASE로는 이걸 못 잡아서 normalized 컬럼을 따로 뒀다 (Design §3.3)
    expect(normalizeName('김 철수')).toBe(normalizeName('김철수'));
  });

  it('findExisting은 방 사전에서 같은 어종을 찾아낸다', () => {
    const dict = [species('s-rock', '우럭'), species('s-flat', '광어')];

    expect(findExisting(dict, '우 럭')?.id).toBe('s-rock');
    expect(findExisting(dict, '광어')?.id).toBe('s-flat');
    expect(findExisting(dict, '참돔')).toBeNull();
    expect(findExisting(dict, '   ')).toBeNull();
  });

  it('toDisplayName은 앞뒤 공백을 없애고 연속 공백을 1칸으로 줄인다', () => {
    expect(toDisplayName('  김   철수  ')).toBe('김 철수');
    expect(toDisplayName('우럭')).toBe('우럭');
  });

  it('길이는 표시명 기준으로 센다 — "김 철수"는 4자다', () => {
    // 정규화된 "김철수"(3자)로 세면 사용자가 본 글자 수와 달라 혼란스럽다
    expect(validateName('김 철수', DISPLAY_NAME_MIN, DISPLAY_NAME_MAX, 'displayName')).toBe(
      '김 철수'
    );
  });

  it('빈 이름과 공백뿐인 이름은 거부한다', () => {
    for (const bad of ['', '   ', '\t\n']) {
      expect(() => validateName(bad, DISPLAY_NAME_MIN, DISPLAY_NAME_MAX, 'displayName')).toThrow(
        DomainError
      );
    }
  });

  it('최대 길이를 넘으면 VALIDATION_ERROR를 던진다', () => {
    const tooLong = '가'.repeat(DISPLAY_NAME_MAX + 1);

    try {
      validateName(tooLong, DISPLAY_NAME_MIN, DISPLAY_NAME_MAX, 'displayName');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError);
      expect((e as DomainError).code).toBe('VALIDATION_ERROR');
      expect((e as DomainError).details?.['field']).toBe('displayName');
    }
  });

  it('경계값 — 최소·최대 길이는 통과한다', () => {
    expect(validateName('가', DISPLAY_NAME_MIN, DISPLAY_NAME_MAX, 'f')).toBe('가');
    const exact = '가'.repeat(DISPLAY_NAME_MAX);
    expect(validateName(exact, DISPLAY_NAME_MIN, DISPLAY_NAME_MAX, 'f')).toBe(exact);
  });

  it('이모지처럼 서로게이트 쌍인 문자도 1자로 센다', () => {
    // [...str] 기반이라 '🐟'.length === 2 문제에 걸리지 않는다
    expect(validateName('🐟', 1, 1, 'f')).toBe('🐟');
  });
});
