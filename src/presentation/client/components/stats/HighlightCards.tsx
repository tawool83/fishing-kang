import type { Highlights } from '@domain/stats/highlights';
import { formatClock } from './SummaryGrid';
import './stats.css';

interface Props {
  highlights: Highlights;
  memberNames: Map<string, string>;
  speciesNames: Map<string, string>;
}

interface Card {
  icon: string;
  label: string;
  value: string;
}

/**
 * 하이라이트 (Plan FR-28, Design §5.4 ⑥).
 *
 * 숫자만 있는 통계는 금방 닫힌다. "첫 수는 누가", "언제 터졌나", "몇 번 뒤집혔나"가
 * 출조 후 단톡방에서 실제로 오가는 말이다. 그걸 그대로 카드로 만든다.
 *
 * 값이 없는 항목은 카드를 만들지 않는다 — 빈 카드가 늘어서면 오히려 초라해 보인다.
 */
export function HighlightCards({ highlights, memberNames, speciesNames }: Props) {
  const who = (id: string) => memberNames.get(id) ?? '';
  const what = (id: string) => speciesNames.get(id) ?? '';

  const cards: Card[] = [];

  if (highlights.firstCatch !== null) {
    cards.push({
      icon: '🎯',
      label: '첫 수',
      value: `${who(highlights.firstCatch.memberId)} · ${formatClock(highlights.firstCatch.at)}`,
    });
  }
  if (highlights.lastCatch !== null) {
    cards.push({
      icon: '🏁',
      label: '마지막 수',
      value: `${who(highlights.lastCatch.memberId)} · ${formatClock(highlights.lastCatch.at)}`,
    });
  }
  if (highlights.peakBucket !== null) {
    cards.push({
      icon: '🔥',
      label: '피크 타임',
      value: `${formatClock(highlights.peakBucket.bucketStart)} · ${String(highlights.peakBucket.total)}마리`,
    });
  }
  if (highlights.topSpecies !== null) {
    cards.push({
      icon: '🐟',
      label: '최다 어종',
      value: `${what(highlights.topSpecies.speciesId)} ${String(highlights.topSpecies.total)}마리`,
    });
  }
  if (highlights.mostDiverseMember !== null) {
    cards.push({
      icon: '🌈',
      label: '가장 다양하게',
      value: `${who(highlights.mostDiverseMember.memberId)} · ${String(highlights.mostDiverseMember.speciesCount)}종`,
    });
  }
  if (highlights.shortestGap !== null) {
    cards.push({
      icon: '⚡',
      label: '최단 간격',
      value: `${who(highlights.shortestGap.memberId)} · ${formatGap(highlights.shortestGap.gapMs)}`,
    });
  }
  if (highlights.leadChanges > 0) {
    cards.push({
      icon: '🔄',
      label: '1위 역전',
      value: `${String(highlights.leadChanges)}번`,
    });
  }

  if (cards.length === 0) return <p class="muted stats__empty">아직 기록이 없어요</p>;

  return (
    <ul class="highlights">
      {cards.map((c) => (
        <li class="highlights__card" key={c.label}>
          <span class="highlights__icon" aria-hidden="true">
            {c.icon}
          </span>
          <span class="highlights__label">{c.label}</span>
          <span class="highlights__value">{c.value}</span>
        </li>
      ))}
    </ul>
  );
}

function formatGap(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${String(seconds)}초`;
  return `${String(Math.floor(seconds / 60))}분 ${String(seconds % 60)}초`;
}
