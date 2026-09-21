import type { Millis } from '@domain/entities/common';
import type { Room, RoomStatus } from '@domain/entities/room';
import type { Member, MemberId } from '@domain/entities/member';
import type { MemberDevice } from '@domain/entities/device';
import type { MemberSpeciesCard, Species, SpeciesId } from '@domain/entities/species';
import type { CatchEvent } from '@domain/entities/catch-event';
import type { RoomRepository, RoomState } from '@application/ports/RoomRepository';

/**
 * 메모리 RoomRepository.
 *
 * Design Ref: §2.0 — 클라이언트 낙관적 예측의 토대다.
 * module-3의 `ProjectionRoomRepository`가 이 클래스를 감싸서
 * "서버 스냅샷으로 확정 상태를 교체한 뒤 미전송 pending을 재적용"하는
 * 병합 규칙(§2.2.3)을 얹는다.
 *
 * 워커의 `SqliteRoomRepository`와 **동일한 관측 가능 동작**을 가져야 하며,
 * 그것을 `tests/worker/equivalence.spec.ts`가 실제로 검증한다.
 */
export class InMemoryRoomRepository implements RoomRepository {
  private room: Room | null = null;
  private members: Member[] = [];
  private devices: MemberDevice[] = [];
  private species: Species[] = [];
  private cards: MemberSpeciesCard[] = [];
  private events: CatchEvent[] = [];

  // ── 조회 ──

  getRoom(): Room | null {
    return this.room === null ? null : { ...this.room };
  }

  /**
   * 아래 목록 조회는 전부 RoomRepository의 **정렬 계약**을 따른다.
   *
   * 삽입 순서를 그대로 돌려주면 SQLite 구현과 순서가 갈린다.
   * (실제로 동등성 테스트가 이걸 잡아냈다: createdAt이 동률인 어종 2개가
   *  메모리에서는 삽입 순서, SQLite에서는 id 순으로 나와 매트릭스 열 순서가 뒤집혔다.)
   */
  listMembers(): Member[] {
    return this.members
      .map((m) => ({ ...m }))
      .sort((a, b) => a.joinedAt - b.joinedAt || cmp(a.id, b.id));
  }

  listDevices(): MemberDevice[] {
    return this.devices
      .map((d) => ({ ...d }))
      .sort((a, b) => a.linkedAt - b.linkedAt || cmp(a.deviceId, b.deviceId));
  }

  listSpecies(): Species[] {
    return this.species
      .map((s) => ({ ...s }))
      .sort((a, b) => a.createdAt - b.createdAt || cmp(a.id, b.id));
  }

  listCards(): MemberSpeciesCard[] {
    return this.cards
      .map((c) => ({ ...c }))
      .sort(
        (a, b) =>
          cmp(a.memberId, b.memberId) || a.sortOrder - b.sortOrder || cmp(a.speciesId, b.speciesId)
      );
  }

  listEvents(): CatchEvent[] {
    return this.events
      .map((e) => ({ ...e }))
      .sort((a, b) => a.caughtAt - b.caughtAt || cmp(a.id, b.id));
  }

  snapshot(): RoomState | null {
    const room = this.getRoom();
    if (room === null) return null;
    return {
      room,
      members: this.listMembers(),
      devices: this.listDevices(),
      species: this.listSpecies(),
      cards: this.listCards(),
      events: this.listEvents(),
    };
  }

  findMember(id: MemberId): Member | null {
    const m = this.members.find((x) => x.id === id);
    return m === undefined ? null : { ...m };
  }

  findMemberByNormalized(normalized: string): Member | null {
    const m = this.members.find((x) => x.normalized === normalized);
    return m === undefined ? null : { ...m };
  }

  findDevice(deviceId: string): MemberDevice | null {
    const d = this.devices.find((x) => x.deviceId === deviceId);
    return d === undefined ? null : { ...d };
  }

  findSpecies(id: SpeciesId): Species | null {
    const s = this.species.find((x) => x.id === id);
    return s === undefined ? null : { ...s };
  }

  findSpeciesByNormalized(normalized: string): Species | null {
    const s = this.species.find((x) => x.normalized === normalized);
    return s === undefined ? null : { ...s };
  }

  findCard(memberId: MemberId, speciesId: SpeciesId): MemberSpeciesCard | null {
    const c = this.cards.find((x) => x.memberId === memberId && x.speciesId === speciesId);
    return c === undefined ? null : { ...c };
  }

  findEvent(id: string): CatchEvent | null {
    const e = this.events.find((x) => x.id === id);
    return e === undefined ? null : { ...e };
  }

  findEventByVoidActionId(actionId: string): CatchEvent | null {
    const e = this.events.find((x) => x.voidActionId === actionId);
    return e === undefined ? null : { ...e };
  }

  // ── 변경 ──

  createRoom(room: Room): void {
    this.room = { ...room };
  }

  setRoomStatus(status: RoomStatus, at: Millis | null): void {
    if (this.room === null) return;
    this.room = { ...this.room, status, endedAt: at };
  }

  touchActivity(at: Millis): void {
    if (this.room === null) return;
    this.room = { ...this.room, lastActivityAt: at };
  }

  addMember(member: Member): void {
    if (this.members.some((m) => m.id === member.id)) return;
    this.members.push({ ...member });
  }

  setMemberHasDevice(id: MemberId, hasDevice: boolean): void {
    this.members = this.members.map((m) => (m.id === id ? { ...m, hasDevice } : m));
  }

  linkDevice(device: MemberDevice): void {
    // 한 기기는 방당 한 멤버 — 기존 연결이 있으면 교체한다
    this.devices = this.devices.filter((d) => d.deviceId !== device.deviceId);
    this.devices.push({ ...device });
  }

  touchDevice(deviceId: string, at: Millis): void {
    this.devices = this.devices.map((d) =>
      d.deviceId === deviceId ? { ...d, lastSeenAt: at } : d
    );
  }

  addSpecies(species: Species): void {
    if (this.species.some((s) => s.id === species.id || s.normalized === species.normalized)) return;
    this.species.push({ ...species });
  }

  addCard(card: MemberSpeciesCard): void {
    if (this.findCard(card.memberId, card.speciesId) !== null) return;
    this.cards.push({ ...card });
  }

  setCardHidden(memberId: MemberId, speciesId: SpeciesId, hidden: boolean): void {
    this.cards = this.cards.map((c) =>
      c.memberId === memberId && c.speciesId === speciesId ? { ...c, hidden } : c
    );
  }

  removeCard(memberId: MemberId, speciesId: SpeciesId): void {
    this.cards = this.cards.filter((c) => !(c.memberId === memberId && c.speciesId === speciesId));
  }

  /** 멱등 — 같은 id가 있으면 아무것도 하지 않는다 (SQLite의 INSERT OR IGNORE와 동일) */
  appendCatch(event: CatchEvent): void {
    if (this.events.some((e) => e.id === event.id)) return;
    this.events.push({ ...event });
  }

  voidCatch(id: string, at: Millis, actionId: string, by: MemberId): void {
    this.events = this.events.map((e) =>
      e.id === id ? { ...e, voidedAt: at, voidActionId: actionId, voidedBy: by } : e
    );
  }

  restoreCatch(id: string): void {
    this.events = this.events.map((e) =>
      e.id === id ? { ...e, voidedAt: null, voidActionId: null, voidedBy: null } : e
    );
  }

  deleteAll(): void {
    this.room = null;
    this.members = [];
    this.devices = [];
    this.species = [];
    this.cards = [];
    this.events = [];
  }

  /** 스냅샷으로 확정 상태를 통째로 교체 (module-3 병합 규칙의 1단계) */
  loadState(state: RoomState): void {
    this.room = { ...state.room };
    this.members = state.members.map((m) => ({ ...m }));
    this.devices = state.devices.map((d) => ({ ...d }));
    this.species = state.species.map((s) => ({ ...s }));
    this.cards = state.cards.map((c) => ({ ...c }));
    this.events = state.events.map((e) => ({ ...e }));
  }
}

/** SQLite의 TEXT 비교와 같은 순서 */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
