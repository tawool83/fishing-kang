import { useEffect, useState } from 'preact/hooks';
import { isDomainError } from '@domain/errors';

import { AppButton } from '../components/AppButton';
import { InviteCodeTiles } from '../components/InviteCodeTiles';
import { ShareRow } from '../components/ShareRow';
import { navigate } from '../router';
import { api } from '../services';
import './CreatedRoom.css';

/**
 * ② 방 생성 완료 (Design §5.4 ②).
 *
 * 여기서 할 일은 하나다: **코드를 사람들에게 전달하는 것**.
 * 그래서 코드 타일과 공유 버튼이 화면의 전부다.
 *
 * NOTE: 설계상 이 화면에는 QR 카드가 있다. 2026-09-21 결정으로 보류했고
 * 코드 타일 + 링크 공유로 대체했다 (Design §5.4 ②의 QrCard 항목 미구현).
 */
export function CreatedRoom({ code }: { code: string }) {
  const [roomName, setRoomName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .getRoom(code)
      .then((info) => {
        setRoomName(info.room.name);
      })
      .catch((e: unknown) => {
        setError(isDomainError(e) ? e.message : '방 정보를 불러오지 못했어요.');
      });
  }, [code]);

  const shareUrl = `${location.origin}/r/${code}`;

  const copyCode = () => {
    void navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        globalThis.setTimeout(() => {
          setCopied(false);
        }, 2000);
      })
      .catch(() => {
        /* 클립보드 차단 — 사용자가 직접 읽어서 전달하면 된다 */
      });
  };

  return (
    <main class="page created">
      <header class="created__header">
        <div class="created__trophy" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="56" height="56">
            <path
              d="M14 8h20v10a10 10 0 0 1-20 0z"
              fill="var(--gold)"
              stroke="var(--ink)"
              stroke-width="2.5"
            />
            <path
              d="M14 12H9a6 6 0 0 0 6 8M34 12h5a6 6 0 0 1-6 8"
              fill="none"
              stroke="var(--ink)"
              stroke-width="2.5"
            />
            <path
              d="M24 28v6M17 40h14l-2-6H19z"
              fill="var(--gold)"
              stroke="var(--ink)"
              stroke-width="2.5"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <h1 class="created__title">방이 만들어졌어요</h1>
        {roomName !== '' && <p class="created__room-name">{roomName}</p>}
      </header>

      <div class="page__body">
        {error !== null && <p class="field__error">{error}</p>}

        <section class="stack">
          <h2 class="created__label">초대코드</h2>
          <InviteCodeTiles mode="display" code={code} onCopy={copyCode} />
          <p class="muted created__hint">
            {copied ? '코드를 복사했어요' : '탭하면 코드가 복사돼요'}
          </p>
        </section>

        <section class="stack">
          <h2 class="created__label">링크로 초대하기</h2>
          <ShareRow url={shareUrl} roomName={roomName} />
        </section>
      </div>

      <div class="created__footer">
        <AppButton
          onClick={() => {
            navigate({ name: 'room', code });
          }}
        >
          출조 시작 · 방 들어가기
        </AppButton>
      </div>
    </main>
  );
}
