import { describe, it, expect } from 'vitest';
import { isHost, isRoomWritable } from '@domain/entities/room';
import { isActive } from '@domain/entities/catch-event';
import { DomainError, isDomainError } from '@domain/errors';
import { T0, katch, room, sec } from '@tests/unit/helpers/fixtures';

describe('entities', () => {
  it('종료된 방은 쓰기 불가다 (FR-17)', () => {
    expect(isRoomWritable(room())).toBe(true);
    expect(isRoomWritable(room({ status: 'ended', endedAt: T0 }))).toBe(false);
  });

  it('방장 판정은 멤버 기준이다 — 기기가 아니다', () => {
    const r = room({ hostMemberId: 'm-host' });

    expect(isHost(r, 'm-host')).toBe(true);
    expect(isHost(r, 'm-1')).toBe(false);
  });

  it('isActive는 voidedAt만 본다', () => {
    expect(isActive(katch({ caughtAt: T0 }))).toBe(true);
    expect(isActive(katch({ caughtAt: T0, voidedAt: T0 + sec(1) }))).toBe(false);
  });

  it('DomainError는 code와 details를 보존한다', () => {
    const e = new DomainError('NAME_TAKEN', '이미 있는 이름이에요.', { field: 'displayName' });

    expect(isDomainError(e)).toBe(true);
    expect(e.code).toBe('NAME_TAKEN');
    expect(e.details?.['field']).toBe('displayName');
    expect(e.name).toBe('DomainError');
  });

  it('isDomainError는 일반 Error를 걸러낸다', () => {
    expect(isDomainError(new Error('boom'))).toBe(false);
    expect(isDomainError(null)).toBe(false);
  });
});
