import { useEffect, useState } from 'preact/hooks';
import type { MemberId } from '@domain/entities/member';

import { AppButton } from '../components/AppButton';
import { Snackbar } from '../components/Snackbar';
import { SpeciesCard } from '../components/SpeciesCard';
import { AddSpeciesSheet } from '../sheets/AddSpeciesSheet';
import type { RoomSession } from '../view-models/roomSession';
import { useNow } from '../hooks/useNow';
import './ProxyBoard.css';

interface Props {
  session: RoomSession;
  targetId: MemberId;
  onExit: () => void;
}

/**
 * ⑦ 방장 대리 입력 화면 (Plan FR-21~23, Design §5.4 ⑦).
 *
 * 이 화면에서 가장 중요한 건 **내 화면과 헷갈리지 않는 것**이다.
 * 호박색 배경 + 상단 배너 + 경고 줄무늬로 확실히 구분한다.
 * 잘못 알고 엉뚱한 사람에게 입력하면 되돌리기도 번거롭다.
 *
 * 쿨다운은 **대상자 기준**이다 (Plan FR-22) — 방장이 대신 누른 직후
 * 대상자가 모르고 또 누르는 중복 입력을 쿨다운이 자연히 막아준다.
 */
export function ProxyBoard({ session, targetId, onExit }: Props) {
  const [showAddSpecies, setShowAddSpecies] = useState(false);
  const now = useNow(200);

  // 대상자의 카드 목록은 스냅샷으로만 들어온다 — 진입 시 최신 상태를 당겨온다
  useEffect(() => {
    session.refresh();
  }, [session, targetId]);

  const { store } = session;
  const name = store.memberName(targetId);
  const cards = store.cardsOf(targetId);
  const entry = store.ranking.value.find((r) => r.memberId === targetId);
  const isEnded = store.isEnded.value;

  // Plan FR-22 — 대상자의 쿨다운을 본다. 방장 본인 쿨다운과는 별개다
  const cooldownMs = store.cooldownRemaining(now, targetId);

  return (
    <main class="page proxy">
      <div class="proxy__stripe" aria-hidden="true" />

      <header class="proxy__banner">
        <div class="proxy__banner-text">
          <strong>{name} 대신 입력 중</strong>
          <span class="proxy__sub">+1 쿨다운은 {name} 기준으로 걸려요</span>
        </div>
        <button type="button" class="proxy__exit" onClick={onExit}>
          내 화면으로
        </button>
      </header>

      <div class="proxy__body">
        <p class="proxy__summary">
          {name} · <strong>{entry?.total ?? 0}마리</strong>
          {entry !== undefined && ` · ${entry.tied ? '공동 ' : ''}${String(entry.rank)}위`}
        </p>

        {isEnded && (
          <p class="board__locked" role="status">
            낚시가 종료됐어요. 정정하려면 먼저 재개해야 해요.
          </p>
        )}

        <div class="board__grid">
          {cards.map((card) => (
            <SpeciesCard
              key={card.speciesId}
              name={card.name}
              count={card.count}
              cooldownMs={cooldownMs}
              cooldownTotalMs={store.cooldownTotalMs}
              hasPending={card.hasPending}
              disabled={isEnded}
              onPlus={() => {
                session.tapPlus(card.speciesId, targetId);
              }}
              onMinus={() => {
                session.tapMinus(card.speciesId, targetId);
              }}
            />
          ))}
        </div>

        {cards.length === 0 && (
          <p class="muted board__placeholder">{name}의 카드가 아직 없어요.</p>
        )}

        <AppButton
          variant="outline"
          disabled={isEnded}
          onClick={() => {
            setShowAddSpecies(true);
          }}
        >
          + {name}의 어종 추가
        </AppButton>
      </div>

      <Snackbar />

      {showAddSpecies && (
        <AddSpeciesSheet
          forName={name}
          dictionary={store.speciesDictionary(targetId)}
          myCards={store.manageableCards(targetId)}
          onRemove={(speciesId) => {
            session.removeCard(speciesId, targetId);
          }}
          onToggleHidden={(speciesId, hidden) => {
            session.setCardHidden(speciesId, hidden, targetId);
          }}
          onAdd={(speciesName) => {
            session.addSpecies(speciesName, targetId);
          }}
          onClose={() => {
            setShowAddSpecies(false);
          }}
        />
      )}
    </main>
  );
}
