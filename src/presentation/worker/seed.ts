import type { Millis } from '@domain/entities/common';
import type { UseCaseDeps } from '@application/usecases/deps';
import { CreateRoom } from '@application/usecases/room/CreateRoom';
import { JoinRoom } from '@application/usecases/room/JoinRoom';
import { AddPhonelessMember } from '@application/usecases/room/AddPhonelessMember';
import { AddSpecies } from '@application/usecases/species/AddSpecies';
import { RecordCatch } from '@application/usecases/catch/RecordCatch';
import { VoidCatch } from '@application/usecases/catch/VoidCatch';
import { EndFishing } from '@application/usecases/room/EndFishing';
import { FixedClock } from '@application/ports/Clock';

/**
 * Design Ref: §8.6 — 개발·테스트용 시드.
 *
 * NOTE: 설계 문서 §11.1은 이 파일을 `infrastructure/worker/`에 뒀지만,
 * 여기서 하는 일은 UseCase를 순서대로 조립하는 것이라 Infrastructure가 아니라
 * **조립 지점(Presentation)**의 책임이다. ESLint 레이어 규칙이 이 위반을 잡아내서
 * 실제로 옮겼다 (Design §9.3).
 *
 * 방 하나 = DO 하나라서 여기서는 **한 방**을 채운다.
 * "진행 중 방 1개 + 종료된 방 1개"가 필요하면 서로 다른 초대코드로 두 번 부른다.
 *
 * 조과를 2시간에 걸쳐 흩뿌리는 게 핵심이다 — 시간대별·피크·역전 통계가
 * 의미를 가지려면 시각이 분산돼 있어야 한다.
 */
export interface SeedOptions {
  code: string;
  roomName?: string;
  /** 첫 조과 시각. 여기서부터 2시간에 걸쳐 분산된다 */
  startAt: Millis;
  /** true면 마지막에 종료 처리 */
  ended?: boolean;
}

const MIN = 60_000;

export function seedRoom(deps: UseCaseDeps, options: SeedOptions): void {
  const { code, roomName = '9월 27일 태안 선상', startAt, ended = false } = options;
  const clock = new FixedClock(startAt);
  const seeded: UseCaseDeps = { ...deps, clock };

  const host = new CreateRoom(seeded).execute({
    code,
    roomName,
    displayName: '홍길동',
    deviceId: 'seed-dev-host',
    uaLabel: 'iPhone · Safari',
  });
  const chulsoo = new JoinRoom(seeded).execute({
    displayName: '철수',
    deviceId: 'seed-dev-chulsoo',
    uaLabel: 'Android · Chrome',
  });
  const younghee = new JoinRoom(seeded).execute({
    displayName: '영희',
    deviceId: 'seed-dev-younghee',
    uaLabel: 'iPhone · 카카오톡',
  });
  const kid = new AddPhonelessMember(seeded).execute({
    id: 'seed-m-kid',
    name: '철수아들',
    actorMemberId: host.memberId,
  });

  const species = ['우럭', '광어', '노래미', '쥐치'].map((name, i) =>
    new AddSpecies(seeded).execute({
      id: `seed-sp-${String(i)}`,
      name,
      actorMemberId: host.memberId,
    })
  );

  const members = [host.memberId, chulsoo.memberId, younghee.memberId, kid.memberId];

  // 2시간에 걸쳐 45건. 중간 30분 구간에 몰아서 "피크 타임"을 만든다.
  let n = 0;
  const push = (memberId: string, speciesIndex: number, offsetMs: Millis): void => {
    const sp = species[speciesIndex % species.length];
    if (sp === undefined) return;
    n += 1;
    clock.set(startAt + offsetMs + 200);
    new RecordCatch(seeded).execute({
      id: `seed-e-${String(n).padStart(3, '0')}`,
      // 폰 없는 참여자는 방장이 대신 입력한다
      actorMemberId: memberId === kid.memberId ? host.memberId : memberId,
      ...(memberId === kid.memberId ? { forMemberId: memberId } : {}),
      speciesId: sp.species.id,
      caughtAt: startAt + offsetMs,
    });
  };

  for (let i = 0; i < 12; i += 1) {
    push(members[i % 4] ?? host.memberId, i, i * 4 * MIN);
  }
  // 피크 구간 — 60~90분 사이에 집중
  for (let i = 0; i < 20; i += 1) {
    push(members[i % 3] ?? host.memberId, i, 62 * MIN + i * 80_000);
  }
  for (let i = 0; i < 13; i += 1) {
    push(members[(i + 2) % 4] ?? host.memberId, i + 1, 95 * MIN + i * 90_000);
  }

  // 취소 기록도 남겨둔다 — 통계가 voided를 제대로 걸러내는지 눈으로 확인하려면 필요하다
  clock.set(startAt + 118 * MIN);
  new VoidCatch(seeded).execute({
    actionId: 'seed-act-1',
    actorMemberId: chulsoo.memberId,
    speciesId: species[0]?.species.id ?? '',
  });

  if (ended) {
    clock.set(startAt + 120 * MIN);
    new EndFishing(seeded).execute({ actorMemberId: host.memberId });
  }
}
