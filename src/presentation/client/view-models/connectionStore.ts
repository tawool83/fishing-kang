import { computed, signal } from '@preact/signals';
import type { ConnectionStatus } from '@infrastructure/client/WsTransport';

export type DisplayStatus = 'connecting' | 'online' | 'reconnecting' | 'offline' | 'ended';

/**
 * 연결 상태 뷰모델 (Plan FR-20, Design §5.4 ⑩).
 *
 * 상태 알약이 4가지를 보여준다: 연결됨 / 재연결 중 / 오프라인·대기 N건 / 낚시 종료.
 * 대기 건수는 Outbox 크기를 그대로 반영한다 — 사용자가 "내 탭이 남아 있다"를
 * 눈으로 확인할 수 있어야 한다.
 */
class ConnectionStore {
  readonly status = signal<ConnectionStatus>('idle');
  readonly pendingCount = signal(0);
  readonly ended = signal(false);
  readonly lastSyncAt = signal<number | null>(null);

  readonly display = computed<DisplayStatus>(() => {
    if (this.ended.value) return 'ended';
    switch (this.status.value) {
      case 'online':
        return 'online';
      case 'reconnecting':
        return 'reconnecting';
      case 'connecting':
        return 'connecting';
      case 'idle':
      case 'offline':
        return 'offline';
    }
  });

  readonly label = computed(() => {
    const pending = this.pendingCount.value;
    switch (this.display.value) {
      case 'online':
        return '연결됨';
      case 'connecting':
        return '연결 중';
      case 'reconnecting':
        return '재연결 중';
      case 'ended':
        return '낚시 종료';
      case 'offline':
        return pending > 0 ? `오프라인 · 대기 ${String(pending)}건` : '오프라인';
    }
  });

  setStatus(status: ConnectionStatus, at: number): void {
    this.status.value = status;
    if (status === 'online') this.lastSyncAt.value = at;
  }

  setPending(count: number): void {
    this.pendingCount.value = count;
  }

  setEnded(value: boolean): void {
    this.ended.value = value;
  }
}

export const connectionStore = new ConnectionStore();
