import type { Millis } from '@domain/entities/common';

/**
 * Design Ref: §10.4 — Domain·Application은 `Date.now()`를 직접 부르지 않는다.
 * 테스트에서 시간을 제어할 수 있어야 쿨다운·TTL 같은 규칙을 검증할 수 있다.
 */
export interface Clock {
  now(): Millis;
}

/** 테스트·재현용 고정 시계 */
export class FixedClock implements Clock {
  constructor(private current: Millis) {}

  now(): Millis {
    return this.current;
  }

  set(at: Millis): void {
    this.current = at;
  }

  advance(ms: number): void {
    this.current += ms;
  }
}
