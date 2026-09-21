import { AppButton } from './AppButton';
import './ConfirmDialog.css';

interface Props {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 확인 다이얼로그.
 *
 * Plan FR-04의 핵심 쓰임: "이 이름은 지금 다른 폰에서 접속 중이에요. 본인 맞나요?"
 *
 * Design Ref: §3.5 — 이건 **인증이 아니라 실수 방지**다. PIN은 없다(확정).
 * 확인만 누르면 통과한다.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel = '네, 맞아요',
  cancelLabel = '취소',
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div class="dialog__scrim" onClick={onCancel}>
      <div
        class="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2 class="dialog__title">{title}</h2>
        {body !== undefined && <p class="dialog__body">{body}</p>}
        <div class="dialog__actions">
          <AppButton variant="outline" size="md" onClick={onCancel}>
            {cancelLabel}
          </AppButton>
          <AppButton variant="primary" size="md" onClick={onConfirm}>
            {confirmLabel}
          </AppButton>
        </div>
      </div>
    </div>
  );
}
