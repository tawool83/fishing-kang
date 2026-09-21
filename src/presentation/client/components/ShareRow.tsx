import { useState } from 'preact/hooks';
import { AppButton } from './AppButton';
import './ShareRow.css';

interface Props {
  url: string;
  roomName: string;
}

/**
 * 링크 복사 / 공유하기 (Design §5.4 ②).
 *
 * Web Share API가 있으면 모바일 공유 시트를, 없으면 복사로 떨어진다.
 * 단톡방에 링크를 뿌리는 게 이 서비스의 기본 유입 경로다.
 *
 * NOTE: QR 카드는 2026-09-21 결정으로 보류했다. 코드 타일 + 링크로 충분하다고 보고,
 * 필요해지면 여기 옆에 붙인다 (Design §5.4 ②의 QrCard 항목은 미구현 상태).
 */
export function ShareRow({ url, roomName }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        globalThis.setTimeout(() => {
          setCopied(false);
        }, 2000);
      })
      .catch(() => {
        /* 클립보드 차단 — 사용자가 직접 선택해 복사하면 된다 */
      });
  };

  const share = () => {
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (nav.share === undefined) {
      copy();
      return;
    }
    void nav
      .share({ title: `강태공 · ${roomName}`, text: '같이 조과 기록해요', url })
      .catch(() => {
        /* 사용자가 취소 — 아무 일도 없다 */
      });
  };

  return (
    <div class="share">
      <p class="share__url">{url}</p>
      <div class="share__actions">
        <AppButton variant="outline" size="md" onClick={copy}>
          {copied ? '복사했어요' : '링크 복사'}
        </AppButton>
        <AppButton variant="outline" size="md" onClick={share}>
          공유하기
        </AppButton>
      </div>
    </div>
  );
}
