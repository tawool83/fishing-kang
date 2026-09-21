import type {
  CreateRoomResultDto,
  DeviceResultDto,
  JoinResultDto,
  RoomInfoDto,
  StatsDto,
} from '@application/dto/responses';
import { DomainError } from '@domain/errors';
import type { DomainErrorCode } from '@domain/errors';

export type Fetch = typeof globalThis.fetch;

interface ApiErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

/**
 * HTTP 클라이언트 (Design §4.1).
 *
 * 서버의 `{data}` / `{error}` 봉투를 벗겨서, 에러는 **DomainError로 되살린다**.
 * 그래야 화면 코드가 "서버 에러"와 "로컬 규칙 위반"을 같은 방식으로 다룰 수 있다.
 */
export class HttpRoomApi {
  constructor(
    private readonly fetchFn: Fetch = globalThis.fetch.bind(globalThis),
    private readonly baseUrl = ''
  ) {}

  /** Plan FR-29 — 기기 ID 발급/복구. 백업값을 헤더로 함께 보낸다 */
  async resolveDevice(backup: string | null): Promise<DeviceResultDto> {
    const headers: Record<string, string> = {};
    if (backup !== null) headers['X-Device-Id-Backup'] = backup;
    return this.request<DeviceResultDto>('GET', '/api/device', undefined, headers);
  }

  createRoom(roomName: string, displayName: string): Promise<CreateRoomResultDto> {
    return this.request<CreateRoomResultDto>('POST', '/api/rooms', { roomName, displayName });
  }

  getRoom(code: string): Promise<RoomInfoDto> {
    return this.request<RoomInfoDto>('GET', `/api/rooms/${encodeURIComponent(code)}`);
  }

  join(code: string, displayName: string): Promise<JoinResultDto> {
    return this.request<JoinResultDto>('POST', `/api/rooms/${encodeURIComponent(code)}/join`, {
      displayName,
    });
  }

  /** Plan FR-04 — 이름 선택 복구. 접속 중이면 409 후 확인창을 거쳐 재요청한다 */
  claim(code: string, memberId: string, confirmedOnlineConflict = false): Promise<JoinResultDto> {
    return this.request<JoinResultDto>('POST', `/api/rooms/${encodeURIComponent(code)}/claim`, {
      memberId,
      confirmedOnlineConflict,
    });
  }

  getStats(code: string): Promise<StatsDto> {
    return this.request<StatsDto>('GET', `/api/rooms/${encodeURIComponent(code)}/stats`);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {}
  ): Promise<T> {
    const headers: Record<string, string> = { ...extraHeaders };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const init: RequestInit = {
      method,
      headers,
      // 기기 ID 쿠키가 반드시 실려야 한다
      credentials: 'same-origin',
    };
    if (body !== undefined) init.body = JSON.stringify(body);

    const response = await this.fetchFn(this.baseUrl + path, init);
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) throw toDomainError(payload, response.status);

    if (payload === null || typeof payload !== 'object' || !('data' in payload)) {
      throw new DomainError('VALIDATION_ERROR', '서버 응답을 이해하지 못했어요.');
    }
    return (payload as { data: T }).data;
  }
}

const KNOWN_CODES: readonly DomainErrorCode[] = [
  'VALIDATION_ERROR',
  'ROOM_NOT_FOUND',
  'MEMBER_NOT_FOUND',
  'SPECIES_NOT_FOUND',
  'NAME_TAKEN',
  'MEMBER_ONLINE',
  'ROOM_ENDED',
  'FORBIDDEN_PROXY',
  'NO_ACTIVE_CATCH',
  'CARD_NOT_EMPTY',
  'CARD_EXISTS',
];

function toDomainError(payload: unknown, status: number): DomainError {
  if (payload !== null && typeof payload === 'object' && 'error' in payload) {
    const { error } = payload as ApiErrorBody;
    const code = KNOWN_CODES.find((c) => c === error.code);
    if (code !== undefined) return new DomainError(code, error.message, error.details);
  }
  // 네트워크단 오류나 모르는 코드 — 사용자에게는 같은 문구로 보인다
  return new DomainError('VALIDATION_ERROR', `요청을 처리하지 못했어요. (${String(status)})`);
}
