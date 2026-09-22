import { useEffect, useMemo, useState } from 'preact/hooks';
import type { MemberId } from '@domain/entities/member';

import { AppButton } from '../components/AppButton';
import { ConnectionPill } from '../components/ConnectionPill';
import { Podium } from '../components/Podium';
import { RankList } from '../components/RankList';
import { Snackbar } from '../components/Snackbar';
import { SpeciesCard } from '../components/SpeciesCard';
import type { Tab } from '../components/TabBar';
import { TabBar } from '../components/TabBar';
import { AddSpeciesSheet } from '../sheets/AddSpeciesSheet';
import { RoomInfoSheet } from '../sheets/RoomInfoSheet';
import { RoomSession } from '../view-models/roomSession';
import { ProxyBoard } from './ProxyBoard';
import { StatsBoard } from './StatsBoard';
import { useNow } from '../hooks/useNow';
import './CatchBoard.css';

/**
 * ④ 조과 화면 — 서비스의 메인 (Design §5.4 ④).
 *
 * 화면 구성:
 *  · 상단 고정: 방 이름 · 연결 상태 · 방 정보 버튼 · 포디움 · 내 순위
 *  · 중앙: 어종 카드 2열 그리드
 *  · 하단: 탭바 (조과 / 순위 / 통계)
 *  · 스낵바: 되돌리기 5초
 */
export function CatchBoard({ code }: { code: string }) {
  const session = useMemo(() => new RoomSession(code), [code]);
  const [tab, setTab] = useState<Tab>('catch');
  const [showInfo, setShowInfo] = useState(false);
  const [showAddSpecies, setShowAddSpecies] = useState(false);
  const [expandRanks, setExpandRanks] = useState(false);
  const [proxyTarget, setProxyTarget] = useState<MemberId | null>(null);

  useEffect(() => {
    session.start();
    return () => {
      session.stop();
    };
  }, [session]);

  // 쿨다운 게이지를 위해 200ms마다 다시 그린다
  const now = useNow(200);

  // Plan FR-17 — 종료되면 모든 참여자 화면이 통계로 전환된다
  const ended = session.store.isEnded.value;
  useEffect(() => {
    if (ended) setTab('stats');
  }, [ended]);

  const { store } = session;
  const room = store.room.value;
  const me = store.myMemberId.value;
  const ranking = store.ranking.value;
  const isEnded = store.isEnded.value;

  const myRank = ranking.find((r) => r.memberId === me);
  const cards = store.cardsOf(me);
  const cooldownMs = store.cooldownRemaining(now, me ?? undefined);

  if (proxyTarget !== null && room !== null) {
    return (
      <ProxyBoard
        session={session}
        targetId={proxyTarget}
        onExit={() => {
          setProxyTarget(null);
        }}
      />
    );
  }

  return (
    <main class="page board">
      <header class="board__header">
        <div class="board__topbar">
          <h1 class="board__room">{room?.name ?? '연결 중…'}</h1>
          <div class="board__topbar-right">
            <ConnectionPill
              onRetry={() => {
                session.retry();
              }}
            />
            <button
              type="button"
              class="board__info"
              onClick={() => {
                setShowInfo(true);
              }}
              aria-label="방 정보"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <rect
                  x="3"
                  y="3"
                  width="18"
                  height="18"
                  rx="3"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                />
                <path d="M7 7h4v4H7zM13 7h4v4h-4zM7 13h4v4H7zM13 13h2v2h-2z" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>

        {/* 통계 탭은 자체 하늘 헤더 + 최종 포디움을 갖는다 (Design §5.4 ⑥).
            여기서 또 그리면 포디움이 두 번 나온다. */}
        {tab !== 'stats' && (
          <>
            <Podium podium={store.podium.value} />

            <button
              type="button"
              class="board__mysummary"
              onClick={() => {
                setExpandRanks(!expandRanks);
              }}
              aria-expanded={expandRanks}
            >
              <span>
                내 조과 <strong>{myRank?.total ?? 0}마리</strong>
                {myRank !== undefined && (
                  <>
                    {' · '}
                    {myRank.tied && '공동 '}
                    {myRank.rank}위
                  </>
                )}
              </span>
              <span
                class={`board__chevron ${expandRanks ? 'board__chevron--up' : ''}`}
                aria-hidden="true"
              >
                ▾
              </span>
            </button>

            {(expandRanks || tab === 'rank') && room !== null && (
              <div class="board__ranks">
                <RankList
                  ranking={ranking}
                  myMemberId={me}
                  hostMemberId={room.hostMemberId}
                  {...(store.isHost.value && !isEnded
                    ? {
                        onProxy: (memberId: MemberId) => {
                          setProxyTarget(memberId);
                        },
                      }
                    : {})}
                />
              </div>
            )}
          </>
        )}
      </header>

      <div class="board__body">
        {tab === 'stats' && room !== null && (
          <StatsBoard
            code={code}
            isEnded={isEnded}
            isHost={store.isHost.value}
            canResume={store.canResume(now)}
            // 종료/재개될 때마다 다시 불러온다
            refreshKey={isEnded ? 1 : 0}
            onResume={() => {
              session.resumeFishing();
              setTab('catch');
            }}
          />
        )}

        {tab !== 'stats' && (
          <>
            {isEnded && (
              <p class="board__locked" role="status">
                낚시가 종료됐어요. 방장이 재개하면 다시 기록할 수 있어요.
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
                    session.tapPlus(card.speciesId);
                  }}
                  onMinus={() => {
                    session.tapMinus(card.speciesId);
                  }}
                />
              ))}
            </div>

            {cards.length === 0 && (
              <p class="muted board__placeholder">
                아직 카드가 없어요. 잡을 어종을 추가해보세요.
              </p>
            )}

            <AppButton
              variant="outline"
              disabled={isEnded}
              onClick={() => {
                setShowAddSpecies(true);
              }}
            >
              + 어종 추가
            </AppButton>
          </>
        )}
      </div>

      <TabBar active={tab} onChange={setTab} />
      <Snackbar />

      {showInfo && (
        <RoomInfoSheet
          session={session}
          onClose={() => {
            setShowInfo(false);
          }}
        />
      )}

      {showAddSpecies && (
        <AddSpeciesSheet
          dictionary={store.speciesDictionary(me)}
          myCards={store.manageableCards(me)}
          onRemove={(speciesId) => {
            session.removeCard(speciesId);
          }}
          onToggleHidden={(speciesId, hidden) => {
            session.setCardHidden(speciesId, hidden);
          }}
          onAdd={(name) => {
            session.addSpecies(name);
          }}
          onClose={() => {
            setShowAddSpecies(false);
          }}
        />
      )}
    </main>
  );
}
