import type { Millis } from '@domain/entities/common';
import type { MemberId } from '@domain/entities/member';
import type { SpeciesId } from '@domain/entities/species';
import type { RoomStatus } from '@domain/entities/room';
import type { CatchEvent } from '@domain/entities/catch-event';
import type { RankEntry } from '@domain/rules/ranking';
import type {
  CountBy,
  CumulativePoint,
  SpeciesMatrix,
  StatsSummary,
  TimeBucket,
} from '@domain/stats/aggregate';
import type { Highlights } from '@domain/stats/highlights';

export interface MemberDto {
  id: MemberId;
  displayName: string;
  /** 지금 접속 중인가 (참여자 목록 초록 점) */
  online: boolean;
  /** false = 방장이 이름만으로 등록한 참여자 (Plan FR-24) */
  hasDevice: boolean;
  isHost: boolean;
  /** 이 멤버에 연결된 기기 수. 2대 이상일 때만 UI에 표시 */
  deviceCount: number;
}

export interface SpeciesDto {
  id: SpeciesId;
  name: string;
  /** 방 전체에서 이 어종이 잡힌 수 (어종 추가 시트 자동완성용) */
  roomTotal: number;
}

export interface CardDto {
  memberId: MemberId;
  speciesId: SpeciesId;
  sortOrder: number;
  hidden: boolean;
  count: number;
}

export interface CardCountDto {
  memberId: MemberId;
  speciesId: SpeciesId;
  count: number;
}

export interface RoomDto {
  code: string;
  name: string;
  status: RoomStatus;
  hostMemberId: MemberId;
  createdAt: Millis;
  endedAt: Millis | null;
}

export interface RoomInfoDto {
  room: RoomDto;
  members: MemberDto[];
  /** 이 기기가 이미 멤버면 그 id. null이면 입장 화면을 보여준다 (Plan FR-03) */
  myMemberId: MemberId | null;
}

export interface RoomSnapshotDto {
  room: RoomDto;
  members: MemberDto[];
  species: SpeciesDto[];
  cards: CardDto[];
  /**
   * 조과 이벤트 원본.
   *
   * Design Ref: §2.2.3 — 클라이언트는 이걸 확정 상태로 깔고 그 위에
   * 미전송 pending을 재적용한다. 카운트를 서버가 계산해 내려주는 대신
   * 이벤트를 그대로 보내는 이유는, 클라이언트가 **같은 도메인 함수로**
   * 카운트를 파생시켜야 양쪽이 어긋나지 않기 때문이다.
   */
  events: CatchEvent[];
  ranking: RankEntry[];
}

export interface StatsDto {
  summary: StatsSummary;
  ranking: RankEntry[];
  perMember: CountBy<MemberId>[];
  perSpecies: CountBy<SpeciesId>[];
  matrix: SpeciesMatrix;
  buckets: TimeBucket[];
  cumulative: CumulativePoint[];
  highlights: Highlights;
  /** 대리 입력으로 들어온 건 수 (통계에 작게 표시, Plan FR-25) */
  proxiedCount: number;
}

export interface CreateRoomResultDto {
  code: string;
  memberId: MemberId;
  isHost: boolean;
  shareUrl: string;
}

export interface JoinResultDto {
  memberId: MemberId;
  isHost: boolean;
}

export interface DeviceResultDto {
  deviceId: string;
  /** 백업값으로 복원된 것인가 */
  restored: boolean;
}

/** Design Ref: §6.2 — 모든 HTTP 응답은 이 둘 중 하나다 */
export type ApiResponse<T> = { data: T } | { error: ApiError };

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
