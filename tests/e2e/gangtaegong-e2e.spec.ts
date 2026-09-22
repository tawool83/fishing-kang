import { expect, test } from '@playwright/test';
import { addSpecies, createRoomViaUi, joinRoomViaUi, newDevice } from './helpers';

/**
 * Design §8.5 L3 — 사용자 여정 시나리오.
 *
 * L2가 "화면이 규칙대로 보이는가"였다면, L3는 **여러 기기가 얽힌 실제 흐름**을 본다.
 * 특히 #3 오프라인 대기열은 Plan의 최우선 리스크
 * ("탭이 증발하면 서비스 신뢰가 바로 무너진다")의 자동 회귀 테스트다.
 */

test('#1 기본 여정 — 방 생성 → 2인 입장 → 교대 기록 → 종료 → 양쪽 통계', async ({
  page,
  browser,
}) => {
  const code = await createRoomViaUi(page);
  await addSpecies(page, '우럭');

  const guest = await joinRoomViaUi(browser, code, '철수');
  await addSpecies(guest, '광어');

  await page.getByLabel('우럭 한 마리 추가').click();
  await guest.getByLabel('광어 한 마리 추가').click();
  await guest.getByLabel('광어 한 마리 추가').waitFor();

  // 방장이 종료 → 양쪽 모두 통계로 전환된다 (Plan FR-17)
  await page.getByLabel('방 정보').click();
  await page.getByRole('button', { name: '낚시 종료' }).click();
  await page.getByRole('button', { name: '종료하기' }).click();

  for (const p of [page, guest]) {
    await expect(p.getByText('오늘의 강태공')).toBeVisible();
    // 총 조과 2마리가 양쪽에 같게 보인다
    await expect(p.getByText('2마리').first()).toBeVisible();
  }
});

test('#2 실시간 반영 — A가 탭하면 B의 포디움이 갱신된다 (FR-16)', async ({ page, browser }) => {
  const code = await createRoomViaUi(page);
  await addSpecies(page, '우럭');
  const guest = await joinRoomViaUi(browser, code, '철수');

  const started = Date.now();
  await page.getByLabel('우럭 한 마리 추가').click();

  await expect(
    guest.getByRole('listitem').filter({ hasText: '홍길동' }).first()
  ).toContainText('1', { timeout: 3000 });

  // Plan NFR — 온라인 상태에서 1초 이내가 목표. 여유를 두되 상한은 건다
  expect(Date.now() - started).toBeLessThan(3000);
});

test('#3 오프라인 대기열 — 끊긴 사이 누른 탭이 유실도 중복도 없이 전송된다 ⭐', async ({
  page,
  context,
}) => {
  await createRoomViaUi(page);
  await addSpecies(page, '우럭');

  // 온라인에서 1건
  await page.getByLabel('우럭 한 마리 추가').click();
  await expect(page.getByLabel('우럭 1마리')).toBeVisible();

  // 네트워크 차단 — 낚시터에서 소켓이 끊긴 상황
  await context.setOffline(true);
  await expect(page.getByRole('button', { name: /오프라인/ })).toBeVisible({ timeout: 20_000 });

  // 끊긴 상태에서 3건 더 (쿨다운 10초를 넘겨가며)
  for (let i = 0; i < 3; i += 1) {
    await page.getByLabel('우럭 한 마리 추가').click({ timeout: 20_000 });
    await expect(page.getByLabel(`우럭 ${String(i + 2)}마리`)).toBeVisible();
    if (i < 2) await page.waitForTimeout(10_200); // 쿨다운 해제 대기
  }

  // 대기 건수가 화면에 드러난다 — "내가 누른 게 남아 있다"는 신호
  await expect(page.getByRole('button', { name: /대기 3건/ })).toBeVisible();

  // 신호 복구
  await context.setOffline(false);
  await expect(page.getByRole('button', { name: /연결됨/ })).toBeVisible({ timeout: 40_000 });

  // 재전송 안내 + 최종 4마리 (유실 0 / 중복 0)
  await expect(page.getByText(/대기 중이던 3건을 전송했어요/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByLabel('우럭 4마리')).toBeVisible();

  // 서버가 실제로 4건만 갖고 있는지 통계로 교차 확인.
  // 요약 '총 조과' 칸을 콕 집어 본다 — 통계 화면엔 '…마리'가 여러 군데 나오고,
  // 막연한 getByText('4마리')는 먼저 그려진 아무 요소나 잡아 검증이 헐거워진다.
  await page.getByRole('button', { name: '통계' }).click();
  await expect(page.locator('.summary__cell', { hasText: '총 조과' })).toContainText('4마리');
});

test('#4 오프라인 중 남이 잡아도 내 pending이 사라지지 않는다 (스냅샷 병합)', async ({
  page,
  context,
  browser,
}) => {
  const code = await createRoomViaUi(page);
  await addSpecies(page, '우럭');
  const guest = await joinRoomViaUi(browser, code, '철수');
  await addSpecies(guest, '광어');

  await context.setOffline(true);
  await expect(page.getByRole('button', { name: /오프라인/ })).toBeVisible({ timeout: 20_000 });

  await page.getByLabel('우럭 한 마리 추가').click({ timeout: 20_000 });
  await expect(page.getByLabel('우럭 1마리')).toBeVisible();

  // 그사이 철수가 2마리 잡는다
  await guest.getByLabel('광어 한 마리 추가').click();
  await guest.waitForTimeout(10_200);
  await guest.getByLabel('광어 한 마리 추가').click();

  await context.setOffline(false);
  await expect(page.getByRole('button', { name: /연결됨/ })).toBeVisible({ timeout: 40_000 });

  // 내 1건이 스냅샷에 덮여 사라지지 않았고, 철수 2건도 합쳐졌다
  await expect(page.getByLabel('우럭 1마리')).toBeVisible();
  await page.getByRole('button', { name: '통계' }).click();
  await expect(page.getByText('3마리').first()).toBeVisible();
});

test('#5 기기 ID 복구 — localStorage가 날아가도 쿠키로 바로 재입장한다 (FR-03·29)', async ({
  page,
}) => {
  const code = await createRoomViaUi(page);
  await addSpecies(page, '우럭');
  await page.getByLabel('우럭 한 마리 추가').click();
  await expect(page.getByLabel('우럭 1마리')).toBeVisible();

  // 스크립트 저장소만 날린다 (쿠키는 남는다 — iOS ITP에서 흔한 상황)
  await page.evaluate(() => {
    localStorage.clear();
    indexedDB.deleteDatabase('gangtaegong');
  });

  await page.goto(`/r/${code}`);

  // 이름 입력 없이 바로 조과 화면 — 기록도 그대로다
  await expect(page.getByText('연결됨')).toBeVisible();
  await expect(page.getByLabel('우럭 1마리')).toBeVisible();
  await expect(page.getByLabel('내 이름')).toHaveCount(0);
});

test('#6 이름 선택 복구 — 저장소가 전부 날아가도 이어서 할 수 있다 (FR-04)', async ({
  page,
  browser,
}) => {
  const code = await createRoomViaUi(page);
  await addSpecies(page, '우럭');
  await page.getByLabel('우럭 한 마리 추가').click();
  await expect(page.getByLabel('우럭 1마리')).toBeVisible();

  // 기존 기기는 닫는다 — 폰을 잃어버렸거나 저장소가 날아간 상황
  await page.close();

  // 완전히 새 기기 (쿠키까지 없음) = 시크릿 모드나 기기 변경
  const fresh = await newDevice(browser);
  await fresh.goto(`/r/${code}`);

  // 내 이름을 고르면 PIN 없이 이어진다 (확정: PIN 없음)
  await fresh.getByRole('button', { name: /홍길동/ }).click();

  await expect(fresh.getByText('연결됨')).toBeVisible();
  await expect(fresh.getByLabel('우럭 1마리')).toBeVisible(); // 기록 유지
});

test('#7 접속 중인 이름을 고르면 확인창이 뜬다 (FR-04 — 실수 방지)', async ({
  page,
  browser,
}) => {
  const code = await createRoomViaUi(page);
  const other = await newDevice(browser);
  await other.goto(`/r/${code}`);

  await other.getByRole('button', { name: /홍길동/ }).click();

  await expect(other.getByText(/지금 다른 폰에서 접속 중이에요/)).toBeVisible();
  await other.getByRole('button', { name: '네, 본인이에요' }).click();

  await expect(other.getByText('연결됨')).toBeVisible();
});

test('#8 대리 입력 전체 흐름 — 방장이 대신 기록하고 대상자가 되돌린다 (FR-21~23)', async ({
  page,
  browser,
}) => {
  const code = await createRoomViaUi(page);
  const guest = await joinRoomViaUi(browser, code, '철수');
  await addSpecies(guest, '우럭');

  await page.getByRole('button', { name: /내 조과/ }).click();
  await page.getByLabel('철수 대신 입력하기').click();
  await page.getByLabel('우럭 한 마리 추가').click();

  // 대상자가 알림을 받고 스낵바에서 바로 되돌린다
  await expect(guest.getByText(/홍길동님이 우럭 \+1 했어요/)).toBeVisible();
  await expect(guest.getByLabel('우럭 1마리')).toBeVisible();

  await guest.getByRole('button', { name: '되돌리기' }).click();
  await expect(guest.getByLabel('우럭 0마리')).toBeVisible();
});

test('#9 종료 → 재개 → 정정 → 재종료 (FR-17)', async ({ page }) => {
  await createRoomViaUi(page);
  await addSpecies(page, '우럭');

  await page.getByLabel('방 정보').click();
  await page.getByRole('button', { name: '낚시 종료' }).click();
  await page.getByRole('button', { name: '종료하기' }).click();
  await expect(page.getByText('오늘의 강태공')).toBeVisible();

  // 통계 화면에서 바로 재개
  await page.getByRole('button', { name: '낚시 재개' }).click();

  // 다시 기록할 수 있다
  await page.getByLabel('우럭 한 마리 추가').click();
  await expect(page.getByLabel('우럭 1마리')).toBeVisible();

  await page.getByLabel('방 정보').click();
  await page.getByRole('button', { name: '낚시 종료' }).click();
  await page.getByRole('button', { name: '종료하기' }).click();
  await expect(page.getByText('오늘의 강태공')).toBeVisible();
});

test('#10 폰 없는 참여자가 통계에 그대로 집계된다 (FR-24·25)', async ({ page }) => {
  await createRoomViaUi(page);
  await addSpecies(page, '우럭');

  await page.getByLabel('방 정보').click();
  await page.getByLabel('폰 없는 참여자 이름').fill('철수아들');
  await page.getByRole('button', { name: '참여자 추가' }).click();
  await page.getByLabel('닫기').click();

  // 방장이 대신 2마리 기록
  await page.getByRole('button', { name: /내 조과/ }).click();
  await page.getByLabel('철수아들 대신 입력하기').click();
  // 2026-09-23 — 어종은 방 전원에게 깔리므로 철수아들 카드도 이미 있다.
  // 전에는 여기서 대상자에게 어종을 먼저 추가해 줘야 했다
  await page.getByLabel('우럭 한 마리 추가').click();
  await expect(page.getByLabel('우럭 1마리')).toBeVisible();
  await page.getByRole('button', { name: '내 화면으로' }).click();

  await page.getByRole('button', { name: '통계' }).click();

  // 순위·통계에 똑같이 나오고, 대리 입력 건수도 표시된다
  await expect(page.getByText('철수아들').first()).toBeVisible();
  await expect(page.getByText(/1건은 방장이 대신 입력했어요/)).toBeVisible();
});

test('#11 통계는 진행 중에도 볼 수 있다 (FR-18)', async ({ page }) => {
  await createRoomViaUi(page);
  await addSpecies(page, '우럭');
  await page.getByLabel('우럭 한 마리 추가').click();

  await page.getByRole('button', { name: '통계' }).click();

  await expect(page.getByText('진행 중')).toBeVisible();
  await expect(page.getByText('하이라이트')).toBeVisible();
  await expect(page.getByText('첫 수')).toBeVisible();
  await expect(page.getByText('시간대별 조과')).toBeVisible();
});
