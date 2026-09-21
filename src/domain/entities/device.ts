import type { Millis } from './common';
import type { MemberId } from './member';

/**
 * 서버가 발급한 랜덤 UUID. 기기·브라우저 정보를 일절 담지 않는다.
 *
 * Design Ref: §7 — 핑거프린트를 쓰지 않는 이유:
 * 같은 기종·같은 OS·같은 브라우저를 쓰는 지인 둘이 같은 사람으로 인식되는 것이
 * 최악의 실패다(남의 카운트를 누르게 된다). 랜덤 ID는 충돌 0, 개인정보 부담 최소.
 */
export type DeviceId = string;

export interface MemberDevice {
  deviceId: DeviceId;
  memberId: MemberId;
  /**
   * 표시 전용 요약 (예: "iPhone · Safari").
   * 식별 로직은 이 값을 절대 참조하지 않는다 (Design §7).
   */
  uaLabel: string | null;
  linkedAt: Millis;
  lastSeenAt: Millis;
}
