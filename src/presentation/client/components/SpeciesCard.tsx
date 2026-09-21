import { CooldownRing } from './CooldownRing';
import { FishIcon } from './FishIcon';
import './SpeciesCard.css';

interface Props {
  name: string;
  count: number;
  /** 쿨다운 남은 ms. 0이면 누를 수 있다 */
  cooldownMs: number;
  cooldownTotalMs: number;
  /** 아직 서버에 전송되지 않은 건이 이 카드에 있는가 */
  hasPending: boolean;
  disabled: boolean;
  onPlus: () => void;
  onMinus: () => void;
}

/**
 * 어종 카드 (Design §5.4 ④).
 *
 * 조작성이 전부인 컴포넌트다:
 *  · +1은 **64px 풀폭** — 젖은 손·장갑으로도 눌러야 한다
 *  · −1은 우상단 작은 원형 — 오터치를 막으려고 시각적으로는 작게,
 *    터치 영역은 44px로 유지한다 (Plan 리스크 "오터치")
 *  · 0마리면 −1 비활성 (Plan FR-11, 음수 불가)
 *  · 쿨다운 중이면 +1 자리에 원형 게이지 (Plan FR-10)
 *  · 미전송 건이 있으면 점선 테두리 (Design §5.4 ④)
 */
export function SpeciesCard({
  name,
  count,
  cooldownMs,
  cooldownTotalMs,
  hasPending,
  disabled,
  onPlus,
  onMinus,
}: Props) {
  const cooling = cooldownMs > 0;
  const remainingSec = Math.ceil(cooldownMs / 1000);

  return (
    <div class={`species ${hasPending ? 'species--pending' : ''}`}>
      <button
        type="button"
        class="species__minus"
        onClick={onMinus}
        disabled={disabled || count === 0}
        aria-label={`${name} 한 마리 취소`}
      >
        <span aria-hidden="true">−</span>
      </button>

      <div class="species__head">
        <FishIcon name={name} />
        <span class="species__name">{name}</span>
      </div>

      <div class="species__count" aria-label={`${name} ${String(count)}마리`}>
        {count}
      </div>

      {cooling ? (
        <CooldownRing progress={1 - cooldownMs / cooldownTotalMs} remainingSec={remainingSec} />
      ) : (
        <button
          type="button"
          class="species__plus"
          onClick={onPlus}
          disabled={disabled}
          aria-label={`${name} 한 마리 추가`}
        >
          +1
        </button>
      )}
    </div>
  );
}
