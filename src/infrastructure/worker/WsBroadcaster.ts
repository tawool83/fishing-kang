import type { MemberId } from '@domain/entities/member';
import type { Broadcaster } from '@application/ports/Broadcaster';
import type { Presence } from '@application/ports/Presence';
import type { ServerMessage } from '@application/dto/ws-messages';

export interface SocketAttachment {
  memberId: MemberId | null;
  deviceId: string;
}

/**
 * Design Ref: §6.1(Plan) — WebSocket Hibernation.
 *
 * 연결 목록을 메모리에 들고 있지 않고 `ctx.getWebSockets()`로 매번 조회한다.
 * DO가 최면(hibernate)에서 깨어나도 연결과 attachment가 복원되기 때문이다.
 * 대기 중 과금이 거의 0이 되는 것이 무료 플랜 상주의 핵심이다.
 *
 * Presence도 같은 소스에서 읽는다 — 접속 중 여부의 단일 출처.
 */
export class WsBroadcaster implements Broadcaster, Presence {
  constructor(private readonly ctx: DurableObjectState) {}

  broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      trySend(ws, payload);
    }
  }

  sendTo(memberId: MemberId, message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      if (attachmentOf(ws)?.memberId === memberId) trySend(ws, payload);
    }
  }

  send(ws: WebSocket, message: ServerMessage): void {
    trySend(ws, JSON.stringify(message));
  }

  isOnline(memberId: MemberId): boolean {
    for (const ws of this.ctx.getWebSockets()) {
      if (attachmentOf(ws)?.memberId === memberId) return true;
    }
    return false;
  }

  onlineMembers(): MemberId[] {
    const ids = new Set<MemberId>();
    for (const ws of this.ctx.getWebSockets()) {
      const memberId = attachmentOf(ws)?.memberId;
      if (memberId != null) ids.add(memberId);
    }
    return [...ids];
  }
}

export function attachmentOf(ws: WebSocket): SocketAttachment | null {
  const raw = ws.deserializeAttachment() as unknown;
  if (raw === null || typeof raw !== 'object') return null;
  const a = raw as Partial<SocketAttachment>;
  if (typeof a.deviceId !== 'string') return null;
  return { memberId: typeof a.memberId === 'string' ? a.memberId : null, deviceId: a.deviceId };
}

function trySend(ws: WebSocket, payload: string): void {
  try {
    ws.send(payload);
  } catch {
    // 이미 닫힌 소켓 — Hibernation 환경에서 정상적으로 발생한다. 무시한다.
  }
}
