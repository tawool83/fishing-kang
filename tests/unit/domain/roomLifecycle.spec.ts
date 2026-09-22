import { describe, it, expect } from 'vitest';
import type { Room } from '@domain/entities/room';
import {
  ARCHIVE_MS,
  MAX_FISHING_MS,
  RESUME_GRACE_MS,
  autoEndAt,
  isArchived,
  isFishingExpired,
  isPurgeable,
  isResumable,
  nextDeadlineOf,
  purgeAt,
} from '@domain/rules/roomLifecycle';

const CREATED = 1_790_000_000_000;

function room(patch: Partial<Room> = {}): Room {
  return {
    code: 'ABC234',
    name: '9월 27일 태안 선상',
    hostMemberId: 'host',
    status: 'active',
    createdAt: CREATED,
    endedAt: null,
    lastActivityAt: CREATED,
    ...patch,
  };
}

/**
 * Plan FR-31~33 — 방 수명.
 *
 * 생성 → 낚시(최대 3일) → 종료 → 정정 24h → 열람 7일 → 삭제
 */
describe('방 수명', () => {
  describe('자동 종료 (FR-31)', () => {
    it('3일이 되면 만료다 — 기준은 생성 시각이다', () => {
      expect(autoEndAt(room())).toBe(CREATED + MAX_FISHING_MS);
      expect(isFishingExpired(room(), CREATED + MAX_FISHING_MS - 1)).toBe(false);
      expect(isFishingExpired(room(), CREATED + MAX_FISHING_MS)).toBe(true);
    });

    it('이미 종료된 방은 다시 만료되지 않는다', () => {
      const ended = room({ status: 'ended', endedAt: CREATED + 1000 });
      expect(isFishingExpired(ended, CREATED + MAX_FISHING_MS + 1)).toBe(false);
    });

    it('마지막 활동이 아니라 생성 기준이다 — 활동이 있어도 3일에 끝난다', () => {
      const busy = room({ lastActivityAt: CREATED + MAX_FISHING_MS - 1 });
      expect(isFishingExpired(busy, CREATED + MAX_FISHING_MS)).toBe(true);
    });
  });

  describe('정정 창 (FR-32)', () => {
    it('종료 후 24시간 안에는 재개할 수 있다', () => {
      const endedAt = CREATED + 3600_000; // 1시간 낚시하고 끝냈다
      const r = room({ status: 'ended', endedAt });

      expect(isResumable(r, endedAt + RESUME_GRACE_MS - 1)).toBe(true);
      expect(isResumable(r, endedAt + RESUME_GRACE_MS)).toBe(false);
    });

    it('24시간이 남았어도 3일 상한을 넘겼으면 재개할 수 없다', () => {
      // 2일 23시간째에 종료 → 정정 창은 24시간이지만 상한이 1시간 뒤다
      const endedAt = CREATED + MAX_FISHING_MS - 3600_000;
      const r = room({ status: 'ended', endedAt });

      expect(isResumable(r, endedAt + 1000)).toBe(true);
      expect(isResumable(r, CREATED + MAX_FISHING_MS)).toBe(false);
    });

    it('3일이 차서 자동 종료된 방은 처음부터 재개할 수 없다', () => {
      const endedAt = CREATED + MAX_FISHING_MS;
      const r = room({ status: 'ended', endedAt });
      expect(isResumable(r, endedAt)).toBe(false);
      expect(isResumable(r, endedAt + 1000)).toBe(false);
    });

    it('낚시 중인 방은 재개 대상이 아니다', () => {
      expect(isResumable(room(), CREATED + 1000)).toBe(false);
    });

    it('재개할 수 없는 종료 방은 읽기 전용이다', () => {
      const endedAt = CREATED + 1000;
      const r = room({ status: 'ended', endedAt });

      expect(isArchived(r, endedAt + 1000)).toBe(false);
      expect(isArchived(r, endedAt + RESUME_GRACE_MS)).toBe(true);
      // 낚시 중이면 읽기 전용이 아니다
      expect(isArchived(room(), CREATED + 1000)).toBe(false);
    });
  });

  describe('삭제 (FR-33)', () => {
    it('종료 후 7일에 지운다', () => {
      const endedAt = CREATED + 3600_000;
      const r = room({ status: 'ended', endedAt });

      expect(purgeAt(r)).toBe(endedAt + ARCHIVE_MS);
      expect(isPurgeable(r, endedAt + ARCHIVE_MS - 1)).toBe(false);
      expect(isPurgeable(r, endedAt + ARCHIVE_MS)).toBe(true);
    });

    it('낚시 중인 방은 삭제 시각이 아직 정해지지 않았다', () => {
      expect(purgeAt(room())).toBeNull();
      expect(isPurgeable(room(), CREATED + 365 * 86_400_000)).toBe(false);
    });
  });

  describe('다음 알람 마감', () => {
    it('낚시 중이면 자동 종료 시각이다', () => {
      expect(nextDeadlineOf(room())).toBe(CREATED + MAX_FISHING_MS);
    });

    it('종료됐으면 삭제 시각이다', () => {
      const endedAt = CREATED + 3600_000;
      expect(nextDeadlineOf(room({ status: 'ended', endedAt }))).toBe(endedAt + ARCHIVE_MS);
    });

    it('종료인데 endedAt이 비어 있으면 마지막 활동 기준으로 삭제한다', () => {
      // 정상 경로에서는 생기지 않는다. 방이 영원히 남는 것만은 막는다
      const broken = room({ status: 'ended', endedAt: null, lastActivityAt: CREATED + 500 });
      expect(nextDeadlineOf(broken)).toBe(CREATED + 500 + ARCHIVE_MS);
    });
  });
});
