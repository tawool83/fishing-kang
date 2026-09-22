import { useEffect, useState } from 'preact/hooks';
import { isDomainError } from '@domain/errors';
import type { StatsDto } from '@application/dto/responses';

import { AppButton } from '../components/AppButton';
import { Podium } from '../components/Podium';
import { podium } from '@domain/rules/ranking';
import { CumulativeChart } from '../components/stats/CumulativeChart';
import { HighlightCards } from '../components/stats/HighlightCards';
import { StatBar } from '../components/stats/StatBar';
import { StatBuckets } from '../components/stats/StatBuckets';
import { StatMatrix } from '../components/stats/StatMatrix';
import { SummaryGrid } from '../components/stats/SummaryGrid';
import { api } from '../services';
import './StatsBoard.css';

interface Props {
  code: string;
  isEnded: boolean;
  isHost: boolean;
  /** 방 상태가 바뀌면 다시 불러오기 위한 키 */
  refreshKey: number;
  /** Plan FR-32 — 종료 후 24시간이 지나면 재개할 수 없다 */
  canResume: boolean;
  onResume: () => void;
}

/**
 * ⑥ 통계 화면 (Plan FR-18, FR-27, FR-28, Design §5.4 ⑥).
 *
 * **진행 중에도 누구나 볼 수 있다** (FR-18) — 종료 전용이 아니다.
 *
 * 데이터는 서버 `GET /stats`에서 받는다. 클라이언트는 남의 조과 이벤트를
 * 갖고 있지 않아서 로컬로는 계산할 수 없다 (module-4에서 확인된 사실).
 */
export function StatsBoard({ code, isEnded, isHost, refreshKey, canResume, onResume }: Props) {
  const [stats, setStats] = useState<StatsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getStats(code)
      .then((result) => {
        if (alive) setStats(result);
      })
      .catch((e: unknown) => {
        if (alive) setError(isDomainError(e) ? e.message : '통계를 불러오지 못했어요.');
      });
    return () => {
      alive = false;
    };
  }, [code, refreshKey]);

  if (error !== null) return <p class="field__error stats__error">{error}</p>;
  if (stats === null) return <p class="muted stats__empty">통계를 불러오는 중…</p>;

  const memberNames = new Map(stats.perMember.map((m) => [m.id, m.name]));
  const speciesNames = new Map(stats.perSpecies.map((s) => [s.id, s.name]));
  const topMembers = stats.perMember.filter((m) => m.total > 0).map((m) => m.id);

  return (
    <div class="stats">
      <section class="stats__hero">
        <span class="stats__badge">{isEnded ? '낚시 종료' : '진행 중'}</span>
        <h2 class="stats__title">오늘의 강태공</h2>
        <Podium podium={podium(stats.ranking)} />
      </section>

      <SummaryGrid summary={stats.summary} />

      <Section title="하이라이트">
        <HighlightCards
          highlights={stats.highlights}
          memberNames={memberNames}
          speciesNames={speciesNames}
        />
      </Section>

      <Section title="사람별 조과">
        <StatBar items={stats.perMember} medalColored />
      </Section>

      <Section title="어종별 조과">
        <StatBar items={stats.perSpecies} />
      </Section>

      <Section title="시간대별 조과">
        <StatBuckets
          buckets={stats.buckets}
          peakStart={stats.highlights.peakBucket?.bucketStart ?? null}
        />
      </Section>

      <Section title="사람 × 어종">
        <StatMatrix matrix={stats.matrix} memberNames={memberNames} speciesNames={speciesNames} />
      </Section>

      <Section title="누적 추이">
        <CumulativeChart
          points={stats.cumulative}
          memberIds={topMembers}
          memberNames={memberNames}
        />
      </Section>

      {stats.proxiedCount > 0 && (
        <p class="muted stats__note">
          이 중 {stats.proxiedCount}건은 방장이 대신 입력했어요.
        </p>
      )}

      {isEnded && !canResume && (
        <p class="muted stats__note">
          정정할 수 있는 시간이 지났어요. 이제 결과만 볼 수 있어요.
        </p>
      )}

      <div class="stats__actions">
        {/* US-09는 P1 — MVP에서는 비활성 (Plan §2.2) */}
        <AppButton variant="outline" disabled>
          결과 카드 공유하기 (준비 중)
        </AppButton>
        {isHost && isEnded && canResume && (
          <AppButton variant="primary" onClick={onResume}>
            낚시 재개
          </AppButton>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: preact.ComponentChildren }) {
  return (
    <section class="stats__section">
      <h3 class="stats__section-title">{title}</h3>
      {children}
    </section>
  );
}
