import { effect } from '@preact/signals';

import type { MemberId } from '@domain/entities/member';
import { isDomainError } from '@domain/errors';
import type { ServerMessage, WritableClientMessage } from '@application/dto/ws-messages';

import { ProjectionRoomRepository } from '@infrastructure/client/ProjectionRoomRepository';
import { LocalStorageOutbox } from '@infrastructure/client/LocalStorageOutbox';
import {
  WsTransport,
  browserNetworkMonitor,
  browserSocketFactory,
} from '@infrastructure/client/WsTransport';

import { clock, ids, localStorageKv, soundStore } from '../services';
import { RoomStore } from './roomStore';
import { connectionStore } from './connectionStore';
import { snackbarStore } from './snackbarStore';

/**
 * 한 방에 대한 세션 — **클라이언트 배선의 중심** (Design §2.2).
 *
 * Projection(예측) · Outbox(대기열) · Transport(연결) · Store(화면)를 엮는다.
 * 화면 컴포넌트는 이 객체 하나만 보면 된다.
 *
 * 재연결 시 흐름이 중요하다:
 *   online 복귀 → hello 전송 → 서버가 snapshot 응답 → rebase(확정+pending)
 *   동시에 Outbox의 미전송 건을 순서대로 재전송 → 서버가 멱등 흡수 → ack
 */
export class RoomSession {
  readonly store: RoomStore;

  private readonly repo = new ProjectionRoomRepository();
  private readonly outbox: LocalStorageOutbox;
  private readonly transport: WsTransport;
  private wasOffline = false;
  /** 포디움 구독 해제 — 방을 떠날 때 끊는다 */
  private stopWatchingPodium: (() => void) | null = null;

  constructor(readonly code: string) {
    this.outbox = new LocalStorageOutbox(localStorageKv, code);

    this.transport = new WsTransport({
      url: `${location.origin.replace(/^http/, 'ws')}/api/rooms/${code}/ws`,
      factory: browserSocketFactory,
      network: browserNetworkMonitor,
      onMessage: (message) => {
        this.store.handleServerMessage(message);
        this.onServerMessage(message);
      },
      onStatus: (status) => {
        connectionStore.setStatus(status, clock.now());
        if (status === 'online') this.onOnline();
        if (status === 'offline') this.wasOffline = true;
      },
    });

    this.store = new RoomStore(this.repo, this.outbox, this.transport, clock, ids);
    // 모르는 참여자가 순위에 보이면 스냅샷을 다시 받는다 (새 입장 자가 치유)
    this.store.onNeedSnapshot = () => {
      this.transport.send({ t: 'hello' });
    };
    connectionStore.setPending(this.outbox.size());
  }

  start(): void {
    // Plan FR-19 — 7일 지난 미전송 건은 폐기한다 (방 TTL과 동일)
    const dropped = this.outbox.prune(clock.now() - 7 * 86_400_000);
    if (dropped.length > 0) {
      snackbarStore.show(`오래된 기록 ${String(dropped.length)}건은 전송하지 않았어요`);
    }
    connectionStore.setPending(this.outbox.size());

    // Plan FR-34 — 금·은·동이 바뀌면 딸랑딸랑. effect는 즉시 한 번 돌면서
    // 현재 포디움을 "소리 없이" 기준점으로 잡는다 (입장하자마자 울리면 안 된다).
    soundStore.reset();
    this.stopWatchingPodium = effect(() => {
      soundStore.onPodium(this.store.podium.value);
    });

    this.transport.connect();
  }

  stop(): void {
    this.stopWatchingPodium?.();
    this.stopWatchingPodium = null;
    this.transport.close();
  }

  retry(): void {
    this.transport.retryNow();
  }

  /** 서버 확정 상태를 다시 받는다 (대리 입력 진입처럼 남의 카드가 필요할 때) */
  refresh(): void {
    this.transport.send({ t: 'hello' });
  }

  // ── 사용자 동작 ──

  /**
   * +1 (Plan FR-09, FR-10).
   *
   * 쿨다운은 **클라이언트가 막는다** — UI가 버튼을 비활성화하므로 여기 도달하지 않지만,
   * 경합으로 들어오면 조용히 무시한다. 서버는 쿨다운을 보지 않는다 (Design §1.2).
   */
  tapPlus(speciesId: string, forMemberId?: MemberId): void {
    const target = forMemberId ?? this.store.myMemberId.value;
    if (target === null) return;
    if (this.store.cooldownRemaining(clock.now(), target) > 0) return;

    const id = ids.uuid();
    this.send(
      {
        t: 'catch',
        id,
        speciesId,
        at: clock.now(),
        ...(forMemberId === undefined ? {} : { forMemberId }),
      },
      () => {
        const name = this.speciesName(speciesId);
        const who = forMemberId === undefined ? '' : `${this.store.memberName(forMemberId)}에게 `;
        snackbarStore.show(`${who}${name} +1 기록했어요`, {
          label: '되돌리기',
          run: () => {
            this.undo(id);
          },
        });
      }
    );
  }

  /** −1 (Plan FR-11) — 쿨다운 없음. 해당 어종 가장 최근 유효 건을 취소한다 */
  tapMinus(speciesId: string, forMemberId?: MemberId): void {
    const target = forMemberId ?? this.store.myMemberId.value;
    if (target === null) return;
    if (!this.store.hasActiveCatch(target, speciesId)) return;

    const actionId = ids.uuid();
    this.send(
      {
        t: 'uncatch',
        actionId,
        speciesId,
        ...(forMemberId === undefined ? {} : { forMemberId }),
      },
      () => {
        const name = this.speciesName(speciesId);
        snackbarStore.show(`${name} 한 마리 취소했어요`, {
          label: '되돌리기',
          run: () => {
            this.restore(actionId);
          },
        });
      }
    );
  }

  /** +1 되돌리기 — 방금 만든 그 건만 취소한다 (Plan FR-12) */
  undo(targetId: string): void {
    this.send({ t: 'undo', actionId: ids.uuid(), targetId });
  }

  /** −1 되돌리기 — 취소했던 건을 되살린다 (Plan FR-12) */
  restore(actionId: string): void {
    this.send({ t: 'restore', actionId });
  }

  addSpecies(name: string, forMemberId?: MemberId): void {
    this.send(
      {
        t: 'addSpecies',
        id: ids.uuid(),
        name,
        ...(forMemberId === undefined ? {} : { forMemberId }),
      },
      () => {
        snackbarStore.show(`${name} 카드를 추가했어요`);
      }
    );
  }

  /**
   * Plan FR-08 — 0마리 카드 삭제. 기록이 있으면 로컬 규칙이 먼저 막고
   * 스낵바로 "숨기기를 쓰세요"를 안내한다.
   */
  removeCard(speciesId: string, forMemberId?: MemberId): void {
    const name = this.speciesName(speciesId);
    this.send(
      {
        t: 'removeCard',
        speciesId,
        ...(forMemberId === undefined ? {} : { forMemberId }),
      },
      () => {
        snackbarStore.show(`${name} 카드를 지웠어요`);
      }
    );
  }

  /** Plan FR-08 — 기록이 있는 카드는 숨기기만 가능하다 */
  setCardHidden(speciesId: string, hidden: boolean, forMemberId?: MemberId): void {
    const name = this.speciesName(speciesId);
    this.send(
      {
        t: 'hideCard',
        speciesId,
        hidden,
        ...(forMemberId === undefined ? {} : { forMemberId }),
      },
      () => {
        snackbarStore.show(hidden ? `${name} 카드를 숨겼어요` : `${name} 카드를 다시 꺼냈어요`);
      }
    );
  }

  addPhonelessMember(name: string): void {
    this.send({ t: 'addMember', id: ids.uuid(), name }, () => {
      snackbarStore.show(`${name} 님을 추가했어요`);
    });
  }

  endFishing(): void {
    this.send({ t: 'end' });
  }

  resumeFishing(): void {
    this.send({ t: 'resume' });
  }

  // ── 내부 ──

  private send(message: WritableClientMessage, onOk?: () => void): void {
    try {
      this.store.dispatch(message);
      onOk?.();
    } catch (e) {
      // 로컬 규칙 위반 — 서버까지 갈 필요가 없다
      snackbarStore.show(isDomainError(e) ? e.message : '기록하지 못했어요');
    }
  }

  private onOnline(): void {
    // 서버 확정 상태를 받아온다 → store가 rebase로 pending을 다시 올린다
    this.transport.send({ t: 'hello' });

    const flushed = this.store.flushOutbox();
    if (this.wasOffline && flushed > 0) {
      snackbarStore.show(`대기 중이던 ${String(flushed)}건을 전송했어요`);
    }
    this.wasOffline = false;
  }

  private onServerMessage(message: ServerMessage): void {
    // Plan FR-31 — 아무도 안 눌렀는데 끝났다면 이유를 알려줘야 한다
    if (message.t === 'ended' && message.auto) {
      snackbarStore.show('3일이 지나 낚시가 자동으로 종료됐어요');
      return;
    }

    // Plan FR-23 — 대리 입력을 받은 대상자에게 알림
    if (message.t !== 'proxied') return;
    const last = this.store.lastProxied;
    if (last === null) return;
    snackbarStore.show(`${last.by}님이 ${last.speciesName} ${last.delta > 0 ? '+1' : '−1'} 했어요`, {
      label: '되돌리기',
      run: () => {
        if (last.delta > 0) this.undo(last.targetId);
        else this.restore(last.targetId);
      },
    });
  }

  private speciesName(speciesId: string): string {
    return this.store.species.value.find((s) => s.id === speciesId)?.name ?? '';
  }
}
