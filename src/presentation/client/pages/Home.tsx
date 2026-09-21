import { useState } from 'preact/hooks';
import { DISPLAY_NAME_MAX } from '@domain/entities/member';
import { ROOM_NAME_MAX } from '@domain/entities/room';
import { isDomainError } from '@domain/errors';

import { AppButton } from '../components/AppButton';
import { HeroIllustration } from '../components/HeroIllustration';
import { navigate } from '../router';
import { api, readRecentRooms, rememberRoom } from '../services';
import './Home.css';

type Mode = 'landing' | 'create';

/**
 * ① 홈 (Design §5.4 ①).
 *
 * 큰 버튼 두 개가 전부다 — 가입도 설치도 없다. 그게 이 서비스의 전제다.
 */
export function Home() {
  const [mode, setMode] = useState<Mode>('landing');
  const [roomName, setRoomName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const recent = readRecentRooms();

  const create = () => {
    setBusy(true);
    setError(null);
    api
      .createRoom(roomName, displayName)
      .then((result) => {
        rememberRoom(result.code, roomName.trim());
        navigate({ name: 'created', code: result.code });
      })
      .catch((e: unknown) => {
        setError(isDomainError(e) ? e.message : '방을 만들지 못했어요.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <main class="page home">
      <HeroIllustration />

      <div class="page__body">
        <header class="home__brand">
          <h1 class="home__logo">강태공</h1>
          <p class="home__tagline">잡을 때마다 한 번 탭. 금·은·동은 실시간으로.</p>
        </header>

        {mode === 'landing' && (
          <>
            <div class="stack">
              <AppButton
                onClick={() => {
                  setMode('create');
                }}
              >
                방 만들기
              </AppButton>
              <AppButton
                variant="outline"
                onClick={() => {
                  navigate({ name: 'join', code: '' });
                }}
              >
                초대코드 입력
              </AppButton>
            </div>

            {recent.length > 0 && (
              <section class="home__recent">
                <h2 class="home__recent-title">최근 들어간 방</h2>
                <ul class="home__recent-list">
                  {recent.map((room) => (
                    <li key={room.code}>
                      <button
                        type="button"
                        class="home__recent-item"
                        onClick={() => {
                          navigate({ name: 'room', code: room.code });
                        }}
                      >
                        <span class="home__recent-name">{room.name}</span>
                        <span class="home__recent-code">{room.code}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {mode === 'create' && (
          <form
            class="stack"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <div class="field">
              <label class="field__label" for="room-name">
                방 이름
              </label>
              <input
                id="room-name"
                class="field__input"
                value={roomName}
                maxLength={ROOM_NAME_MAX}
                placeholder="9월 27일 태안 선상"
                onInput={(e) => {
                  setRoomName((e.target as HTMLInputElement).value);
                }}
              />
            </div>

            <div class="field">
              <label class="field__label" for="my-name">
                내 이름
              </label>
              <input
                id="my-name"
                class="field__input"
                value={displayName}
                maxLength={DISPLAY_NAME_MAX}
                placeholder="홍길동"
                onInput={(e) => {
                  setDisplayName((e.target as HTMLInputElement).value);
                }}
              />
            </div>

            {error !== null && <p class="field__error">{error}</p>}

            <AppButton
              type="submit"
              disabled={busy || roomName.trim() === '' || displayName.trim() === ''}
            >
              {busy ? '만드는 중…' : '만들기'}
            </AppButton>
            <AppButton
              variant="ghost"
              size="md"
              onClick={() => {
                setMode('landing');
              }}
            >
              뒤로
            </AppButton>
          </form>
        )}
      </div>
    </main>
  );
}
