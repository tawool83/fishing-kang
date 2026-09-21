import type { Millis } from '@domain/entities/common';
import type { Clock } from '@application/ports/Clock';

export class SystemClock implements Clock {
  now(): Millis {
    return Date.now();
  }
}
