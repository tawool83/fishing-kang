import type { Millis } from './common';
import type { MemberId } from './member';

export type RoomStatus = 'active' | 'ended';

export const ROOM_NAME_MIN = 1;
export const ROOM_NAME_MAX = 30;

export interface Room {
  /** 6자리 초대코드. 0·O·1·I 제외 (Plan FR-01) */
  code: string;
  /** 예: "9월 27일 태안 선상" */
  name: string;
  /**
   * Design Ref: §3.2 — 방장 권한은 기기가 아니라 멤버에 붙는다.
   * 방장이 폰을 바꿔도 이름 선택으로 복구하면 권한이 따라온다.
   */
  hostMemberId: MemberId;
  status: RoomStatus;
  createdAt: Millis;
  endedAt: Millis | null;
  /** Plan FR-30 — 마지막 활동 후 7일에 DO alarm으로 삭제. 그 기준값 */
  lastActivityAt: Millis;
}

/** 종료된 방은 방장 포함 전원 입력 잠금 (Plan FR-17) */
export function isRoomWritable(room: Room): boolean {
  return room.status === 'active';
}

/**
 * Design Ref: §1.2 — 이 검사는 "보안"이 아니라 역할 구분이다.
 * 조작 방지를 하지 않기로 했으므로 신뢰 경계를 세우지 않는다.
 */
export function isHost(room: Room, memberId: MemberId): boolean {
  return room.hostMemberId === memberId;
}
