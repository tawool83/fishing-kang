import { useLayoutEffect, useRef } from 'preact/hooks';
import type { MemberId } from '@domain/entities/member';
import type { RankEntry } from '@domain/rules/ranking';
import './RankList.css';

interface Props {
  ranking: RankEntry[];
  myMemberId: MemberId | null;
  hostMemberId: string;
  /** 방장일 때만 전달된다 — 대리 입력 진입점 (Plan FR-21) */
  onProxy?: (memberId: MemberId) => void;
}

/** Design §5.4 ⑧ — 순위 변동 시 250ms ease-out */
const FLIP_MS = 250;

/**
 * ⑧ 전체 순위 펼침 (Design §5.4 ⑧).
 *
 * Plan FR-21 — **대리 입력의 진입점이 여기다**. 방장에게만 각 행에
 * "대신 입력" 버튼이 보이고, 본인 행에는 없다.
 * 일반 참여자에게는 버튼 자체가 렌더되지 않는다 (서버도 거부한다, FR-26).
 *
 * Plan FR-15 — **추월 애니메이션**. 순위가 바뀌면 행이 미끄러지듯 자리를 옮긴다.
 * 경쟁의 재미가 이 서비스의 존재 이유라(Plan WHY), 순위가 소리 없이 바뀌면
 * 가장 중요한 순간을 놓친다.
 */
export function RankList({ ranking, myMemberId, hostMemberId, onProxy }: Props) {
  const max = Math.max(1, ...ranking.map((r) => r.total));
  const rows = useRef(new Map<MemberId, HTMLLIElement>());
  const lastTop = useRef(new Map<MemberId, number>());

  /**
   * FLIP — 렌더 후 새 위치를 재고, 이전 위치로 되돌린 뒤 0으로 전환한다.
   *
   * `useLayoutEffect`라 브라우저가 중간 상태를 그리기 전에 끝난다.
   * `prefers-reduced-motion`은 전역 CSS가 전환 시간을 0으로 만들어 처리한다.
   */
  useLayoutEffect(() => {
    for (const [memberId, el] of rows.current) {
      const top = el.getBoundingClientRect().top;
      const previous = lastTop.current.get(memberId);
      lastTop.current.set(memberId, top);

      if (previous === undefined || Math.abs(previous - top) < 1) continue;

      // 새 자리에서 옛 자리로 되돌려 놓고
      el.style.transition = 'none';
      el.style.transform = `translateY(${String(previous - top)}px)`;

      // 다음 프레임에 놓아준다 — 브라우저가 그 사이를 애니메이션한다
      requestAnimationFrame(() => {
        el.style.transition = `transform ${String(FLIP_MS)}ms ease-out`;
        el.style.transform = '';
      });
    }

    // 목록에서 사라진 멤버의 측정값은 버린다
    for (const memberId of [...lastTop.current.keys()]) {
      if (!rows.current.has(memberId)) lastTop.current.delete(memberId);
    }
  });

  return (
    <ul class="ranks" aria-label="전체 순위">
      {ranking.map((entry) => {
        const isMe = entry.memberId === myMemberId;
        return (
          <li
            class={`ranks__row ${isMe ? 'ranks__row--me' : ''} ${entry.total === 0 ? 'ranks__row--zero' : ''}`}
            key={entry.memberId}
            ref={(el) => {
              if (el === null) rows.current.delete(entry.memberId);
              else rows.current.set(entry.memberId, el);
            }}
          >
            <span
              class={`ranks__badge ${entry.medal !== null ? `ranks__badge--${entry.medal}` : ''}`}
              aria-hidden="true"
            >
              {entry.rank}
            </span>

            <span class="ranks__name">
              {/* Plan FR-14 — 동점은 공동 순위. 눈에 보여야 규칙이 전달된다 */}
              {entry.tied && <span class="ranks__tied">공동</span>}
              {entry.displayName}
              {entry.memberId === hostMemberId && <span class="ranks__tag">방장</span>}
            </span>

            <span class="ranks__bar" aria-hidden="true">
              <span
                class={`ranks__fill ${entry.medal !== null ? `ranks__fill--${entry.medal}` : ''}`}
                style={{ width: `${String((entry.total / max) * 100)}%` }}
              />
            </span>

            <span
              class="ranks__total"
              aria-label={`${entry.displayName} ${entry.tied ? '공동 ' : ''}${String(entry.rank)}위, ${String(entry.total)}마리`}
            >
              {entry.total}
            </span>

            {onProxy !== undefined && !isMe && (
              <button
                type="button"
                class="ranks__proxy"
                onClick={() => {
                  onProxy(entry.memberId);
                }}
                aria-label={`${entry.displayName} 대신 입력하기`}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path
                    d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16z"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
