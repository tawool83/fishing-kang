import type { Millis } from '@domain/entities/common';

export const DEFAULT_TTL_DAYS = 7;
const DAY_MS = 86_400_000;

/**
 * 방 데이터 자동 삭제 (Plan FR-30, 2026-09-21 확정 — 기획서 90일 제안에서 7일로 변경).
 *
 * Design Ref: §7 — 개인정보 최소화. 출조 직후 공유가 끝나면 데이터의 가치가 급감한다.
 *
 * DO alarm은 하나만 예약할 수 있으므로, 활동이 있을 때마다 만료 시각을 뒤로 민다.
 * 알람이 울렸을 때 아직 만료 전이면 다시 예약한다(활동이 있었다는 뜻).
 */
export class TtlAlarmScheduler {
  private readonly ttlMs: number;

  constructor(
    private readonly storage: DurableObjectStorage,
    ttlDays: number = DEFAULT_TTL_DAYS
  ) {
    this.ttlMs = Math.max(1, ttlDays) * DAY_MS;
  }

  expiresAt(lastActivityAt: Millis): Millis {
    return lastActivityAt + this.ttlMs;
  }

  /** 활동 시각 기준으로 만료 알람을 다시 건다 */
  async schedule(lastActivityAt: Millis): Promise<void> {
    await this.storage.setAlarm(this.expiresAt(lastActivityAt));
  }

  /** 만료됐는가. 아니면 호출자가 다시 schedule 한다 */
  isExpired(lastActivityAt: Millis, now: Millis): boolean {
    return now >= this.expiresAt(lastActivityAt);
  }
}

export function ttlDaysFrom(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_DAYS;
}
