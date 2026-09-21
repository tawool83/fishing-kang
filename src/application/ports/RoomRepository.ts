import type { Millis } from '@domain/entities/common';
import type { Room, RoomStatus } from '@domain/entities/room';
import type { Member, MemberId } from '@domain/entities/member';
import type { MemberDevice } from '@domain/entities/device';
import type { Species, SpeciesId, MemberSpeciesCard } from '@domain/entities/species';
import type { CatchEvent } from '@domain/entities/catch-event';

/**
 * 한 방의 상태 전부. 스냅샷 전송과 낙관적 예측의 단위다.
 */
export interface RoomState {
  room: Room;
  members: Member[];
  devices: MemberDevice[];
  species: Species[];
  cards: MemberSpeciesCard[];
  events: CatchEvent[];
}

/**
 * Design Ref: §2.0 — Option B의 핵심.
 *
 * 같은 UseCase가 이 인터페이스의 서로 다른 구현 위에서 돈다:
 *   · Worker: SqliteRoomRepository      (DO 내장 SQLite)
 *   · Client: ProjectionRoomRepository  (메모리 — 스냅샷 + 미전송 pending)
 *
 * **동기 인터페이스인 이유**: DO의 `ctx.storage.sql.exec()`가 동기이고
 * 클라이언트 투영도 메모리라 양쪽 다 동기로 만들 수 있다. UseCase에서 await가
 * 사라지면 "같은 코드가 같은 순서로 돈다"는 전제가 훨씬 단단해지고,
 * 테스트도 Fake 구현 하나로 끝난다.
 *
 * 방 하나가 수백 행 규모라 매번 전체를 읽어도 부담이 없다 (Design §1.2).
 *
 * ## 정렬 계약
 *
 * 목록 조회는 **구현과 무관하게 같은 순서**를 돌려줘야 한다. 순서가 갈리면
 * 사람×어종 매트릭스의 열 순서나 카드 배치가 클라이언트와 서버에서 달라진다.
 * 동률이 가능한 키는 전부 id로 tie-break 한다.
 *
 * | 메서드 | 순서 |
 * |---|---|
 * | `listMembers` | joinedAt ASC, id ASC |
 * | `listDevices` | linkedAt ASC, deviceId ASC |
 * | `listSpecies` | createdAt ASC, id ASC |
 * | `listCards` | memberId ASC, sortOrder ASC, speciesId ASC |
 * | `listEvents` | caughtAt ASC, id ASC |
 */
export interface RoomRepository {
  // ── 조회 (위 정렬 계약을 지킨다) ──
  getRoom(): Room | null;
  listMembers(): Member[];
  listDevices(): MemberDevice[];
  listSpecies(): Species[];
  listCards(): MemberSpeciesCard[];
  listEvents(): CatchEvent[];
  snapshot(): RoomState | null;

  findMember(id: MemberId): Member | null;
  findMemberByNormalized(normalized: string): Member | null;
  findDevice(deviceId: string): MemberDevice | null;
  findSpecies(id: SpeciesId): Species | null;
  findSpeciesByNormalized(normalized: string): Species | null;
  findCard(memberId: MemberId, speciesId: SpeciesId): MemberSpeciesCard | null;
  findEvent(id: string): CatchEvent | null;
  findEventByVoidActionId(actionId: string): CatchEvent | null;

  // ── 변경 ──
  createRoom(room: Room): void;
  setRoomStatus(status: RoomStatus, at: Millis | null): void;
  touchActivity(at: Millis): void;

  addMember(member: Member): void;
  setMemberHasDevice(id: MemberId, hasDevice: boolean): void;
  linkDevice(device: MemberDevice): void;
  touchDevice(deviceId: string, at: Millis): void;

  addSpecies(species: Species): void;
  addCard(card: MemberSpeciesCard): void;
  setCardHidden(memberId: MemberId, speciesId: SpeciesId, hidden: boolean): void;
  removeCard(memberId: MemberId, speciesId: SpeciesId): void;

  /**
   * 멱등 추가 — 같은 `id`가 이미 있으면 **아무것도 하지 않는다**.
   * 오프라인 대기열이 재전송돼도 중복이 생기지 않는 지점이다 (Plan FR-19).
   */
  appendCatch(event: CatchEvent): void;
  voidCatch(id: string, at: Millis, actionId: string, by: MemberId): void;
  restoreCatch(id: string): void;

  /** TTL 만료 시 방 데이터 전체 삭제 (Plan FR-30) */
  deleteAll(): void;
}
