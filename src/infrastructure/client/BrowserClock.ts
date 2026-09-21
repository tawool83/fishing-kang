import type { Millis } from '@domain/entities/common';
import type { Clock } from '@application/ports/Clock';
import type { IdGenerator } from '@application/ports/IdGenerator';

export class BrowserClock implements Clock {
  now(): Millis {
    return Date.now();
  }
}

/**
 * 클라이언트 ID 생성기.
 *
 * `uuid()`가 만드는 값이 곧 **멱등키**다 (Plan FR-19). 오프라인 대기열이
 * 재전송돼도 서버가 같은 건으로 흡수하는 근거가 이 값이다.
 *
 * 초대코드는 서버가 채번하므로(충돌 재시도가 DO 바깥에 있다) 여기서는 쓰지 않는다.
 */
export class ClientIdGenerator implements IdGenerator {
  uuid(): string {
    const c = globalThis.crypto as Crypto | undefined;
    if (c !== undefined && typeof c.randomUUID === 'function') return c.randomUUID();

    // 구형 iOS 사파리 폴백 — randomUUID는 15.4+
    if (c !== undefined && typeof c.getRandomValues === 'function') {
      const b = c.getRandomValues(new Uint8Array(16));
      b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
      b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
      const hex = [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    throw new Error('crypto를 사용할 수 없어요.');
  }

  inviteCode(): string {
    throw new Error('초대코드는 서버가 발급합니다.');
  }
}
