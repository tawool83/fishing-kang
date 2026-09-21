import { generateCode } from '@domain/rules/inviteCode';
import type { IdGenerator } from '@application/ports/IdGenerator';

/**
 * Design Ref: §10.4 — Domain은 `crypto`를 직접 부르지 않는다.
 * 실제 난수원은 여기서만 만지고, 도메인에는 `() => number` 형태로 주입한다.
 */
export class CryptoIdGenerator implements IdGenerator {
  uuid(): string {
    return crypto.randomUUID();
  }

  inviteCode(): string {
    return generateCode(() => {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      // 0 이상 1 미만으로 정규화
      return (buf[0] ?? 0) / 0x1_0000_0000;
    });
  }
}
