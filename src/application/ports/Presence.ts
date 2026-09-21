import type { MemberId } from '@domain/entities/member';

/**
 * 지금 접속 중인 멤버가 누구인가.
 *
 * 쓰임새 2가지:
 *  1. 참여자 목록의 초록 점 (Design §5.4 ③⑤)
 *  2. 이름 선택 복구 시 "이 이름은 지금 다른 폰에서 접속 중이에요" 확인창 (Plan FR-04)
 *
 * 2번은 **인증이 아니라 실수 방지**다. 확인만 하면 통과한다 (Design §4.2).
 *
 * Worker는 Hibernation WebSocket 집합에서, 클라이언트는 서버 스냅샷에서 읽는다.
 */
export interface Presence {
  isOnline(memberId: MemberId): boolean;
  onlineMembers(): MemberId[];
}

/** 접속 정보가 없는 환경(테스트·통계 조회)용 */
export class NoPresence implements Presence {
  isOnline(): boolean {
    return false;
  }
  onlineMembers(): MemberId[] {
    return [];
  }
}
