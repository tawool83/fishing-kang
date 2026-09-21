import { DomainError } from '../errors';

/**
 * 이름 정규화 — 중복 판정의 단일 기준.
 *
 * Plan FR-06 (사람 이름) / FR-07 (어종 이름) 양쪽에서 같은 함수를 쓴다.
 * 공백을 "trim"이 아니라 "전부 제거"하는 이유: "김 철수"와 "김철수"를
 * 같은 사람으로 봐야 하기 때문이다 (Design §3.3).
 */
export function normalizeName(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/gu, '').toLowerCase();
}

/** 표시용 정리 — 앞뒤 공백 제거 + 연속 공백 1칸으로 축약 */
export function toDisplayName(raw: string): string {
  return raw.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

/** 정규화 기준으로 이미 있는 항목을 찾는다. 없으면 null */
export function findExisting<T extends { normalized: string }>(
  list: readonly T[],
  raw: string
): T | null {
  const key = normalizeName(raw);
  if (key === '') return null;
  return list.find((item) => item.normalized === key) ?? null;
}

/**
 * 길이 검증 + 표시명 반환.
 *
 * 길이는 **표시명 기준**으로 센다. "김 철수"는 4자다.
 * 정규화된 값("김철수", 3자)으로 세면 사용자가 본 것과 달라 혼란스럽다.
 */
export function validateName(
  raw: string,
  min: number,
  max: number,
  field: string
): string {
  const display = toDisplayName(raw);

  if (normalizeName(display) === '') {
    throw new DomainError('VALIDATION_ERROR', '이름을 입력해주세요.', { field });
  }
  if ([...display].length < min) {
    throw new DomainError('VALIDATION_ERROR', `${min}자 이상 입력해주세요.`, { field });
  }
  if ([...display].length > max) {
    throw new DomainError('VALIDATION_ERROR', `${max}자까지 입력할 수 있어요.`, { field });
  }
  return display;
}
