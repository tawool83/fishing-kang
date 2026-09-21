import type { CumulativePoint } from '@domain/stats/aggregate';
import './stats.css';

interface Props {
  points: CumulativePoint[];
  memberIds: string[];
  memberNames: Map<string, string>;
}

const W = 320;
const H = 140;
const PAD = 6;

const LINE_COLORS = [
  'var(--gold)',
  'var(--silver)',
  'var(--bronze)',
  'var(--sea-3)',
  'var(--marlin)',
  'var(--fish-gree)',
];

/**
 * 사람별 누적 추이 선 그래프 (Plan FR-27).
 *
 * Design Ref: §5.4 ⑥ — **역전 드라마 확인용**이다.
 * 선이 교차하는 지점이 곧 "그때 뒤집혔지" 하는 이야깃거리다.
 *
 * 인라인 SVG로 직접 그린다 (차트 라이브러리 미사용).
 */
export function CumulativeChart({ points, memberIds, memberNames }: Props) {
  if (points.length < 2) return <p class="muted stats__empty">기록이 더 쌓이면 보여드릴게요</p>;

  const first = points[0]!.at;
  const last = points[points.length - 1]!.at;
  const span = Math.max(1, last - first);
  const maxTotal = Math.max(
    1,
    ...points.flatMap((p) => memberIds.map((id) => p.byMember[id] ?? 0))
  );

  const x = (at: number) => PAD + ((at - first) / span) * (W - PAD * 2);
  const y = (v: number) => H - PAD - (v / maxTotal) * (H - PAD * 2);

  return (
    <div class="cumul">
      <svg viewBox={`0 0 ${String(W)} ${String(H)}`} role="img" aria-label="사람별 누적 조과 추이">
        {memberIds.map((id, i) => {
          const d = points
            .map((p, idx) => `${idx === 0 ? 'M' : 'L'}${String(x(p.at))} ${String(y(p.byMember[id] ?? 0))}`)
            .join(' ');
          return (
            <path
              key={id}
              d={d}
              fill="none"
              stroke={LINE_COLORS[i % LINE_COLORS.length]}
              stroke-width="2.5"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          );
        })}
      </svg>

      <ul class="cumul__legend">
        {memberIds.map((id, i) => (
          <li key={id}>
            <span
              class="cumul__swatch"
              style={{ background: LINE_COLORS[i % LINE_COLORS.length] }}
              aria-hidden="true"
            />
            {memberNames.get(id) ?? ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
