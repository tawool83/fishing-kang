import { useState } from 'preact/hooks';
import { connectionStore } from '../view-models/connectionStore';
import './ConnectionPill.css';

/**
 * ⑩ 연결 상태 알약 (Plan FR-20, Design §5.4 ⑩).
 *
 * 4가지 상태를 보여준다: 연결됨 / 재연결 중 / 오프라인·대기 N건 / 낚시 종료.
 *
 * 대기 건수를 노출하는 게 핵심이다 — 끊긴 상태에서 사용자가 제일 궁금한 건
 * "내가 누른 게 남아 있나"다. 숫자로 보여주면 불안이 사라진다.
 */
export function ConnectionPill({ onRetry }: { onRetry: () => void }) {
  const [open, setOpen] = useState(false);

  const display = connectionStore.display.value;
  const label = connectionStore.label.value;
  const pending = connectionStore.pendingCount.value;
  const lastSync = connectionStore.lastSyncAt.value;

  return (
    <div class="conn">
      <button
        type="button"
        class={`conn__pill conn__pill--${display}`}
        onClick={() => {
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-label={`연결 상태: ${label}`}
      >
        {display === 'reconnecting' ? (
          <span class="conn__spinner" aria-hidden="true" />
        ) : display === 'offline' ? (
          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
            <path
              d="M6 18a4 4 0 0 1 0-8 6 6 0 0 1 11.6-1.5A3.75 3.75 0 0 1 20 18z"
              fill="currentColor"
            />
          </svg>
        ) : (
          <span class="conn__dot" aria-hidden="true" />
        )}
        <span class="conn__label">{label}</span>
      </button>

      {open && (
        <div class="conn__popover" role="dialog" aria-label="연결 상세">
          <p class="conn__row">
            마지막 동기화 <strong>{formatAgo(lastSync)}</strong>
          </p>
          <p class="conn__row">
            대기 중 <strong>{pending}건</strong>
          </p>
          <button
            type="button"
            class="conn__retry"
            onClick={() => {
              setOpen(false);
              onRetry();
            }}
          >
            지금 다시 시도
          </button>
        </div>
      )}
    </div>
  );
}

function formatAgo(at: number | null): string {
  if (at === null) return '아직 없음';
  const diff = Date.now() - at;
  if (diff < 60_000) return '방금';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${String(minutes)}분 전`;
  return `${String(Math.floor(minutes / 60))}시간 전`;
}
