import './stats.css';

export interface BarItem {
  id: string;
  name: string;
  total: number;
}

interface Props {
  items: BarItem[];
  /** 1~3위를 금·은·동으로 칠할지 (사람별 조과에만 적용) */
  medalColored?: boolean;
  emptyText?: string;
}

const MEDAL = ['var(--gold)', 'var(--silver)', 'var(--bronze)'];

/**
 * 가로 막대 (Plan FR-27, Design §5.4 ⑥).
 *
 * 차트 라이브러리를 쓰지 않는다 — 막대 하나에 `<div>` 폭만 있으면 되는데
 * 라이브러리를 넣으면 번들 예산(gzip 150KB)을 통째로 잡아먹는다.
 */
export function StatBar({ items, medalColored = false, emptyText = '아직 기록이 없어요' }: Props) {
  if (items.length === 0) return <p class="muted stats__empty">{emptyText}</p>;

  const max = Math.max(1, ...items.map((i) => i.total));

  return (
    <ul class="bars">
      {items.map((item, index) => (
        <li class="bars__row" key={item.id}>
          <span class="bars__name">{item.name}</span>
          <span class="bars__track">
            <span
              class="bars__fill"
              style={{
                width: `${String((item.total / max) * 100)}%`,
                background:
                  medalColored && item.total > 0 && index < 3
                    ? MEDAL[index]
                    : 'var(--sea)',
              }}
            />
          </span>
          <span class="bars__value">{item.total}</span>
        </li>
      ))}
    </ul>
  );
}
