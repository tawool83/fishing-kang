import type { StatsSummary } from '@domain/stats/aggregate';
import './stats.css';

/** ⑥ 통계 요약 4칸 (Plan FR-27, Design §5.4 ⑥) */
export function SummaryGrid({ summary }: { summary: StatsSummary }) {
  const cells = [
    { label: '총 조과', value: `${String(summary.totalCatch)}마리` },
    { label: '참여 인원', value: `${String(summary.memberCount)}명` },
    { label: '어종', value: `${String(summary.speciesCount)}종` },
    { label: '출조 시간', value: formatDuration(summary.durationMs) },
  ];

  return (
    <ul class="summary">
      {cells.map((c) => (
        <li class="summary__cell" key={c.label}>
          <span class="summary__value">{c.value}</span>
          <span class="summary__label">{c.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return '—';
  if (ms < 60_000) return '1분 미만';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${String(minutes)}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${String(hours)}시간` : `${String(hours)}시간 ${String(rest)}분`;
}

export function formatClock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
