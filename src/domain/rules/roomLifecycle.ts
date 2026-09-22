import type { Millis } from '../entities/common';
import type { Room } from '../entities/room';

/**
 * 방의 수명 (Plan FR-31~33, 2026-09-22 확정).
 *
 * 출조 → 종료 → 열람 → 삭제의 4단계다. 시각 판정은 전부 여기 모여 있고,
 * 도메인답게 `now`를 인자로 받는다 — `Date.now()`를 부르지 않으므로 테스트에서
 * 3일 뒤·8일 뒤를 그냥 숫자로 만들어 볼 수 있다.
 *
 * ```
 *  생성 ──────── 낚시 (최대 3일) ────────▶ 종료 ── 정정 24h ──▶ 열람 전용 ──▶ 삭제
 *                          │                              (7일)
 *                          └─ 3일이 되면 알람이 자동으로 종료시킨다
 * ```
 *
 * 왜 자동 종료가 필요한가: 방장이 종료를 안 누르고 집에 가는 경우가 실제로 흔하다.
 * 그러면 방이 영영 `active`로 남아 순위가 확정되지 않고, 삭제 시점도 정해지지 않는다.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** 낚시는 최대 3일. 넘기면 알람이 자동으로 종료시킨다 */
export const MAX_FISHING_MS = 3 * DAY_MS;

/** 종료 후 24시간은 방장이 재개해서 정정할 수 있다 */
export const RESUME_GRACE_MS = 24 * HOUR_MS;

/** 종료 후 7일까지는 결과를 볼 수 있다. 그 뒤 데이터를 지운다 */
export const ARCHIVE_MS = 7 * DAY_MS;

/** 자동 종료 예정 시각 — 생성 기준이다 (재개해도 늘어나지 않는다) */
export function autoEndAt(room: Room): Millis {
  return room.createdAt + MAX_FISHING_MS;
}

/** 아직 낚시 중인데 3일이 지났는가 */
export function isFishingExpired(room: Room, now: Millis): boolean {
  return room.status === 'active' && now >= autoEndAt(room);
}

/** 데이터를 지울 시각. 아직 낚시 중이면 정해지지 않았다 */
export function purgeAt(room: Room): Millis | null {
  if (room.status !== 'ended' || room.endedAt === null) return null;
  return room.endedAt + ARCHIVE_MS;
}

export function isPurgeable(room: Room, now: Millis): boolean {
  const at = purgeAt(room);
  return at !== null && now >= at;
}

/**
 * 방장이 재개할 수 있는가 (Plan FR-32).
 *
 * 두 조건을 **모두** 만족해야 한다:
 *  · 종료한 지 24시간 이내 — 정정은 기억이 남아 있을 때나 의미가 있다
 *  · 아직 3일 상한 안 — "최대 3일"이 재개로 무한정 늘어나면 상한이 아니다
 *
 * 그래서 3일이 차서 자동 종료된 방은 재개되지 않는다. 결과만 남는다.
 */
export function isResumable(room: Room, now: Millis): boolean {
  if (room.status !== 'ended' || room.endedAt === null) return false;
  return now < room.endedAt + RESUME_GRACE_MS && now < autoEndAt(room);
}

/**
 * 읽기 전용으로 굳었는가 — 종료됐고 재개 가능 시간도 지났다.
 *
 * 화면이 "이제 결과만 볼 수 있어요"를 안내하는 데 쓴다.
 */
export function isArchived(room: Room, now: Millis): boolean {
  return room.status === 'ended' && !isResumable(room, now);
}

/**
 * 다음에 알람을 걸 시각 (Design §2.1 — DO 알람은 한 번에 하나뿐이다).
 *
 * 낚시 중이면 자동 종료 시각, 끝났으면 삭제 시각.
 * 종료됐는데 `endedAt`이 없는 비정상 상태면 안전하게 삭제 쪽으로 보낸다.
 */
export function nextDeadlineOf(room: Room): Millis {
  if (room.status === 'active') return autoEndAt(room);
  return purgeAt(room) ?? room.lastActivityAt + ARCHIVE_MS;
}
