import type { Podium as PodiumData, RankEntry } from '@domain/rules/ranking';
import './Podium.css';

/**
 * 금·은·동 포디움 (Plan FR-14, Design §5.4 ④).
 *
 * 배치는 은(왼) · 금(가운데) · 동(오른쪽) — 시상대 모양 그대로다.
 *
 * 공동 순위 처리가 핵심이다:
 *  · 한 칸에 여러 명이 설 수 있다 → "공동" 배지
 *  · 공동 1위가 2명이면 **은메달 자리가 비고** 다음은 동메달이다
 *  · 빈 자리는 "—"로 그린다 (칸을 없애면 시상대 모양이 무너진다)
 */
export function Podium({ podium }: { podium: PodiumData }) {
  return (
    <div class="podium" role="list" aria-label="포디움">
      <Block place="silver" label="2" entries={podium.silver} />
      <Block place="gold" label="1" entries={podium.gold} />
      <Block place="bronze" label="3" entries={podium.bronze} />
    </div>
  );
}

function Block({
  place,
  label,
  entries,
}: {
  place: 'gold' | 'silver' | 'bronze';
  label: string;
  entries: RankEntry[];
}) {
  const empty = entries.length === 0;
  const tied = entries.length > 1;

  return (
    <div class={`podium__block podium__block--${place}`} role="listitem">
      <div class="podium__names">
        {empty ? (
          <span class="podium__empty" aria-label="해당 순위 없음">
            —
          </span>
        ) : (
          <>
            {tied && <span class="podium__tied">공동</span>}
            {entries.map((e) => (
              <span class="podium__name" key={e.memberId}>
                {e.displayName}
              </span>
            ))}
            <span class="podium__total">{entries[0]?.total ?? 0}</span>
          </>
        )}
      </div>

      <div class="podium__stand">
        {place === 'gold' && (
          <svg class="podium__trophy" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M7 3h10v6a5 5 0 0 1-10 0z" fill="var(--gold)" stroke="var(--ink)" stroke-width="1.6" />
            <path d="M12 14v3M9 20h6l-1-3h-4z" fill="var(--gold)" stroke="var(--ink)" stroke-width="1.6" stroke-linejoin="round" />
          </svg>
        )}
        <span class="podium__place">{label}</span>
      </div>
    </div>
  );
}
