import { computed, signal } from '@preact/signals';

import type { MemberId } from '@domain/entities/member';
import { computeRanking, podium, rankTotals } from '@domain/rules/ranking';
import type { RankEntry } from '@domain/rules/ranking';
import { isArchived, isResumable } from '@domain/rules/roomLifecycle';
import { normalizeName } from '@domain/rules/speciesName';
import { COOLDOWN_MS, cooldownRemainingMs } from '@domain/rules/cooldown';
import { countActive, pickVoidTarget } from '@domain/rules/catchLog';

import type { RoomState } from '@application/ports/RoomRepository';
import type { Outbox } from '@application/ports/Outbox';
import type { UseCaseDeps } from '@application/usecases/deps';
import type {
  ServerMessage,
  WritableClientMessage,
} from '@application/dto/ws-messages';
import { idempotencyKeyOf } from '@application/dto/ws-messages';
import type { CardCountDto } from '@application/dto/responses';
import { applyMessage, tryApplyMessage } from '@application/usecases/applyMessage';
import { NoPresence } from '@application/ports/Presence';

import type { ProjectionRoomRepository } from '@infrastructure/client/ProjectionRoomRepository';
import type { WsTransport } from '@infrastructure/client/WsTransport';
import type { Clock } from '@application/ports/Clock';
import type { IdGenerator } from '@application/ports/IdGenerator';
import { connectionStore } from './connectionStore';

/**
 * 방 상태 뷰모델 (Design §10.4 — Preact Signals, 파생값은 전부 computed).
 *
 * Design Ref: §2.2 — 낙관적 업데이트의 흐름이 여기 모여 있다:
 *
 *   탭 → applyMessage(Projection)로 즉시 로컬 확정 → Outbox 적재 → 전송 시도
 *   ack 수신 → Outbox에서 제거
 *   snapshot 수신 → rebase(확정 교체 + pending 재적용)
 *
 * 서버와 **같은 applyMessage**를 쓰기 때문에 예측과 확정이 갈릴 수 없다.
 */
export class RoomStore {
  /** 화면이 구독하는 상태 — 변경 시 version을 올려 재계산을 유발한다 */
  private readonly version = signal(0);

  readonly myMemberId = signal<MemberId | null>(null);
  readonly roomCode = signal<string>('');

  /** 직전 종료가 3일 상한에 의한 자동 종료였는가 (Plan FR-31) */
  lastEndWasAuto = false;

  /** 직전 `proxied` 알림 — 세션이 스낵바로 띄운다 (Plan FR-23) */
  lastProxied: { by: string; speciesName: string; delta: number; targetId: string } | null = null;

  /**
   * 서버가 브로드캐스트한 순위 (Design §4.3).
   *
   * 클라이언트는 **남의 조과 이벤트를 받지 않는다** — `snapshot`에만 들어 있고
   * `update`는 순위만 싣는다. 그래서 순위의 권위는 서버에 있고,
   * 여기에 내 미전송분만 얹어서 화면에 보여준다.
   */
  private readonly serverRanking = signal<RankEntry[] | null>(null);

  /** 모르는 멤버가 순위에 나타났을 때 스냅샷을 다시 받기 위한 훅 */
  onNeedSnapshot: (() => void) | null = null;

  /**
   * 멤버의 **표시 전용 부가 정보** — 접속 여부와 연결 기기 수.
   *
   * Design Ref: §5.4 ⑤ — 참여자 목록의 초록 점과 "2대 이상" 배지에 쓴다.
   *
   * 도메인 `Member` 엔티티에는 이 필드가 없다(접속 여부는 서버만 아는 런타임 상태이고,
   * 기기 수는 파생값이다). 그래서 스냅샷에서 따로 뽑아 여기 보관한다.
   * 이걸 안 하면 `toRoomState()`가 도메인 엔티티로 축약하면서 통째로 버려진다.
   */
  private readonly memberMeta = signal<Map<MemberId, MemberMeta>>(new Map());

  private readonly deps: UseCaseDeps;

  constructor(
    private readonly repo: ProjectionRoomRepository,
    private readonly outbox: Outbox,
    private readonly transport: WsTransport,
    clock: Clock,
    ids: IdGenerator
  ) {
    // 클라이언트는 접속자 정보를 스냅샷으로만 안다 — Presence는 서버의 몫이다
    this.deps = { repo, clock, ids, presence: new NoPresence() };
  }

  // ── 파생 상태 ──

  /**
   * Repository는 signal이 아니라 평범한 객체다. `version`을 읽어 두면
   * computed가 그것을 의존성으로 잡아서, `bump()` 때 다시 계산된다.
   */
  private track(): number {
    return this.version.value;
  }

  readonly room = computed(() => {
    this.track();
    return this.repo.getRoom();
  });

  readonly members = computed(() => {
    this.track();
    return this.repo.listMembers();
  });

  readonly species = computed(() => {
    this.track();
    return this.repo.listSpecies();
  });

  /**
   * 화면에 보이는 순위 = **서버 순위 + 내 미전송분**.
   *
   * 서버 순위만 쓰면 방금 누른 탭이 ack 전까지 반영되지 않아 화면이 굼떠 보이고,
   * 로컬 이벤트만 쓰면 남의 조과가 전혀 반영되지 않는다. 둘을 합쳐야 맞다.
   * 재랭킹은 도메인의 `rankTotals`가 하므로 순위 규칙이 두 벌이 되지 않는다.
   */
  readonly ranking = computed(() => {
    this.track();
    const server = this.serverRanking.value;
    if (server === null) {
      return computeRanking(this.repo.listMembers(), this.repo.listEvents());
    }

    const deltas = this.pendingDeltas();
    return rankTotals(
      server.map((e) => ({
        memberId: e.memberId,
        displayName: e.displayName,
        total: Math.max(0, e.total + (deltas.get(e.memberId) ?? 0)),
      }))
    );
  });

  readonly isHost = computed(() => {
    const room = this.room.value;
    const me = this.myMemberId.value;
    return room !== null && me !== null && room.hostMemberId === me;
  });

  readonly isEnded = computed(() => this.room.value?.status === 'ended');

  /** 금·은·동 3칸 (Plan FR-14) */
  readonly podium = computed(() => podium(this.ranking.value));

  /**
   * Plan FR-32 — 방장이 아직 재개해서 정정할 수 있는가.
   *
   * 시각 판정이라 computed로 두면 시간이 흘러도 갱신되지 않는다. 화면이 이미
   * 200ms마다 다시 그리므로(쿨다운 게이지) 그때 `now`를 받아 계산한다.
   */
  canResume(now: number): boolean {
    const room = this.room.value;
    return room !== null && isResumable(room, now);
  }

  /** 정정 시간이 지나 결과 열람만 남았는가 — 안내 문구에 쓴다 */
  isReadOnly(now: number): boolean {
    const room = this.room.value;
    return room !== null && isArchived(room, now);
  }

  /** 특정 멤버의 어종 카드 + 마릿수. 대리 입력 화면은 대상자 id를 넘긴다 */
  cardsOf(memberId: MemberId | null): CardView[] {
    this.track();
    if (memberId === null) return [];

    const events = this.repo.listEvents();
    const species = this.repo.listSpecies();
    const pendingKeys = new Set(this.outbox.pending().map((i) => i.key));

    return this.repo
      .listCards()
      .filter((c) => c.memberId === memberId && !c.hidden)
      .map((card) => {
        const name = species.find((s) => s.id === card.speciesId)?.name ?? '';
        // 이 카드에 미전송 조과가 남아 있는가 → 점선 테두리 (Design §5.4 ④)
        const hasPending = events.some(
          (e) =>
            e.memberId === memberId &&
            e.speciesId === card.speciesId &&
            e.voidedAt === null &&
            pendingKeys.has(e.id)
        );
        return {
          speciesId: card.speciesId,
          name,
          count: countActive(events, memberId, card.speciesId),
          hasPending,
        };
      });
  }

  /**
   * 내 카드 전체 — **숨긴 것 포함** (Plan FR-08 카드 관리용).
   *
   * `cardsOf()`는 화면 그리드용이라 숨긴 카드를 걸러내지만,
   * 관리 UI는 숨긴 카드를 다시 꺼낼 수 있어야 하므로 전부 준다.
   */
  manageableCards(memberId: MemberId | null): ManageableCard[] {
    this.track();
    if (memberId === null) return [];

    const events = this.repo.listEvents();
    const species = this.repo.listSpecies();

    return this.repo
      .listCards()
      .filter((c) => c.memberId === memberId)
      .map((card) => ({
        speciesId: card.speciesId,
        name: species.find((s) => s.id === card.speciesId)?.name ?? '',
        count: countActive(events, memberId, card.speciesId),
        hidden: card.hidden,
      }));
  }

  /** 방 사전 — 어종 추가 시트의 자동완성 (Plan FR-07) */
  speciesDictionary(memberId: MemberId | null): DictionaryEntry[] {
    this.track();
    const events = this.repo.listEvents();
    const mine = new Set(
      this.repo
        .listCards()
        .filter((c) => c.memberId === memberId)
        .map((c) => c.speciesId)
    );

    return this.repo.listSpecies().map((s) => ({
      id: s.id,
      name: s.name,
      roomTotal: events.filter((e) => e.voidedAt === null && e.speciesId === s.id).length,
      alreadyMine: mine.has(s.id),
    }));
  }

  /** −1 대상이 있는지 — 0마리면 버튼을 잠근다 (Plan FR-11) */
  hasActiveCatch(memberId: MemberId, speciesId: string): boolean {
    return pickVoidTarget(this.repo.listEvents(), memberId, speciesId) !== null;
  }

  /** 브로드캐스트로 온 접속자 목록을 기존 메타에 덮어쓴다 (기기 수는 유지) */
  private applyPresence(onlineMemberIds: MemberId[]): void {
    const online = new Set(onlineMemberIds);
    const next = new Map<MemberId, MemberMeta>();
    for (const [id, meta] of this.memberMeta.value) {
      next.set(id, { ...meta, online: online.has(id) });
    }
    // 아직 메타가 없는 멤버도 접속 중이면 기록해 둔다
    for (const id of online) {
      if (!next.has(id)) next.set(id, { online: true, deviceCount: 1 });
    }
    this.memberMeta.value = next;
  }

  /** Design §5.4 ⑤ — 접속 점·기기 수. 서버 스냅샷이 유일한 출처다 */
  metaOf(memberId: MemberId): MemberMeta {
    return this.memberMeta.value.get(memberId) ?? { online: false, deviceCount: 0 };
  }

  memberName(memberId: MemberId): string {
    return this.repo.findMember(memberId)?.displayName ?? '';
  }

  readonly cooldownTotalMs = COOLDOWN_MS;

  /** Plan FR-10 — 내 남은 쿨다운. 화면이 매초 다시 읽는다 */
  cooldownRemaining(at: number, memberId?: MemberId): number {
    const target = memberId ?? this.myMemberId.value;
    if (target === null) return 0;
    return cooldownRemainingMs(this.repo.listEvents(), target, at);
  }

  // ── 동작 ──

  /**
   * 쓰기 동작 하나를 처리한다.
   *
   * 1. 로컬에 즉시 반영 (낙관적 업데이트, Plan FR-09)
   * 2. Outbox 적재 — 전송 성공 여부와 무관하게 **먼저** 쌓는다
   * 3. 전송 시도. 실패해도 에러를 띄우지 않는다 (Design §6.3)
   *
   * 로컬 적용에서 DomainError가 나면 던진다 — 화면이 스낵바로 안내한다.
   */
  dispatch(message: WritableClientMessage): void {
    const actor = this.myMemberId.value;
    if (actor === null) return;

    applyMessage(this.deps, actor, message);
    this.bump();

    const key = idempotencyKeyOf(message);
    if (key !== null) {
      this.outbox.enqueue({ key, message, queuedAt: this.deps.clock.now() });
      connectionStore.setPending(this.outbox.size());
    }

    this.transport.send(message);
  }

  /** 재연결 직후 미전송 건을 순서대로 다시 보낸다 (Plan FR-19) */
  flushOutbox(): number {
    const pending = this.outbox.pending();
    for (const item of pending) this.transport.send(item.message);
    return pending.length;
  }

  handleServerMessage(message: ServerMessage): void {
    switch (message.t) {
      case 'snapshot':
        this.myMemberId.value = message.myMemberId;
        this.serverRanking.value = message.snapshot.ranking;
        this.memberMeta.value = new Map(
          message.snapshot.members.map((m) => [
            m.id,
            { online: m.online, deviceCount: m.deviceCount },
          ])
        );
        this.rebase(toRoomState(message.snapshot));
        break;

      case 'ack':
        this.outbox.ack(message.id);
        connectionStore.setPending(this.outbox.size());
        break;

      case 'error':
        // 서버가 거부했다 — 해당 pending을 버린다. 재전송해도 또 거부된다
        if (message.refId !== null) {
          this.outbox.ack(message.refId);
          connectionStore.setPending(this.outbox.size());
        }
        break;

      case 'proxied':
        this.lastProxied = {
          by: message.by,
          speciesName: message.speciesName,
          delta: message.delta,
          targetId: message.targetId,
        };
        // 방장이 만든 이벤트는 내 로컬 로그에 없다. 스냅샷을 받아와야
        // 내 카드 수가 맞고, 스낵바의 "되돌리기"도 동작한다 (Plan FR-23).
        this.onNeedSnapshot?.();
        break;

      case 'ended':
        this.lastEndWasAuto = message.auto;
        connectionStore.setEnded(true);
        // 서버 확정 상태를 다시 받아 화면을 잠근다
        this.applyRoomStatus('ended', message.endedAt);
        break;

      case 'resumed':
        connectionStore.setEnded(false);
        this.applyRoomStatus('active', null);
        break;

      case 'update':
        this.serverRanking.value = message.ranking;
        this.applyPresence(message.onlineMemberIds);
        this.applyRoomStatus(message.roomStatus, null);
        this.requestSnapshotIfUnknown(message.ranking, message.changedCards);
        this.bump();
        break;
    }
  }

  /**
   * Design Ref: §2.2.3 — 확정 상태를 통째로 갈아끼우고 미전송 pending을 다시 올린다.
   *
   * 이 순서 덕분에 스냅샷이 도착해도 내가 방금 누른 탭이 화면에서 사라지지 않는다.
   */
  private rebase(state: RoomState): void {
    const actor = this.myMemberId.value;
    const pending = this.outbox.pending();

    this.repo.rebase(state, () => {
      if (actor === null) return;
      for (const item of pending) {
        // 서버가 이미 처리했거나 방이 종료돼 무효가 된 건은 조용히 건너뛴다
        tryApplyMessage(this.deps, actor, item.message);
      }
    });

    this.bump();
  }

  /**
   * 모르는 참여자나 카드가 브로드캐스트에 나타나면 스냅샷을 다시 받는다 (자가 치유).
   *
   * Design Ref: §4.3 — `update`는 순위와 변경된 카드 수만 싣고 **이벤트는 싣지 않는다**.
   * 그래서 남이 새로 입장하거나 어종 카드를 추가한 사실은 스냅샷으로만 알 수 있다.
   * 방장 대리 입력은 남의 카드 목록이 있어야 하므로 이 보정이 꼭 필요하다.
   */
  private requestSnapshotIfUnknown(ranking: RankEntry[], changedCards: CardCountDto[]): void {
    const knownMembers = new Set(this.repo.listMembers().map((m) => m.id));
    if (ranking.some((e) => !knownMembers.has(e.memberId))) {
      this.onNeedSnapshot?.();
      return;
    }

    const unknownCard = changedCards.some(
      (c) => this.repo.findCard(c.memberId, c.speciesId) === null
    );
    if (unknownCard) this.onNeedSnapshot?.();
  }

  /** 아직 ack되지 않은 내 동작이 각 멤버의 총계에 주는 증감 */
  private pendingDeltas(): Map<MemberId, number> {
    const deltas = new Map<MemberId, number>();
    const me = this.myMemberId.value;
    if (me === null) return deltas;

    const bump = (memberId: MemberId, by: number) => {
      deltas.set(memberId, (deltas.get(memberId) ?? 0) + by);
    };

    for (const { message } of this.outbox.pending()) {
      switch (message.t) {
        case 'catch':
          bump(message.forMemberId ?? me, 1);
          break;
        case 'uncatch':
          bump(message.forMemberId ?? me, -1);
          break;
        case 'undo': {
          const event = this.repo.findEvent(message.targetId);
          if (event !== null) bump(event.memberId, -1);
          break;
        }
        case 'restore': {
          const event = this.repo.findEventByVoidActionId(message.actionId);
          if (event !== null) bump(event.memberId, 1);
          break;
        }
        default:
          break;
      }
    }
    return deltas;
  }

  /** 서버가 알려준 방 상태를 로컬에도 반영한다 (입력 잠금, Plan FR-17) */
  private applyRoomStatus(status: 'active' | 'ended', endedAt: number | null): void {
    const room = this.repo.getRoom();
    if (room === null || room.status === status) return;
    this.repo.setRoomStatus(status, endedAt);
    this.bump();
  }

  private bump(): void {
    this.version.value += 1;
  }
}

export interface MemberMeta {
  online: boolean;
  deviceCount: number;
}

export interface ManageableCard {
  speciesId: string;
  name: string;
  count: number;
  hidden: boolean;
}

export interface CardView {
  speciesId: string;
  name: string;
  count: number;
  hasPending: boolean;
}

export interface DictionaryEntry {
  id: string;
  name: string;
  roomTotal: number;
  alreadyMine: boolean;
}

/** WS 스냅샷 DTO → RoomRepository가 받는 RoomState */
function toRoomState(snapshot: {
  room: {
    code: string;
    name: string;
    status: 'active' | 'ended';
    hostMemberId: string;
    createdAt: number;
    endedAt: number | null;
  };
  members: { id: string; displayName: string; hasDevice: boolean }[];
  species: { id: string; name: string }[];
  cards: { memberId: string; speciesId: string; sortOrder: number; hidden: boolean }[];
  events: RoomState['events'];
}): RoomState {
  return {
    room: {
      ...snapshot.room,
      // 서버가 내려주지 않는 값 — 클라이언트는 TTL 판단을 하지 않는다
      lastActivityAt: snapshot.room.createdAt,
    },
    members: snapshot.members.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      // 서버와 같은 정규화를 써야 이름·어종 중복 판정이 갈리지 않는다
      normalized: normalizeName(m.displayName),
      joinedAt: snapshot.room.createdAt,
      hasDevice: m.hasDevice,
    })),
    devices: [],
    species: snapshot.species.map((s) => ({
      id: s.id,
      name: s.name,
      normalized: normalizeName(s.name),
      createdBy: snapshot.room.hostMemberId,
      createdAt: snapshot.room.createdAt,
    })),
    cards: snapshot.cards.map((c) => ({ ...c })),
    events: snapshot.events.map((e) => ({ ...e })),
  };
}
