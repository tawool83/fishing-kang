import type { ComponentChildren } from 'preact';
import './BottomSheet.css';

interface Props {
  title: string;
  children: ComponentChildren;
  onClose: () => void;
}

/**
 * 바텀 시트 셸 — ⑤ 방 정보 / ⑨ 어종 추가가 공유한다 (Design §5.4 ⑤⑨).
 *
 * 스크림 탭으로 닫힌다. 드래그 핸들은 "아래로 내려서 닫는다"는 힌트다.
 */
export function BottomSheet({ title, children, onClose }: Props) {
  return (
    <div class="sheet__scrim" onClick={onClose}>
      <section
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div class="sheet__handle" aria-hidden="true" />
        <header class="sheet__header">
          <h2 class="sheet__title">{title}</h2>
          <button type="button" class="sheet__close" onClick={onClose} aria-label="닫기">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </header>
        <div class="sheet__body">{children}</div>
      </section>
    </div>
  );
}
