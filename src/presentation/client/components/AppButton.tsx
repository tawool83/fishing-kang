import type { ComponentChildren } from 'preact';
import './AppButton.css';

interface Props {
  children: ComponentChildren;
  onClick?: () => void;
  variant?: 'primary' | 'outline' | 'ghost';
  /** lg = 64px (주요 동작) / md = 44px (보조) */
  size?: 'lg' | 'md';
  type?: 'button' | 'submit';
  disabled?: boolean;
  ariaLabel?: string;
}

/**
 * Design Ref: "Design Anchor" — 주요 버튼 64px, 그 외 터치 타깃 44px 이상.
 * 젖은 손·장갑 조작을 전제로 한다 (Plan 리스크 "오터치").
 *
 * 항상 진짜 `<button>`이다 — div에 onClick을 걸면 Tab이 건너뛴다 (Design §7 접근성).
 */
export function AppButton({
  children,
  onClick,
  variant = 'primary',
  size = 'lg',
  type = 'button',
  disabled = false,
  ariaLabel,
}: Props) {
  return (
    <button
      type={type}
      class={`btn btn--${variant} btn--${size}`}
      onClick={onClick}
      disabled={disabled}
      {...(ariaLabel === undefined ? {} : { 'aria-label': ariaLabel })}
    >
      {children}
    </button>
  );
}
