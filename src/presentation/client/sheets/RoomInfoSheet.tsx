import { useState } from 'preact/hooks';
import { DISPLAY_NAME_MAX } from '@domain/entities/member';
import type { RankEntry } from '@domain/rules/ranking';

import { AppButton } from '../components/AppButton';
import { BottomSheet } from '../components/BottomSheet';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { InviteCodeTiles } from '../components/InviteCodeTiles';
import { MemberRow } from '../components/MemberRow';
import { ShareRow } from '../components/ShareRow';
import type { RoomSession } from '../view-models/roomSession';
import './RoomInfoSheet.css';

interface Props {
  session: RoomSession;
  onClose: () => void;
}

/**
 * ⑤ 방 정보 시트 (Design §5.4 ⑤).
 *
 * 두 가지 일을 한다:
 *  1. 코드·링크 공유 (누구나)
 *  2. **방장 메뉴** — 참여자 추가 / 낚시 종료·재개 (Plan FR-17, FR-24)
 *
 * 방장 메뉴는 일반 참여자에게 **렌더 자체가 되지 않는다**.
 * 서버도 거부하지만, 보이지 않는 게 먼저다 (Design §5.4 ⑦).
 *
 * NOTE: 설계상 여기에 QR 카드가 있다. 2026-09-21 결정으로 보류했다.
 */
export function RoomInfoSheet({ session, onClose }: Props) {
  const { store } = session;
  const room = store.room.value;
  const ranking = store.ranking.value;
  const isHost = store.isHost.value;
  const isEnded = store.isEnded.value;

  const [newName, setNewName] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);

  if (room === null) return null;

  const totalOf = (memberId: string) =>
    ranking.find((r: RankEntry) => r.memberId === memberId)?.total ?? 0;

  return (
    <>
      <BottomSheet title={room.name} onClose={onClose}>
        <section class="stack">
          <h3 class="info__label">초대코드</h3>
          <InviteCodeTiles
            mode="display"
            code={room.code}
            onCopy={() => {
              void navigator.clipboard.writeText(room.code).catch(() => undefined);
            }}
          />
        </section>

        <section class="stack">
          <h3 class="info__label">링크로 초대하기</h3>
          <ShareRow url={`${location.origin}/r/${room.code}`} roomName={room.name} />
        </section>

        <section class="stack">
          <h3 class="info__label">참여자 {store.members.value.length}명</h3>
          <ul class="info__members">
            {store.members.value.map((m) => {
              const meta = store.metaOf(m.id);
              return (
                <li key={m.id}>
                  <MemberRow
                    displayName={m.displayName}
                    online={meta.online}
                    deviceCount={meta.deviceCount}
                    isHost={m.id === room.hostMemberId}
                    hasDevice={m.hasDevice}
                    trailing={`${String(totalOf(m.id))}마리`}
                  />
                </li>
              );
            })}
          </ul>
        </section>

        {isHost && (
          <section class="info__host">
            <h3 class="info__label">방장 메뉴</h3>

            <form
              class="info__add"
              onSubmit={(e) => {
                e.preventDefault();
                session.addPhonelessMember(newName);
                setNewName('');
              }}
            >
              <input
                class="field__input"
                value={newName}
                maxLength={DISPLAY_NAME_MAX}
                placeholder="폰 없는 참여자 이름"
                aria-label="폰 없는 참여자 이름"
                onInput={(e) => {
                  setNewName((e.target as HTMLInputElement).value);
                }}
              />
              <AppButton type="submit" size="md" variant="outline" disabled={newName.trim() === ''}>
                참여자 추가
              </AppButton>
            </form>

            {isEnded ? (
              <AppButton
                variant="outline"
                onClick={() => {
                  session.resumeFishing();
                  onClose();
                }}
              >
                낚시 재개
              </AppButton>
            ) : (
              <AppButton
                onClick={() => {
                  setConfirmEnd(true);
                }}
              >
                낚시 종료
              </AppButton>
            )}
          </section>
        )}

        <p class="muted info__privacy">
          이름과 조과 기록은 마지막 활동 후 <strong>7일</strong> 뒤 자동으로 지워져요.
        </p>
      </BottomSheet>

      {confirmEnd && (
        <ConfirmDialog
          title="낚시를 종료할까요?"
          body="종료하면 모두의 입력이 잠겨요. 방장이 다시 열 수 있어요."
          confirmLabel="종료하기"
          onCancel={() => {
            setConfirmEnd(false);
          }}
          onConfirm={() => {
            setConfirmEnd(false);
            session.endFishing();
            onClose();
          }}
        />
      )}
    </>
  );
}
