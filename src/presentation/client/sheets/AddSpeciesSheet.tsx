import { useState } from 'preact/hooks';
import { SPECIES_NAME_MAX } from '@domain/entities/species';
import { normalizeName } from '@domain/rules/speciesName';
import type { DictionaryEntry, ManageableCard } from '../view-models/roomStore';
import { AppButton } from '../components/AppButton';
import { BottomSheet } from '../components/BottomSheet';
import { FishIcon } from '../components/FishIcon';
import './AddSpeciesSheet.css';

interface Props {
  /** 대리 입력 중이면 대상자 이름 */
  forName?: string;
  dictionary: DictionaryEntry[];
  /** Plan FR-08 — 내 카드(숨김 포함). 삭제·숨기기 대상 */
  myCards: ManageableCard[];
  onAdd: (name: string) => void;
  onRemove: (speciesId: string) => void;
  onToggleHidden: (speciesId: string, hidden: boolean) => void;
  onClose: () => void;
}

/**
 * ⑨ 어종 추가 시트 (Plan FR-07, Design §5.4 ⑨).
 *
 * 자동완성이 이 화면의 존재 이유다. 같은 물고기를 "우럭 / 우 럭 / 조피볼락"으로
 * 제각각 적으면 통계가 깨진다. 방 사전을 먼저 보여주고, 같은 이름이면
 * 서버가 기존 어종에 합친다.
 */
export function AddSpeciesSheet({
  forName,
  dictionary,
  myCards,
  onAdd,
  onRemove,
  onToggleHidden,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');

  const normalized = normalizeName(query);
  const matches =
    normalized === ''
      ? [...dictionary].sort((a, b) => b.roomTotal - a.roomTotal).slice(0, 6)
      : dictionary.filter((d) => normalizeName(d.name).includes(normalized));

  const exact = dictionary.find((d) => normalizeName(d.name) === normalized);
  const canCreate = normalized !== '' && exact === undefined;

  const submit = (name: string) => {
    onAdd(name);
    onClose();
  };

  return (
    <BottomSheet
      title={forName === undefined ? '어종 추가' : `${forName}의 어종 추가`}
      onClose={onClose}
    >
      <div class="field">
        <label class="field__label" for="species-name">
          어종 이름
        </label>
        <input
          id="species-name"
          class="field__input"
          value={query}
          maxLength={SPECIES_NAME_MAX}
          placeholder="우럭"
          autofocus
          onInput={(e) => {
            setQuery((e.target as HTMLInputElement).value);
          }}
        />
      </div>

      {matches.length > 0 && (
        <section class="addsp__section">
          <h3 class="addsp__label">
            {normalized === '' ? '이 방에서 많이 잡힌 어종' : '방 사전'}
          </h3>
          <ul class="addsp__list">
            {matches.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  class="addsp__item"
                  disabled={d.alreadyMine}
                  onClick={() => {
                    submit(d.name);
                  }}
                >
                  <FishIcon name={d.name} size={22} />
                  <span class="addsp__item-name">{d.name}</span>
                  {d.alreadyMine ? (
                    <span class="addsp__hint">이미 내 카드에 있어요</span>
                  ) : (
                    <span class="addsp__count">{d.roomTotal}마리</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canCreate && (
        <button
          type="button"
          class="addsp__create"
          onClick={() => {
            submit(query);
          }}
        >
          새 어종으로 추가: <strong>{query.trim()}</strong>
        </button>
      )}

      <p class="muted">같은 이름이면 같은 어종으로 합쳐져요.</p>

      {myCards.length > 0 && (
        <section class="addsp__section">
          <h3 class="addsp__label">내 카드 관리</h3>
          <p class="muted addsp__note">
            잡은 기록이 있는 카드는 지울 수 없고 숨기기만 돼요.
          </p>
          <ul class="addsp__list">
            {myCards.map((card) => (
              <li class="addsp__manage" key={card.speciesId}>
                <FishIcon name={card.name} size={22} />
                <span class="addsp__item-name">
                  {card.name}
                  {card.hidden && <span class="addsp__hidden-tag">숨김</span>}
                </span>
                <span class="addsp__count">{card.count}마리</span>

                {card.count === 0 ? (
                  <button
                    type="button"
                    class="addsp__action"
                    onClick={() => {
                      onRemove(card.speciesId);
                    }}
                    aria-label={`${card.name} 카드 삭제`}
                  >
                    삭제
                  </button>
                ) : (
                  <button
                    type="button"
                    class="addsp__action"
                    onClick={() => {
                      onToggleHidden(card.speciesId, !card.hidden);
                    }}
                    aria-label={`${card.name} 카드 ${card.hidden ? '다시 보이기' : '숨기기'}`}
                  >
                    {card.hidden ? '보이기' : '숨기기'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <AppButton
        disabled={normalized === '' || exact?.alreadyMine === true}
        onClick={() => {
          submit(query);
        }}
      >
        추가
      </AppButton>
    </BottomSheet>
  );
}
