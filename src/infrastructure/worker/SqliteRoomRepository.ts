import type { Millis } from '@domain/entities/common';
import type { Room, RoomStatus } from '@domain/entities/room';
import type { Member, MemberId } from '@domain/entities/member';
import type { MemberDevice } from '@domain/entities/device';
import type { MemberSpeciesCard, Species, SpeciesId } from '@domain/entities/species';
import type { CatchEvent } from '@domain/entities/catch-event';
import type { RoomRepository, RoomState } from '@application/ports/RoomRepository';
import { SCHEMA_SQL } from './schema';

interface RoomRow extends Record<string, SqlStorageValue> {
  code: string;
  name: string;
  host_member_id: string;
  status: string;
  created_at: number;
  ended_at: number | null;
  last_activity_at: number;
}

interface MemberRow extends Record<string, SqlStorageValue> {
  id: string;
  display_name: string;
  normalized: string;
  joined_at: number;
  has_device: number;
}

interface DeviceRow extends Record<string, SqlStorageValue> {
  device_id: string;
  member_id: string;
  ua_label: string | null;
  linked_at: number;
  last_seen_at: number;
}

interface SpeciesRow extends Record<string, SqlStorageValue> {
  id: string;
  name: string;
  normalized: string;
  created_by: string;
  created_at: number;
}

interface CardRow extends Record<string, SqlStorageValue> {
  member_id: string;
  species_id: string;
  sort_order: number;
  hidden: number;
}

interface CatchRow extends Record<string, SqlStorageValue> {
  id: string;
  member_id: string;
  species_id: string;
  caught_at: number;
  received_at: number;
  voided_at: number | null;
  void_action_id: string | null;
  entered_by: string;
  voided_by: string | null;
}

/**
 * Design Ref: §9.4 — DO 내장 SQLite 기반 RoomRepository.
 *
 * `ctx.storage.sql.exec()`가 **동기**라서 Port를 동기로 설계할 수 있었다.
 * 덕분에 UseCase에 await가 없고, 클라이언트의 메모리 구현과 같은 코드가 돈다.
 *
 * 모든 쿼리는 파라미터 바인딩을 쓴다 (Design §7 — 문자열 연결 금지).
 */
export class SqliteRoomRepository implements RoomRepository {
  constructor(private readonly sql: SqlStorage) {
    this.sql.exec(SCHEMA_SQL);
  }

  // ── 조회 ──

  getRoom(): Room | null {
    const rows = this.sql.exec<RoomRow>('SELECT * FROM room WHERE id = 1').toArray();
    const r = rows[0];
    if (r === undefined) return null;
    return {
      code: r.code,
      name: r.name,
      hostMemberId: r.host_member_id,
      status: r.status === 'ended' ? 'ended' : 'active',
      createdAt: r.created_at,
      endedAt: r.ended_at,
      lastActivityAt: r.last_activity_at,
    };
  }

  listMembers(): Member[] {
    return this.sql
      .exec<MemberRow>('SELECT * FROM member ORDER BY joined_at ASC, id ASC')
      .toArray()
      .map(toMember);
  }

  listDevices(): MemberDevice[] {
    return this.sql
      .exec<DeviceRow>('SELECT * FROM member_device ORDER BY linked_at ASC, device_id ASC')
      .toArray()
      .map(toDevice);
  }

  listSpecies(): Species[] {
    return this.sql
      .exec<SpeciesRow>('SELECT * FROM species ORDER BY created_at ASC, id ASC')
      .toArray()
      .map(toSpecies);
  }

  listCards(): MemberSpeciesCard[] {
    return this.sql
      .exec<CardRow>(
        'SELECT * FROM member_species ORDER BY member_id ASC, sort_order ASC, species_id ASC'
      )
      .toArray()
      .map(toCard);
  }

  listEvents(): CatchEvent[] {
    return this.sql
      .exec<CatchRow>('SELECT * FROM catch_event ORDER BY caught_at ASC, id ASC')
      .toArray()
      .map(toCatch);
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
    const r = this.sql.exec<MemberRow>('SELECT * FROM member WHERE id = ?', id).toArray()[0];
    return r === undefined ? null : toMember(r);
  }

  findMemberByNormalized(normalized: string): Member | null {
    const r = this.sql
      .exec<MemberRow>('SELECT * FROM member WHERE normalized = ?', normalized)
      .toArray()[0];
    return r === undefined ? null : toMember(r);
  }

  findDevice(deviceId: string): MemberDevice | null {
    const r = this.sql
      .exec<DeviceRow>('SELECT * FROM member_device WHERE device_id = ?', deviceId)
      .toArray()[0];
    return r === undefined ? null : toDevice(r);
  }

  findSpecies(id: SpeciesId): Species | null {
    const r = this.sql.exec<SpeciesRow>('SELECT * FROM species WHERE id = ?', id).toArray()[0];
    return r === undefined ? null : toSpecies(r);
  }

  findSpeciesByNormalized(normalized: string): Species | null {
    const r = this.sql
      .exec<SpeciesRow>('SELECT * FROM species WHERE normalized = ?', normalized)
      .toArray()[0];
    return r === undefined ? null : toSpecies(r);
  }

  findCard(memberId: MemberId, speciesId: SpeciesId): MemberSpeciesCard | null {
    const r = this.sql
      .exec<CardRow>(
        'SELECT * FROM member_species WHERE member_id = ? AND species_id = ?',
        memberId,
        speciesId
      )
      .toArray()[0];
    return r === undefined ? null : toCard(r);
  }

  findEvent(id: string): CatchEvent | null {
    const r = this.sql.exec<CatchRow>('SELECT * FROM catch_event WHERE id = ?', id).toArray()[0];
    return r === undefined ? null : toCatch(r);
  }

  findEventByVoidActionId(actionId: string): CatchEvent | null {
    const r = this.sql
      .exec<CatchRow>('SELECT * FROM catch_event WHERE void_action_id = ?', actionId)
      .toArray()[0];
    return r === undefined ? null : toCatch(r);
  }

  // ── 변경 ──

  createRoom(room: Room): void {
    this.sql.exec(
      `INSERT OR IGNORE INTO room
         (id, code, name, host_member_id, status, created_at, ended_at, last_activity_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
      room.code,
      room.name,
      room.hostMemberId,
      room.status,
      room.createdAt,
      room.endedAt,
      room.lastActivityAt
    );
  }

  setRoomStatus(status: RoomStatus, at: Millis | null): void {
    this.sql.exec('UPDATE room SET status = ?, ended_at = ? WHERE id = 1', status, at);
  }

  touchActivity(at: Millis): void {
    this.sql.exec('UPDATE room SET last_activity_at = ? WHERE id = 1', at);
  }

  addMember(member: Member): void {
    this.sql.exec(
      `INSERT OR IGNORE INTO member (id, display_name, normalized, joined_at, has_device)
       VALUES (?, ?, ?, ?, ?)`,
      member.id,
      member.displayName,
      member.normalized,
      member.joinedAt,
      member.hasDevice ? 1 : 0
    );
  }

  setMemberHasDevice(id: MemberId, hasDevice: boolean): void {
    this.sql.exec('UPDATE member SET has_device = ? WHERE id = ?', hasDevice ? 1 : 0, id);
  }

  linkDevice(device: MemberDevice): void {
    // 한 기기는 방당 한 멤버 — PK 충돌 시 교체
    this.sql.exec(
      `INSERT INTO member_device (device_id, member_id, ua_label, linked_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         member_id = excluded.member_id,
         ua_label = excluded.ua_label,
         linked_at = excluded.linked_at,
         last_seen_at = excluded.last_seen_at`,
      device.deviceId,
      device.memberId,
      device.uaLabel,
      device.linkedAt,
      device.lastSeenAt
    );
  }

  touchDevice(deviceId: string, at: Millis): void {
    this.sql.exec('UPDATE member_device SET last_seen_at = ? WHERE device_id = ?', at, deviceId);
  }

  addSpecies(species: Species): void {
    this.sql.exec(
      `INSERT OR IGNORE INTO species (id, name, normalized, created_by, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      species.id,
      species.name,
      species.normalized,
      species.createdBy,
      species.createdAt
    );
  }

  addCard(card: MemberSpeciesCard): void {
    this.sql.exec(
      `INSERT OR IGNORE INTO member_species (member_id, species_id, sort_order, hidden)
       VALUES (?, ?, ?, ?)`,
      card.memberId,
      card.speciesId,
      card.sortOrder,
      card.hidden ? 1 : 0
    );
  }

  setCardHidden(memberId: MemberId, speciesId: SpeciesId, hidden: boolean): void {
    this.sql.exec(
      'UPDATE member_species SET hidden = ? WHERE member_id = ? AND species_id = ?',
      hidden ? 1 : 0,
      memberId,
      speciesId
    );
  }

  removeCard(memberId: MemberId, speciesId: SpeciesId): void {
    this.sql.exec(
      'DELETE FROM member_species WHERE member_id = ? AND species_id = ?',
      memberId,
      speciesId
    );
  }

  /**
   * Plan FR-19 — `INSERT OR IGNORE`가 멱등성의 핵심이다.
   * 오프라인 대기열이 같은 이벤트를 몇 번 재전송해도 행은 하나만 남는다.
   */
  appendCatch(event: CatchEvent): void {
    this.sql.exec(
      `INSERT OR IGNORE INTO catch_event
         (id, member_id, species_id, caught_at, received_at,
          voided_at, void_action_id, entered_by, voided_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      event.id,
      event.memberId,
      event.speciesId,
      event.caughtAt,
      event.receivedAt,
      event.voidedAt,
      event.voidActionId,
      event.enteredBy,
      event.voidedBy
    );
  }

  voidCatch(id: string, at: Millis, actionId: string, by: MemberId): void {
    this.sql.exec(
      'UPDATE catch_event SET voided_at = ?, void_action_id = ?, voided_by = ? WHERE id = ?',
      at,
      actionId,
      by,
      id
    );
  }

  restoreCatch(id: string): void {
    this.sql.exec(
      'UPDATE catch_event SET voided_at = NULL, void_action_id = NULL, voided_by = NULL WHERE id = ?',
      id
    );
  }

  deleteAll(): void {
    for (const table of [
      'catch_event',
      'member_species',
      'species',
      'member_device',
      'member',
      'room',
    ]) {
      this.sql.exec(`DELETE FROM ${table}`);
    }
  }
}

function toMember(r: MemberRow): Member {
  return {
    id: r.id,
    displayName: r.display_name,
    normalized: r.normalized,
    joinedAt: r.joined_at,
    hasDevice: r.has_device !== 0,
  };
}

function toDevice(r: DeviceRow): MemberDevice {
  return {
    deviceId: r.device_id,
    memberId: r.member_id,
    uaLabel: r.ua_label,
    linkedAt: r.linked_at,
    lastSeenAt: r.last_seen_at,
  };
}

function toSpecies(r: SpeciesRow): Species {
  return {
    id: r.id,
    name: r.name,
    normalized: r.normalized,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

function toCard(r: CardRow): MemberSpeciesCard {
  return {
    memberId: r.member_id,
    speciesId: r.species_id,
    sortOrder: r.sort_order,
    hidden: r.hidden !== 0,
  };
}

function toCatch(r: CatchRow): CatchEvent {
  return {
    id: r.id,
    memberId: r.member_id,
    speciesId: r.species_id,
    caughtAt: r.caught_at,
    receivedAt: r.received_at,
    voidedAt: r.voided_at,
    voidActionId: r.void_action_id,
    enteredBy: r.entered_by,
    voidedBy: r.voided_by,
  };
}
