/**
 * Design Ref: §10.4 — Domain·Application은 `crypto`를 직접 부르지 않는다.
 *
 * Worker는 `crypto.randomUUID()` 기반 구현을, 테스트는 결정적 구현을 주입한다.
 */
export interface IdGenerator {
  uuid(): string;
  /** 6자리 초대코드 (0·O·1·I 제외) */
  inviteCode(): string;
}
