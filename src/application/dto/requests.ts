import type { Millis } from '@domain/entities/common';
import type { MemberId } from '@domain/entities/member';
import type { SpeciesId } from '@domain/entities/species';

export interface CreateRoomInput {
  /** 라우터가 생성해 넘긴다 — DO 이름 충돌 재시도가 라우터 쪽에 있기 때문 */
  code: string;
  roomName: string;
  displayName: string;
  deviceId: string;
  uaLabel: string | null;
}

export interface JoinRoomInput {
  displayName: string;
  deviceId: string;
  uaLabel: string | null;
}

export interface ClaimMemberInput {
  memberId: MemberId;
  deviceId: string;
  uaLabel: string | null;
  /** Plan FR-04 — 접속 중인 이름을 골랐을 때 확인창을 통과했는가 */
  confirmedOnlineConflict: boolean;
}

export interface AddPhonelessMemberInput {
  id: MemberId;
  name: string;
  actorMemberId: MemberId;
}

export interface SetRoomStatusInput {
  actorMemberId: MemberId;
}

/** 대리 입력이 가능한 동작의 공통 입력 */
export interface ActorInput {
  actorMemberId: MemberId;
  /** 지정하면 대리 입력. 방장만 허용 (Plan FR-26) */
  forMemberId?: MemberId;
}

export interface RecordCatchInput extends ActorInput {
  /** 클라이언트 생성 UUID = 멱등키 */
  id: string;
  speciesId: SpeciesId;
  caughtAt: Millis;
}

export interface VoidCatchInput extends ActorInput {
  actionId: string;
  speciesId: SpeciesId;
}

export interface UndoCatchInput extends ActorInput {
  actionId: string;
  targetId: string;
}

export interface RestoreCatchInput extends ActorInput {
  actionId: string;
}

export interface AddSpeciesInput extends ActorInput {
  id: SpeciesId;
  name: string;
}

export interface SetCardHiddenInput extends ActorInput {
  speciesId: SpeciesId;
  hidden: boolean;
}

export interface RemoveCardInput extends ActorInput {
  speciesId: SpeciesId;
}
