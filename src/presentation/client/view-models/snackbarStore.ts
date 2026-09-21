import { signal } from '@preact/signals';

export interface SnackbarAction {
  label: string;
  run: () => void;
}

export interface SnackbarItem {
  id: number;
  text: string;
  action?: SnackbarAction;
}

/** Plan FR-12 — 되돌리기 스낵바는 5초간 떠 있는다 */
export const SNACKBAR_MS = 5000;

/**
 * 스낵바 (Plan FR-12, FR-23, Design §5.4 ④⑦).
 *
 * 쓰임 셋:
 *  · "우럭 +1 기록했어요 · 되돌리기"  — 오조작 즉시 정정
 *  · "방장이 우럭 +1 했어요 · 되돌리기" — 대리 입력 알림
 *  · "대기 중이던 N건을 전송했어요"    — 재연결 안내
 *
 * 한 번에 하나만 보여준다. 손이 바쁜 상황에서 여러 개가 쌓이면 오히려 방해다.
 */
class SnackbarStore {
  readonly current = signal<SnackbarItem | null>(null);
  private seq = 0;
  private timer: number | null = null;

  show(text: string, action?: SnackbarAction): void {
    this.seq += 1;
    this.current.value = action === undefined ? { id: this.seq, text } : { id: this.seq, text, action };

    if (this.timer !== null) globalThis.clearTimeout(this.timer);
    this.timer = globalThis.setTimeout(() => {
      this.current.value = null;
      this.timer = null;
    }, SNACKBAR_MS) as unknown as number;
  }

  dismiss(): void {
    if (this.timer !== null) {
      globalThis.clearTimeout(this.timer);
      this.timer = null;
    }
    this.current.value = null;
  }
}

export const snackbarStore = new SnackbarStore();
