import type { Millis } from './common';

export type MemberId = string;

export const DISPLAY_NAME_MIN = 1;
export const DISPLAY_NAME_MAX = 12;

export interface Member {
  id: MemberId;
  /** 원본 표기 (예: "김 철수") */
  displayName: string;
  /**
   * 중복 판정 키 — 공백 제거 + 소문자 + NFC.
   *
   * Design Ref: §3.3 — SQLite `COLLATE NOCASE`는 ASCII만 처리해서
   * "김 철수" vs "김철수"를 같은 이름으로 못 잡는다. 정규화 컬럼을 따로 둔다.
   */
  normalized: string;
  joinedAt: Millis;
  /** false = 방장이 이름만으로 등록한 "폰 없는 참여자" (Plan FR-24) */
  hasDevice: boolean;
}
