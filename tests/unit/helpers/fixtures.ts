import type { Member } from '@domain/entities/member';
import type { Room } from '@domain/entities/room';
import type { Species } from '@domain/entities/species';
import type { CatchEvent } from '@domain/entities/catch-event';
import type { Millis } from '@domain/entities/common';
import { normalizeName } from '@domain/rules/speciesName';

/** 테스트 기준 시각 — 2026-09-27 06:00:00 KST 무렵의 임의 고정값 */
export const T0: Millis = 1_790_000_000_000;

export const sec = (n: number): Millis => n * 1000;
export const min = (n: number): Millis => n * 60_000;

export function member(id: string, displayName: string, hasDevice = true): Member {
  return {
    id,
    displayName,
    normalized: normalizeName(displayName),
    joinedAt: T0,
    hasDevice,
  };
}

export function species(id: string, name: string, createdBy = 'm-host'): Species {
  return { id, name, normalized: normalizeName(name), createdBy, createdAt: T0 };
}

export function room(overrides: Partial<Room> = {}): Room {
  return {
    code: 'K7QM4X',
    name: '9월 27일 태안 선상',
    hostMemberId: 'm-host',
    status: 'active',
    createdAt: T0,
    endedAt: null,
    lastActivityAt: T0,
    ...overrides,
  };
}

interface CatchOptions {
  id?: string;
  memberId?: string;
  speciesId?: string;
  caughtAt?: Millis;
  voidedAt?: Millis | null;
  enteredBy?: string;
}

let seq = 0;
export function resetSeq(): void {
  seq = 0;
}

export function katch(o: CatchOptions = {}): CatchEvent {
  seq += 1;
  const memberId = o.memberId ?? 'm-1';
  const caughtAt = o.caughtAt ?? T0;
  return {
    id: o.id ?? `e-${String(seq).padStart(3, '0')}`,
    memberId,
    speciesId: o.speciesId ?? 's-rock',
    caughtAt,
    receivedAt: caughtAt + 50,
    voidedAt: o.voidedAt ?? null,
    voidActionId: o.voidedAt != null ? `v-${String(seq).padStart(3, '0')}` : null,
    enteredBy: o.enteredBy ?? memberId,
    voidedBy: o.voidedAt != null ? memberId : null,
  };
}

/** 한 사람이 일정 간격으로 n마리 잡은 이벤트열 */
export function streak(
  memberId: string,
  speciesId: string,
  n: number,
  startAt: Millis,
  gapMs: number
): CatchEvent[] {
  const out: CatchEvent[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(katch({ memberId, speciesId, caughtAt: startAt + i * gapMs }));
  }
  return out;
}
