import './CooldownRing.css';

interface Props {
  /** 0(방금 눌렀음) ~ 1(쿨다운 끝) */
  progress: number;
  /** 남은 초 (올림) */
  remainingSec: number;
}

const R = 22;
const CIRC = 2 * Math.PI * R;

/**
 * 10초 원형 게이지 (Plan FR-10, Design §5.4 ④).
 *
 * 쿨다운 중에는 +1 버튼 자리를 이 게이지가 대신한다.
 * "왜 안 눌리지?"가 아니라 "몇 초 남았지"로 읽히게 하는 게 목적이다.
 *
 * 남은 초는 **올림**한다 — 0.4초 남았는데 "0초"라고 쓰면 눌러지지 않는 이유가 설명되지 않는다.
 */
export function CooldownRing({ progress, remainingSec }: Props) {
  const clamped = Math.min(1, Math.max(0, progress));

  return (
    <div class="cooldown" role="timer" aria-label={`${String(remainingSec)}초 뒤에 누를 수 있어요`}>
      <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
        <circle cx="28" cy="28" r={R} class="cooldown__track" />
        <circle
          cx="28"
          cy="28"
          r={R}
          class="cooldown__fill"
          stroke-dasharray={CIRC}
          stroke-dashoffset={CIRC * (1 - clamped)}
        />
      </svg>
      <span class="cooldown__label">{remainingSec}초</span>
    </div>
  );
}
