import './MemberRow.css';

interface Props {
  displayName: string;
  online: boolean;
  isHost: boolean;
  hasDevice: boolean;
  /** 연결된 기기 수. 2대 이상일 때만 배지로 표시 (Design §5.4 ⑤) */
  deviceCount?: number;
  onClick?: () => void;
  trailing?: string;
}

/**
 * 참여자 한 줄 (Design §5.4 ③⑤).
 *
 * 접속 중이면 초록 점 — 이름 선택 복구 시 "지금 다른 폰에서 접속 중"을
 * 고르는 실수를 줄이기 위한 신호다 (Plan FR-04).
 */
export function MemberRow({
  displayName,
  online,
  isHost,
  hasDevice,
  deviceCount = 0,
  onClick,
  trailing,
}: Props) {
  const label = `${displayName}${online ? ', 접속 중' : ''}${isHost ? ', 방장' : ''}`;

  const content = (
    <>
      <span class={`member__dot ${online ? 'member__dot--on' : ''}`} aria-hidden="true" />
      <span class="member__name">{displayName}</span>
      {isHost && <span class="member__badge member__badge--host">방장</span>}
      {!hasDevice && <span class="member__badge">폰 없음</span>}
      {deviceCount > 1 && <span class="member__badge">기기 {deviceCount}대</span>}
      {trailing !== undefined && <span class="member__trailing">{trailing}</span>}
    </>
  );

  if (onClick === undefined) {
    return <div class="member">{content}</div>;
  }

  return (
    <button type="button" class="member member--tappable" onClick={onClick} aria-label={label}>
      {content}
    </button>
  );
}
