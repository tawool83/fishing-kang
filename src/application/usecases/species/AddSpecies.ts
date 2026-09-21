import type { Species, SpeciesId } from '@domain/entities/species';
import { SPECIES_NAME_MAX, SPECIES_NAME_MIN } from '@domain/entities/species';
import { normalizeName, validateName } from '@domain/rules/speciesName';
import type { UseCaseDeps } from '../deps';
import type { AddSpeciesInput } from '../../dto/requests';
import { requireRoom, requireWritable, resolveTarget } from '../guards';

export interface AddSpeciesResult {
  species: Species;
  /** 방 사전에 이미 있던 어종을 재사용했는가 */
  reused: boolean;
  /** 이미 카드가 있어 아무것도 안 했는가 */
  idempotent: boolean;
  isProxy: boolean;
}

/**
 * 어종 카드 추가 (Plan FR-07).
 *
 * 어종 이름은 **방 단위 사전**에 저장된다. 내가 "우럭"을 추가할 때 이미 누가 만든
 * "우럭"이 있으면 그걸 재사용한다. 정규화(공백 제거·소문자) 기준으로 판정하므로
 * "우 럭"도 같은 어종이 된다.
 *
 * 이게 없으면 "우럭 / 우럭 / 조피볼락"처럼 표기가 갈려 통계가 깨진다.
 *
 * 카드는 항상 **내 목록 끝에** 0마리로 생긴다 (추가 순서 정렬).
 */
export class AddSpecies {
  constructor(private readonly deps: UseCaseDeps) {}

  execute(input: AddSpeciesInput): AddSpeciesResult {
    const { repo, clock } = this.deps;

    const room = requireRoom(repo);
    requireWritable(room);
    const { target, isProxy } = resolveTarget(room, repo, input);

    const name = validateName(input.name, SPECIES_NAME_MIN, SPECIES_NAME_MAX, 'name');
    const normalized = normalizeName(name);

    const now = clock.now();
    const existing = repo.findSpeciesByNormalized(normalized);

    let species: Species;
    let reused: boolean;

    if (existing !== null) {
      species = existing;
      reused = true;
    } else {
      species = {
        id: input.id,
        name,
        normalized,
        createdBy: target.id,
        createdAt: now,
      };
      repo.addSpecies(species);
      reused = false;
    }

    if (repo.findCard(target.id, species.id) !== null) {
      return { species, reused, idempotent: true, isProxy };
    }

    const own = repo.listCards().filter((c) => c.memberId === target.id);
    repo.addCard({
      memberId: target.id,
      speciesId: species.id,
      sortOrder: own.length,
      hidden: false,
    });
    repo.touchActivity(now);

    return { species, reused, idempotent: false, isProxy };
  }
}

export type { SpeciesId };
