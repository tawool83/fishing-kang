import type { DomainErrorCode } from '@domain/errors';
import { isDomainError } from '@domain/errors';
import { errorJson } from './env';

/**
 * Design Ref: §6.1 — 도메인 에러 → HTTP status 매핑.
 *
 * Domain은 HTTP를 모른다. 이 표가 유일한 접점이다.
 */
const STATUS: Record<DomainErrorCode, number> = {
  VALIDATION_ERROR: 400,
  ROOM_NOT_FOUND: 404,
  MEMBER_NOT_FOUND: 404,
  SPECIES_NOT_FOUND: 404,
  NAME_TAKEN: 409,
  MEMBER_ONLINE: 409,
  ROOM_ENDED: 423,
  ROOM_ARCHIVED: 423,
  FORBIDDEN_PROXY: 403,
  NO_ACTIVE_CATCH: 409,
  CARD_NOT_EMPTY: 409,
  CARD_EXISTS: 409,
};

export function statusFor(code: DomainErrorCode): number {
  return STATUS[code];
}

export function toErrorResponse(e: unknown): Response {
  if (isDomainError(e)) {
    return errorJson(statusFor(e.code), e.code, e.message, e.details);
  }
  // 예기치 못한 오류는 내부 정보를 노출하지 않는다
  return errorJson(500, 'INTERNAL', '잠시 후 다시 시도해주세요.');
}
