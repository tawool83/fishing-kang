import type { ComponentChildren } from 'preact';
import './Banner.css';

interface Props {
  children: ComponentChildren;
  tone?: 'info' | 'warn';
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * 안내 배너 — 카톡 인앱 브라우저 감지 등 (Plan FR-05, Design §5.4 ③).
 */
export function Banner({ children, tone = 'info', actionLabel, onAction }: Props) {
  return (
    <div class={`banner banner--${tone}`} role="status">
      <p class="banner__text">{children}</p>
      {actionLabel !== undefined && onAction !== undefined && (
        <button type="button" class="banner__action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
