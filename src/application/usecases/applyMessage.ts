import type { MemberId } from '@domain/entities/member';
import type { CatchEvent } from '@domain/entities/catch-event';
import type { Species } from '@domain/entities/species';
import type { Millis } from '@domain/entities/common';
import { DomainError } from '@domain/errors';

import type { UseCaseDeps } from './deps';
import type { WritableClientMessage } from '../dto/ws-messages';

import { RecordCatch } from './catch/RecordCatch';
import { VoidCatch } from './catch/VoidCatch';
import { UndoCatch } from './catch/UndoCatch';
import { RestoreCatch } from './catch/RestoreCatch';
import { AddSpecies } from './species/AddSpecies';
import { HideCard } from './species/HideCard';
import { RemoveCard } from './species/RemoveCard';
import { EndFishing } from './room/EndFishing';
import { ResumeFishing } from './room/ResumeFishing';
import { AddPhonelessMember } from './room/AddPhonelessMember';

export type ApplyResult =
  | { kind: 'catch'; event: CatchEvent; idempotent: boolean; isProxy: boolean }
  | { kind: 'uncatch'; event: CatchEvent; idempotent: boolean; isProxy: boolean }
  | { kind: 'undo'; event: CatchEvent; idempotent: boolean }
  | { kind: 'restore'; event: CatchEvent; idempotent: boolean }
  | { kind: 'addSpecies'; species: Species; targetMemberId: MemberId; idempotent: boolean }
  | { kind: 'hideCard'; targetMemberId: MemberId }
  | { kind: 'removeCard'; targetMemberId: MemberId }
  | { kind: 'end'; endedAt: Millis; idempotent: boolean }
  | { kind: 'resume'; idempotent: boolean }
  | { kind: 'addMember'; memberId: MemberId };

/**
 * 쓰기 메시지 하나를 해당 UseCase로 보낸다 — **분기의 단일 출처**.
 *
 * Design Ref: §2.0 — Option B의 전제는 "같은 코드가 같은 순서로 돈다"인데,
 * 규칙(UseCase)만 공유하고 **어떤 메시지를 어느 UseCase에 보낼지**를 양쪽이 따로
 * 짜면 거기서 갈린다. 그래서 디스패치 자체를 Application에 둔다.
 *
 *  · 서버(room-do): SqliteRoomRepository로 확정 처리 후 ack·브로드캐스트
 *  · 클라이언트(roomStore): ProjectionRoomRepository로 낙관적 예측,
 *    그리고 스냅샷 도착 시 미전송 pending을 같은 함수로 재적용 (§2.2.3)
 */
export function applyMessage(
  deps: UseCaseDeps,
  actorMemberId: MemberId,
  message: WritableClientMessage
): ApplyResult {
  const proxy = (forMemberId: MemberId | undefined) =>
    forMemberId === undefined ? {} : { forMemberId };

  switch (message.t) {
    case 'catch': {
      const r = new RecordCatch(deps).execute({
        id: message.id,
        actorMemberId,
        speciesId: message.speciesId,
        caughtAt: message.at,
        ...proxy(message.forMemberId),
      });
      return { kind: 'catch', event: r.event, idempotent: r.idempotent, isProxy: r.isProxy };
    }

    case 'uncatch': {
      const r = new VoidCatch(deps).execute({
        actionId: message.actionId,
        actorMemberId,
        speciesId: message.speciesId,
        ...proxy(message.forMemberId),
      });
      return { kind: 'uncatch', event: r.event, idempotent: r.idempotent, isProxy: r.isProxy };
    }

    case 'undo': {
      const r = new UndoCatch(deps).execute({
        actionId: message.actionId,
        targetId: message.targetId,
        actorMemberId,
      });
      return { kind: 'undo', event: r.event, idempotent: r.idempotent };
    }

    case 'restore': {
      const r = new RestoreCatch(deps).execute({
        actionId: message.actionId,
        actorMemberId,
      });
      return { kind: 'restore', event: r.event, idempotent: r.idempotent };
    }

    case 'addSpecies': {
      const r = new AddSpecies(deps).execute({
        id: message.id,
        name: message.name,
        actorMemberId,
        ...proxy(message.forMemberId),
      });
      return {
        kind: 'addSpecies',
        species: r.species,
        targetMemberId: message.forMemberId ?? actorMemberId,
        idempotent: r.idempotent,
      };
    }

    case 'hideCard': {
      new HideCard(deps).execute({
        speciesId: message.speciesId,
        hidden: message.hidden,
        actorMemberId,
        ...proxy(message.forMemberId),
      });
      return { kind: 'hideCard', targetMemberId: message.forMemberId ?? actorMemberId };
    }

    case 'removeCard': {
      new RemoveCard(deps).execute({
        speciesId: message.speciesId,
        actorMemberId,
        ...proxy(message.forMemberId),
      });
      return { kind: 'removeCard', targetMemberId: message.forMemberId ?? actorMemberId };
    }

    case 'end': {
      const r = new EndFishing(deps).execute({ actorMemberId });
      return { kind: 'end', endedAt: r.endedAt, idempotent: r.idempotent };
    }

    case 'resume': {
      const r = new ResumeFishing(deps).execute({ actorMemberId });
      return { kind: 'resume', idempotent: r.idempotent };
    }

    case 'addMember': {
      const r = new AddPhonelessMember(deps).execute({
        id: message.id,
        name: message.name,
        actorMemberId,
      });
      return { kind: 'addMember', memberId: r.memberId };
    }
  }
}

/** 조과의 주인 — 브로드캐스트에서 어느 사람의 카드가 바뀌었는지 알려준다 */
export function affectedMemberOf(result: ApplyResult): MemberId | null {
  switch (result.kind) {
    case 'catch':
    case 'uncatch':
    case 'undo':
    case 'restore':
      return result.event.memberId;
    case 'addSpecies':
    case 'hideCard':
    case 'removeCard':
      return result.targetMemberId;
    case 'addMember':
      return result.memberId;
    case 'end':
    case 'resume':
      return null;
  }
}

/**
 * 클라이언트가 스냅샷 위에 pending을 재적용할 때 쓴다.
 *
 * 재적용 중 실패는 무시한다 — 서버가 먼저 처리해버려 이미 반영됐거나(멱등),
 * 방이 종료돼 더 이상 유효하지 않은 경우다. 여기서 예외를 터뜨리면
 * 화면 전체가 멈춘다.
 */
export function tryApplyMessage(
  deps: UseCaseDeps,
  actorMemberId: MemberId,
  message: WritableClientMessage
): ApplyResult | null {
  try {
    return applyMessage(deps, actorMemberId, message);
  } catch (e) {
    if (e instanceof DomainError) return null;
    throw e;
  }
}
