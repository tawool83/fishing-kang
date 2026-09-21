import { useEffect, useState } from 'preact/hooks';
import { DISPLAY_NAME_MAX } from '@domain/entities/member';
import { isValidCode } from '@domain/rules/inviteCode';
import { isDomainError } from '@domain/errors';
import type { RoomInfoDto } from '@application/dto/responses';

import { AppButton } from '../components/AppButton';
import { Banner } from '../components/Banner';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { InviteCodeTiles } from '../components/InviteCodeTiles';
import { MemberRow } from '../components/MemberRow';
import { navigate } from '../router';
import { api, inAppBrowser, rememberRoom } from '../services';
import {
  externalBrowserUrl,
  inAppBrowserLabel,
} from '@infrastructure/client/InAppBrowserDetector';
import './JoinRoom.css';

/**
 * ③ 초대코드 입장 (Design §5.4 ③).
 *
 * FR-02~06이 전부 여기 모인다:
 *  · 코드 6자리 입력 / 링크로 자동 채움
 *  · 이 기기가 이미 멤버면 **입장 화면을 건너뛴다** (FR-03)
 *  · 새 이름으로 입장 / 기존 이름 선택으로 이어서 하기 (FR-04)
 *  · 카톡 인앱 브라우저 안내 (FR-05)
 *  · 이름 중복 거부 (FR-06)
 */
export function JoinRoom({ code: initialCode }: { code: string }) {
  // 모듈 상수는 콜백 안에서 좁혀지지 않으므로 지역 변수로 고정한다
  const inApp = inAppBrowser;
  const [code, setCode] = useState(initialCode);
  const [info, setInfo] = useState<RoomInfoDto | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<{ memberId: string; name: string } | null>(null);

  // 코드가 6자리가 되면 방을 조회한다
  useEffect(() => {
    if (!isValidCode(code)) {
      setInfo(null);
      return;
    }
    setError(null);
    api
      .getRoom(code)
      .then((result) => {
        setInfo(result);
        // FR-03 — 이 기기가 이미 멤버면 바로 조과 화면으로
        if (result.myMemberId !== null) {
          rememberRoom(result.room.code, result.room.name);
          navigate({ name: 'room', code: result.room.code }, true);
        }
      })
      .catch((e: unknown) => {
        setInfo(null);
        setError(isDomainError(e) ? e.message : '방을 찾을 수 없어요.');
      });
  }, [code]);

  const enterWith = (promise: Promise<{ memberId: string }>) => {
    setBusy(true);
    setError(null);
    promise
      .then(() => {
        if (info !== null) rememberRoom(info.room.code, info.room.name);
        navigate({ name: 'room', code });
      })
      .catch((e: unknown) => {
        if (isDomainError(e) && e.code === 'MEMBER_ONLINE') {
          const memberId = String(e.details?.['memberId'] ?? '');
          const member = info?.members.find((m) => m.id === memberId);
          setConflict({ memberId, name: member?.displayName ?? '이 이름' });
          return;
        }
        setError(isDomainError(e) ? e.message : '입장하지 못했어요.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <main class="page join">
      <div class="page__body">
        {inApp !== null && (
          <Banner
            tone="warn"
            actionLabel="외부로 열기"
            onAction={() => {
              const target = externalBrowserUrl(inApp, location.href);
              if (target !== null) location.href = target;
            }}
          >
            {inAppBrowserLabel(inApp)} 안에서 열었어요. 사파리나 크롬으로 열면 다음
            출조에도 이어서 쓸 수 있어요.
          </Banner>
        )}

        <section class="stack">
          <h1 class="join__title">초대코드 입력</h1>
          <InviteCodeTiles mode="input" code={code} onChange={setCode} autoFocus={code === ''} />
        </section>

        {error !== null && info === null && <p class="field__error">{error}</p>}

        {info !== null && (
          <>
            <section class="join__room card">
              <h2 class="join__room-name">{info.room.name}</h2>
              <p class="muted">
                방장 {info.members.find((m) => m.isHost)?.displayName ?? '-'} · 참여{' '}
                {info.members.length}명
                {info.room.status === 'ended' && ' · 종료됨'}
              </p>
            </section>

            {info.room.status === 'active' && (
              <form
                class="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  enterWith(api.join(code, displayName));
                }}
              >
                <div class="field">
                  <label class="field__label" for="join-name">
                    내 이름
                  </label>
                  <input
                    id="join-name"
                    class="field__input"
                    value={displayName}
                    maxLength={DISPLAY_NAME_MAX}
                    placeholder="철수"
                    onInput={(e) => {
                      setDisplayName((e.target as HTMLInputElement).value);
                    }}
                  />
                </div>
                {error !== null && <p class="field__error">{error}</p>}
                <AppButton type="submit" disabled={busy || displayName.trim() === ''}>
                  {busy ? '입장 중…' : '입장'}
                </AppButton>
              </form>
            )}

            {info.members.length > 0 && (
              <section class="stack">
                <h2 class="join__label">이미 참여 중인 사람</h2>
                <p class="muted join__hint">
                  내 이름을 고르면 이어서 할 수 있어요. 기록도 그대로예요.
                </p>
                <ul class="join__members">
                  {info.members.map((m) => (
                    <li key={m.id}>
                      <MemberRow
                        displayName={m.displayName}
                        online={m.online}
                        isHost={m.isHost}
                        hasDevice={m.hasDevice}
                        onClick={() => {
                          enterWith(api.claim(code, m.id));
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      {conflict !== null && (
        <ConfirmDialog
          title={`${conflict.name}, 지금 다른 폰에서 접속 중이에요`}
          body="본인 맞나요? 맞다면 이 폰에서도 같이 쓸 수 있어요."
          confirmLabel="네, 본인이에요"
          onCancel={() => {
            setConflict(null);
          }}
          onConfirm={() => {
            const target = conflict.memberId;
            setConflict(null);
            enterWith(api.claim(code, target, true));
          }}
        />
      )}
    </main>
  );
}
