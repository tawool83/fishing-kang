import type { TimeBucket } from '@domain/stats/aggregate';
import { formatClock } from './SummaryGrid';
import './stats.css';

interface Props {
  buckets: TimeBucket[];
  /** 피크 구간을 강조한다 (Design §5.4 ⑥) */
  peakStart: number | null;
}

/**
 * 30분 단위 시간대 막대 (Plan FR-27).
 *
 * "언제 터졌나"가 출조 후 대화의 절반이다. 피크 구간만 색을 달리해
 * 한눈에 보이게 한다.
 */
export function StatBuckets({ buckets, peakStart }: Props) {
  if (buckets.length === 0) return <p class="muted stats__empty">아직 기록이 없어요</p>;

  const max = Math.max(1, ...buckets.map((b) => b.total));

  return (
    <div class="buckets" role="img" aria-label="30분 단위 시간대별 조과">
      {buckets.map((b) => {
        const isPeak = b.bucketStart === peakStart;
        return (
          <div class="buckets__col" key={b.bucketStart}>
            <span class="buckets__count">{b.total > 0 ? b.total : ''}</span>
            <span
              class={`buckets__bar ${isPeak ? 'buckets__bar--peak' : ''}`}
              style={{ height: `${String(Math.max(2, (b.total / max) * 100))}%` }}
            />
            <span class="buckets__time">{formatClock(b.bucketStart)}</span>
          </div>
        );
      })}
    </div>
  );
}
