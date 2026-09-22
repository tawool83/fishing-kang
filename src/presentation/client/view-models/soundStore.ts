import { signal } from '@preact/signals';

import { podiumKey } from '@domain/rules/ranking';
import type { Podium } from '@domain/rules/ranking';
import type { SyncKeyValue } from '@infrastructure/client/storage';
import { BellSound } from '@infrastructure/client/BellSound';

const MUTE_KEY = 'gt.muted';

/**
 * 순위 변동 종소리 (Plan FR-34).
 *
 * 금·은·동 **구성이 바뀔 때만** 울린다. 누가 한 마리 더 잡아 격차가 벌어지는 건
 * 순위 변동이 아니므로 조용하다. 10명이 동시에 탭해도 시상대가 그대로면 안 울린다.
 *
 * 첫 지문은 **소리 없이** 기록한다 — 방에 들어오자마자 기존 순위를 보고
 * 종을 치면 "방금 역전됐다"는 신호가 거짓이 된다.
 *
 * 음소거는 기기에 저장한다. 배에서 조용히 해야 하는 사람이 매번 끄게 할 수는 없다.
 */
export class SoundStore {
  readonly muted = signal(false);

  private lastKey: string | null = null;

  constructor(
    private readonly kv: SyncKeyValue,
    private readonly bell = new BellSound()
  ) {
    this.muted.value = kv.get(MUTE_KEY) === '1';
  }

  toggleMute(): void {
    const next = !this.muted.value;
    this.muted.value = next;
    this.kv.set(MUTE_KEY, next ? '1' : '0');
    // 켜는 순간 한 번 들려준다 — 소리가 나는지 확인시켜 주는 편이 친절하다
    if (!next) this.bell.ring();
  }

  /**
   * 첫 사용자 제스처에 호출 — iOS는 이걸 해야 소리가 난다.
   *
   * 음소거 중이면 건너뛴다. 종소리는 78KB 파일이라(BellSound.ts), 소리를 끈
   * 사람에게까지 받게 할 이유가 없다. 나중에 음소거를 풀면 `toggleMute`의
   * 확인용 한 번이 사용자 제스처 안에서 나므로 거기서 자연히 풀린다.
   */
  unlock(): void {
    if (this.muted.value) return;
    this.bell.unlock();
  }

  /**
   * 새 포디움을 보고 필요하면 종을 친다.
   *
   * 화면이 다시 그려질 때마다 불려도 안전하다 — 지문이 같으면 아무 일도 없다.
   */
  onPodium(next: Podium): void {
    const key = podiumKey(next);
    const previous = this.lastKey;
    this.lastKey = key;

    if (previous === null || previous === key) return;
    if (this.muted.value) return;
    this.bell.ring();
  }

  /** 다른 방으로 옮겨가면 지문을 버린다 (새 방의 첫 포디움은 울리지 않아야 한다) */
  reset(): void {
    this.lastKey = null;
  }
}
