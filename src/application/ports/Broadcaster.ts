import type { MemberId } from '@domain/entities/member';
import type { ServerMessage } from '../dto/ws-messages';

/**
 * Design Ref: §4.3 — 10명 규모라 변경마다 전체 순위를 통째로 브로드캐스트한다.
 * 델타 최적화는 하지 않는다.
 */
export interface Broadcaster {
  /** 방의 모든 접속자에게 */
  broadcast(message: ServerMessage): void;
  /** 특정 멤버의 모든 기기에게 (대리 입력 알림 등) */
  sendTo(memberId: MemberId, message: ServerMessage): void;
}

/** 브로드캐스트가 필요 없는 경로(HTTP 조회, 테스트)용 */
export class NoBroadcaster implements Broadcaster {
  readonly sent: Array<{ to: MemberId | null; message: ServerMessage }> = [];

  broadcast(message: ServerMessage): void {
    this.sent.push({ to: null, message });
  }

  sendTo(memberId: MemberId, message: ServerMessage): void {
    this.sent.push({ to: memberId, message });
  }
}
