/**
 * Design Ref: §6.1 — 도메인 에러 코드.
 *
 * Presentation이 이 코드를 HTTP status / WS error 메시지로 매핑한다.
 * 도메인 자신은 HTTP를 모른다.
 */
export type DomainErrorCode =
  | 'VALIDATION_ERROR'
  | 'ROOM_NOT_FOUND'
  | 'MEMBER_NOT_FOUND'
  | 'SPECIES_NOT_FOUND'
  | 'NAME_TAKEN'
  | 'MEMBER_ONLINE'
  | 'ROOM_ENDED'
  | 'ROOM_ARCHIVED'
  | 'FORBIDDEN_PROXY'
  | 'NO_ACTIVE_CATCH'
  | 'CARD_NOT_EMPTY'
  | 'CARD_EXISTS';

export interface DomainErrorDetails {
  field?: string;
  [key: string]: unknown;
}

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: DomainErrorDetails | undefined;

  constructor(code: DomainErrorCode, message: string, details?: DomainErrorDetails) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}

/**
 * NOTE: `COOLDOWN_ACTIVE`는 의도적으로 코드 목록에 없다.
 *
 * Design Ref: §6.1 — 서버는 쿨다운을 검증하지 않는다.
 * 오프라인 대기열이 한꺼번에 도착할 때 정상 입력이 거부되는 것을 막기 위해서다.
 * 쿨다운은 클라이언트 UI가 버튼을 비활성화하는 방식으로만 강제된다.
 */
