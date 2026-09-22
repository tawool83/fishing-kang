import { computeRanking } from '@domain/rules/ranking';
import { isPurgeable } from '@domain/rules/roomLifecycle';
import { DomainError, isDomainError } from '@domain/errors';
import type { MemberId } from '@domain/entities/member';

import type { UseCaseDeps } from '@application/usecases/deps';
import type { ClientMessage, ServerMessage } from '@application/dto/ws-messages';
import { idempotencyKeyOf } from '@application/dto/ws-messages';

import { AutoEndFishing } from '@application/usecases/room/AutoEndFishing';
import { CreateRoom } from '@application/usecases/room/CreateRoom';
import { JoinRoom } from '@application/usecases/room/JoinRoom';
import { ClaimMember } from '@application/usecases/room/ClaimMember';
import { GetRoomStats } from '@application/usecases/stats/GetRoomStats';
import { affectedMemberOf, applyMessage } from '@application/usecases/applyMessage';

import { SqliteRoomRepository } from '@infrastructure/worker/SqliteRoomRepository';
import { SystemClock } from '@infrastructure/worker/SystemClock';
import { CryptoIdGenerator } from '@infrastructure/worker/CryptoIdGenerator';
import { WsBroadcaster, attachmentOf } from '@infrastructure/worker/WsBroadcaster';
import { RoomLifecycleAlarm } from '@infrastructure/worker/RoomLifecycleAlarm';

import { errorJson, json } from './env';
import { toErrorResponse } from './errorMapping';
import { parseClientMessage } from './codec';
import { cardCountsFor, roomInfoDto, snapshotDto } from './dto-builders';

/**
 * 방 Durable Object — **Worker 쪽 Composition Root** (Design §9.2).
 *
 * 방 1개 = DO 1개. 상태·동기화·브로드캐스트·수명 관리가 전부 여기서 끝난다.
 * Port 구현을 여기서 조립해 UseCase에 주입한다. UseCase 자체는 클라이언트와 공유한다.
 *
 * WebSocket은 Hibernation API로 받는다 — 대기 중 과금이 거의 0이라
 * 무료 플랜에서 상시 운영이 가능하다 (Plan §7.2).
 */
export class RoomDurableObject {
  private readonly repo: SqliteRoomRepository;
  private readonly hub: WsBroadcaster;
  private readonly lifecycle: RoomLifecycleAlarm;
  private readonly deps: UseCaseDeps;

  constructor(private readonly ctx: DurableObjectState) {
    this.repo = new SqliteRoomRepository(ctx.storage.sql);
    this.hub = new WsBroadcaster(ctx);
    this.lifecycle = new RoomLifecycleAlarm(ctx.storage);
    this.deps = {
      repo: this.repo,
      clock: new SystemClock(),
      ids: new CryptoIdGenerator(),
      presence: this.hub,
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const deviceId = request.headers.get('X-Device-Id') ?? '';
    const uaLabel = request.headers.get('X-Ua-Label');

    try {
      switch (`${request.method} ${url.pathname}`) {
        case 'POST /create':
          return await this.handleCreate(request, deviceId, uaLabel);
        case 'GET /info':
          return this.handleInfo(deviceId);
        case 'POST /join':
          return await this.handleJoin(request, deviceId, uaLabel);
        case 'POST /claim':
          return await this.handleClaim(request, deviceId, uaLabel);
        case 'GET /stats':
          return this.handleStats();
        case 'GET /ws':
          return this.handleUpgrade(request, deviceId);
        default:
          return errorJson(404, 'NOT_FOUND', '경로를 찾을 수 없어요.');
      }
    } catch (e) {
      return toErrorResponse(e);
    }
  }

  // ── HTTP ──

  private async handleCreate(
    request: Request,
    deviceId: string,
    uaLabel: string | null
  ): Promise<Response> {
    const body = (await request.json()) as { code?: string; roomName?: string; displayName?: string };

    const result = new CreateRoom(this.deps).execute({
      code: String(body.code ?? ''),
      roomName: String(body.roomName ?? ''),
      displayName: String(body.displayName ?? ''),
      deviceId,
      uaLabel,
    });

    await this.rescheduleAlarm();
    return json(result, { status: 201 });
  }

  private handleInfo(deviceId: string): Response {
    if (this.repo.getRoom() === null) {
      return errorJson(404, 'ROOM_NOT_FOUND', '방을 찾을 수 없어요.');
    }
    return json(roomInfoDto(this.repo, this.hub, this.memberOf(deviceId)));
  }

  private async handleJoin(
    request: Request,
    deviceId: string,
    uaLabel: string | null
  ): Promise<Response> {
    const body = (await request.json()) as { displayName?: string };

    const result = new JoinRoom(this.deps).execute({
      displayName: String(body.displayName ?? ''),
      deviceId,
      uaLabel,
    });

    await this.rescheduleAlarm();
    this.broadcastUpdate(result.memberId);
    return json(result, { status: 201 });
  }

  private async handleClaim(
    request: Request,
    deviceId: string,
    uaLabel: string | null
  ): Promise<Response> {
    const body = (await request.json()) as {
      memberId?: string;
      confirmedOnlineConflict?: boolean;
    };

    const result = new ClaimMember(this.deps).execute({
      memberId: String(body.memberId ?? ''),
      deviceId,
      uaLabel,
      confirmedOnlineConflict: body.confirmedOnlineConflict === true,
    });

    await this.rescheduleAlarm();
    return json(result);
  }

  private handleStats(): Response {
    if (this.repo.getRoom() === null) {
      return errorJson(404, 'ROOM_NOT_FOUND', '방을 찾을 수 없어요.');
    }
    return json(new GetRoomStats(this.deps).execute());
  }

  // ── WebSocket ──

  private handleUpgrade(request: Request, deviceId: string): Response {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return errorJson(426, 'UPGRADE_REQUIRED', 'WebSocket 업그레이드가 필요해요.');
    }
    if (this.repo.getRoom() === null) {
      return errorJson(404, 'ROOM_NOT_FOUND', '방을 찾을 수 없어요.');
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ memberId: this.memberOf(deviceId), deviceId });

    // 접속자가 늘었다 — 다른 사람 화면의 초록 점을 갱신해 준다 (Design §5.4 ⑤)
    this.broadcastUpdate(null);

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): void {
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    const message = parseClientMessage(text);

    if (message === null) {
      this.hub.send(ws, {
        t: 'error',
        code: 'BAD_MESSAGE',
        message: '알 수 없는 요청이에요.',
        refId: null,
      });
      return;
    }

    try {
      this.dispatch(ws, message);
    } catch (e) {
      this.hub.send(ws, {
        t: 'error',
        code: isDomainError(e) ? e.code : 'BAD_MESSAGE',
        message: isDomainError(e) ? e.message : '요청을 처리하지 못했어요.',
        refId: idempotencyKeyOf(message),
      });
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason);
    } catch {
      // 이미 닫힌 경우 — 무시
    }
    // 접속자 목록이 바뀌었으니 초록 점을 갱신해 준다
    this.broadcastUpdate(null);
  }

  private dispatch(ws: WebSocket, message: ClientMessage): void {
    if (message.t === 'hello') {
      this.hub.send(ws, {
        t: 'snapshot',
        snapshot: snapshotDto(this.repo, this.hub),
        myMemberId: attachmentOf(ws)?.memberId ?? null,
      });
      return;
    }

    const actorMemberId = attachmentOf(ws)?.memberId;
    if (actorMemberId == null) {
      throw new DomainError('MEMBER_NOT_FOUND', '먼저 방에 입장해주세요.');
    }

    // 분기는 Application의 applyMessage가 갖는다 (클라이언트와 공유)
    const result = applyMessage(this.deps, actorMemberId, message);

    const key = idempotencyKeyOf(message);
    if (key !== null) this.hub.send(ws, { t: 'ack', id: key });

    // 상태가 바뀌면 다음 마감도 바뀐다 (낚시 3일 ↔ 종료 후 7일)
    if (result.kind === 'end' || result.kind === 'resume') {
      void this.rescheduleAlarm();
    }

    switch (result.kind) {
      case 'end':
        this.hub.broadcast({ t: 'ended', endedAt: result.endedAt, auto: false });
        break;
      case 'resume':
        this.hub.broadcast({ t: 'resumed' });
        break;
      case 'catch':
      case 'uncatch':
        // Plan FR-23 — 대리 입력 대상자에게만 알림
        if (result.isProxy && !result.idempotent) {
          this.notifyProxied(
            actorMemberId,
            result.event.memberId,
            result.event.speciesId,
            result.kind === 'catch' ? 1 : -1,
            result.event.id
          );
        }
        break;
      default:
        break;
    }

    this.broadcastUpdate(affectedMemberOf(result));
  }

  // ── 알람 (TTL) ──

  /**
   * 방 수명 알람 — 자동 종료와 삭제를 한 진입점에서 처리한다 (Plan FR-30~33).
   *
   * 알람이 울린 이유를 저장해 두지 않는다. 대신 방의 현재 상태를 보고 "지금 뭘
   * 해야 하는지"를 매번 다시 판정한다 — 그사이 방장이 종료·재개를 눌러 상태가
   * 바뀌었을 수 있기 때문이다. 아무 조건에도 걸리지 않으면 다음 마감으로 다시 건다.
   */
  async alarm(): Promise<void> {
    const room = this.repo.getRoom();
    if (room === null) return;

    // ① 종료 후 7일 — 데이터를 지운다 (Plan FR-33, 개인정보 최소화 Design §7)
    if (isPurgeable(room, Date.now())) {
      this.repo.deleteAll();
      return;
    }

    // ② 낚시 3일 초과 — 자동으로 종료시킨다 (Plan FR-31)
    const auto = new AutoEndFishing(this.deps).execute();
    if (auto.ended && auto.endedAt !== null) {
      this.hub.broadcast({ t: 'ended', endedAt: auto.endedAt, auto: true });
      this.broadcastUpdate(null);
    }

    // ③ 다음 마감(자동 종료 → 삭제)으로 알람을 다시 건다
    await this.rescheduleAlarm();
  }

  // ── 내부 헬퍼 ──

  private memberOf(deviceId: string): MemberId | null {
    if (deviceId === '') return null;
    return this.repo.findDevice(deviceId)?.memberId ?? null;
  }

  /**
   * Design Ref: §4.3 — 10명 규모라 변경마다 전체 순위를 통째로 브로드캐스트한다.
   * 델타 최적화는 하지 않는다.
   */
  private broadcastUpdate(changedMemberId: MemberId | null): void {
    const room = this.repo.getRoom();
    if (room === null) return;

    const message: ServerMessage = {
      t: 'update',
      ranking: computeRanking(this.repo.listMembers(), this.repo.listEvents()),
      changedCards: changedMemberId === null ? [] : cardCountsFor(this.repo, changedMemberId),
      roomStatus: room.status,
      onlineMemberIds: this.hub.onlineMembers(),
    };
    this.hub.broadcast(message);
  }

  /** Plan FR-23 — 대리 입력 대상자에게만 알림 */
  private notifyProxied(
    actorId: MemberId,
    targetId: MemberId,
    speciesId: string,
    delta: 1 | -1,
    eventId: string
  ): void {
    const actor = this.repo.findMember(actorId);
    const species = this.repo.findSpecies(speciesId);
    this.hub.sendTo(targetId, {
      t: 'proxied',
      by: actor?.displayName ?? '방장',
      speciesName: species?.name ?? '',
      delta,
      targetId: eventId,
    });
  }

  private async rescheduleAlarm(): Promise<void> {
    const room = this.repo.getRoom();
    if (room !== null) await this.lifecycle.schedule(room);
  }
}
