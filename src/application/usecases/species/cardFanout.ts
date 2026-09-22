import type { MemberId } from '@domain/entities/member';
import type { SpeciesId } from '@domain/entities/species';
import type { RoomRepository } from '../../ports/RoomRepository';

/**
 * 어종 카드를 방 전원에게 깐다 (2026-09-23 변경).
 *
 * 전에는 어종을 추가한 사람에게만 카드가 생겼다. 어종 **사전**은 방 단위로
 * 공유됐지만 **카드**는 아니어서, 같은 배에서 같은 우럭을 잡아도 각자 따로
 * 추가해야 했다. 한 명이 추가하면 모두에게 바로 뜨는 쪽이 맞다.
 *
 * 카드를 지운 사람에게도 다시 생긴다 (Plan FR-08의 삭제는 0마리 카드 정리용이지
 * "이 어종 안 볼래"라는 영구 거부가 아니다). 필요하면 숨기기로 덮으면 된다.
 *
 * 서버와 클라이언트가 **같은 함수로 같은 결과**를 내야 한다 (Design §2.0).
 * 그래서 판단 근거를 전부 repo 상태에서만 읽는다 — 시각도 난수도 쓰지 않는다.
 */

/** 어종 하나를 아직 없는 모든 멤버에게. 새로 만든 카드 수를 돌려준다 */
export function giveSpeciesToEveryone(repo: RoomRepository, speciesId: SpeciesId): number {
  const nextSortOrder = sortOrderTable(repo);
  let created = 0;

  for (const member of repo.listMembers()) {
    if (repo.findCard(member.id, speciesId) !== null) continue;

    repo.addCard({
      memberId: member.id,
      speciesId,
      sortOrder: nextSortOrder.get(member.id) ?? 0,
      hidden: false,
    });
    created += 1;
  }

  return created;
}

/**
 * 새 참여자에게 방에 이미 있는 어종 카드를 전부.
 *
 * 이게 없으면 늦게 들어온 사람만 빈 그리드를 보게 된다 — 남들은 카드가 있는데
 * 나만 없는 상태라 "다들 뭘 보고 있는 거지"가 된다.
 */
export function giveAllSpeciesTo(repo: RoomRepository, memberId: MemberId): number {
  let sortOrder = repo.listCards().filter((c) => c.memberId === memberId).length;
  let created = 0;

  for (const species of repo.listSpecies()) {
    if (repo.findCard(memberId, species.id) !== null) continue;

    repo.addCard({ memberId, speciesId: species.id, sortOrder, hidden: false });
    sortOrder += 1;
    created += 1;
  }

  return created;
}

/** 멤버별 "다음 카드가 들어갈 자리" — listCards를 한 번만 훑는다 */
function sortOrderTable(repo: RoomRepository): Map<MemberId, number> {
  const table = new Map<MemberId, number>();
  for (const card of repo.listCards()) {
    table.set(card.memberId, (table.get(card.memberId) ?? 0) + 1);
  }
  return table;
}
