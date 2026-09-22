/**
 * 딸랑딸랑 종소리 (Plan FR-34).
 *
 * 2026-09-23 — WebAudio 합성에서 **오디오 파일**로 바꿨다.
 * 원본은 `assets/bell-dinging-jam-fx-1-1-00-04.mp3`, 배포본은 `public/bell.mp3`로
 * **앞 2초만** 잘라 쓴다 (`pnpm build:bell`). 원본 4.87초 중 소리는 1.25초에
 * 끝나고 나머지는 무음이었다 — 208KB → 78KB.
 *
 * 그래도 78KB라 **모듈을 불러올 때 받지 않는다** — 첫 사용자 제스처에 `unlock()`이
 * 불릴 때 비로소 `Audio`를 만든다. 조과 화면이 뜨는 길목에 끼워 넣으면 약한
 * 전파에서 첫 화면이 그만큼 늦어지는데, 소리는 늦게 와도 된다.
 * 음소거 상태면 SoundStore가 unlock 자체를 건너뛰므로 아예 받지 않는다.
 *
 * iOS는 사용자 제스처 없이 소리를 못 낸다. 제스처 안에서 한 번 `play()`를 태워야
 * 이후 재생이 허용된다. 그 한 번을 **들리지 않게** 하려고 `muted`로 재생했다가
 * 즉시 되감는다 — iOS에서 `volume`은 읽기 전용이라 음량을 0으로 낮추는 수법은
 * 통하지 않고, 종소리가 그대로 울려버린다.
 */

/** 배포 경로. `public/bell.mp3` */
export const BELL_URL = '/bell.mp3';

type AudioFactory = (src: string) => HTMLAudioElement | null;

const browserAudio: AudioFactory = (src) => {
  if (typeof Audio === 'undefined') return null;
  const el = new Audio(src);
  el.preload = 'auto';
  return el;
};

export class BellSound {
  private audio: HTMLAudioElement | null = null;
  private broken = false;
  private unlocked = false;

  constructor(private readonly factory: AudioFactory = browserAudio) {}

  /** 첫 사용자 제스처에 호출 — iOS는 이걸 해야 나중에 소리가 난다 */
  unlock(): void {
    if (this.unlocked) return;

    const audio = this.ensure();
    if (audio === null) return;

    audio.muted = true;
    void audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        this.unlocked = true;
      })
      .catch(() => {
        /* 아직 허용되지 않았다 — 다음 제스처에 다시 시도한다 */
      })
      .finally(() => {
        audio.muted = false;
      });
  }

  /** 딸랑딸랑 */
  ring(): void {
    const audio = this.ensure();
    if (audio === null) return;

    // 연달아 울리면 앞 소리를 자르고 처음부터. 겹쳐 울리면 소리가 뭉개진다
    try {
      audio.currentTime = 0;
    } catch {
      /* 아직 메타데이터 전이라 되감을 수 없다 — 그냥 처음부터 난다 */
    }
    void audio.play().catch(() => undefined);
  }

  private ensure(): HTMLAudioElement | null {
    if (this.broken) return null;
    if (this.audio !== null) return this.audio;
    try {
      this.audio = this.factory(BELL_URL);
    } catch {
      // 오디오를 못 쓰는 환경 — 소리는 없어도 앱은 돌아야 한다
      this.broken = true;
    }
    return this.audio;
  }
}
