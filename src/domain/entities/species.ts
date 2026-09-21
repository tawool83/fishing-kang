import type { Millis } from './common';
import type { MemberId } from './member';

export type SpeciesId = string;

export const SPECIES_NAME_MIN = 1;
export const SPECIES_NAME_MAX = 12;

/**
 * 방 단위로 공유되는 어종 사전.
 *
 * Plan FR-07 — 같은 이름이면 같은 어종으로 합친다.
 * "우럭 / 우럭 / 조피볼락" 같은 표기 분열이 생기면 통계가 깨진다.
 */
export interface Species {
  id: SpeciesId;
  /** 원본 표기 */
  name: string;
  /** 중복 판정 키 — 공백 제거 + 소문자 + NFC */
  normalized: string;
  createdBy: MemberId;
  createdAt: Millis;
}

/** 사람마다 자기 카드 목록을 갖는다 (내가 잡는 어종만) */
export interface MemberSpeciesCard {
  memberId: MemberId;
  speciesId: SpeciesId;
  /** 추가 순서. 드래그 정렬은 P2 (Plan §2.2) */
  sortOrder: number;
  /** 기록이 있는 카드는 삭제 대신 숨기기만 가능 (Plan FR-08) */
  hidden: boolean;
}
