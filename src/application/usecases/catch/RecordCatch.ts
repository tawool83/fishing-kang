import type { CatchEvent } from '@domain/entities/catch-event';
import { DomainError } from '@domain/errors';
import type { UseCaseDeps } from '../deps';
import type { RecordCatchInput } from '../../dto/requests';
import { requireRoom, requireWritable, resolveTarget } from '../guards';

export interface RecordCatchResult {
  event: CatchEvent;
  /** 이미 처리된 요청이 재전송된 경우 true — 새로 쌓지 않았다 */
  idempotent: boolean;
  isProxy: boolean;
}

/**
 * +1 기록 (Plan FR-09, FR-19, FR-22, FR-26).
 *
 * Design Ref: §2.0 — 이 UseCase가 클라이언트(ProjectionRoomRepository)와
 * 서버(SqliteRoomRepository) 양쪽에서 그대로 돈다.
 *
 * **쿨다운을 검증하지 않는다** (Design §1.2, §6.1):
 * 서버가 도착 시각으로 검증하면 오프라인 대기열이 한꺼번에 도착할 때
 * 정상 입력이 무더기로 거부된다. 쿨다운은 클라이언트 UI가 버튼을 비활성화하는
 * 방식으로만 강제한다. 조작 방지를 하지 않기로 했으므로 이게 맞는 선택이다.
 */
export class RecordCatch {
  constructor(private readonly deps: UseCaseDeps) {}

  execute(input: RecordCatchInput): RecordCatchResult {
    const { repo, clock } = this.deps;

    const room = requireRoom(repo);
    requireWritable(room);
    const { actor, target, isProxy } = resolveTarget(room, repo, input);

    // 멱등 — 같은 id가 이미 있으면 그대로 돌려준다 (Plan FR-19)
    const existing = repo.findEvent(input.id);
    if (existing !== null) {
      return { event: existing, idempotent: true, isProxy };
    }

    const species = repo.findSpecies(input.speciesId);
    if (species === null) {
      throw new DomainError('SPECIES_NOT_FOUND', '어종을 찾을 수 없어요.');
    }

    // 카드가 없으면 만들어 준다.
    // 오프라인 대기열에서 addSpecies의 ack만 유실된 경우에도 +1이 살아남게 하기 위함.
    this.ensureCard(target.id, input.speciesId);

    const now = clock.now();
    const event: CatchEvent = {
      id: input.id,
      memberId: target.id,
      speciesId: input.speciesId,
      caughtAt: input.caughtAt, // 탭한 시각 그대로 — 서버 수신 시각으로 덮지 않는다
      receivedAt: now,
      voidedAt: null,
      voidActionId: null,
      enteredBy: actor.id, // Plan FR-25 — 실제 입력자 기록
      voidedBy: null,
    };

    repo.appendCatch(event);
    repo.touchActivity(now);

    return { event, idempotent: false, isProxy };
  }

  private ensureCard(memberId: string, speciesId: string): void {
    const { repo } = this.deps;
    if (repo.findCard(memberId, speciesId) !== null) return;

    const own = repo.listCards().filter((c) => c.memberId === memberId);
    repo.addCard({ memberId, speciesId, sortOrder: own.length, hidden: false });
  }
}
