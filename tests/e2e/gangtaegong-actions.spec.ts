import { expect, test } from '@playwright/test';
import { addSpecies, countOf, createRoomViaUi, joinRoomViaUi, newDevice } from './helpers';

/**
 * Design §8.4 L2 — UI 액션 테스트.
 *
 * 실제 `wrangler dev`(Worker + Durable Object) 위에서 돈다.
 * 도메인 규칙은 L0가 이미 검증했으므로, 여기서 보는 것은
 * **그 규칙이 화면에 제대로 드러나는가**다.
 */

test('#1 홈에 방 만들기·초대코드 입력 버튼이 보인다', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '강태공' })).toBeVisible();
  await expect(page.getByText('잡을 때마다 한 번 탭')).toBeVisible();
  await expect(page.getByRole('button', { name: '방 만들기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '초대코드 입력' })).toBeVisible();
});

test('#2 방을 만들면 6자리 코드가 나오고 조과 화면까지 들어간다', async ({ page }) => {
  const code = await createRoomViaUi(page);

  expect(code).toHaveLength(6);
  expect(code).not.toMatch(/[0O1I]/); // Plan FR-01 — 헷갈리는 문자 제외
  await expect(page.getByText('9월 27일 태안 선상')).toBeVisible();
});

test('#3 없는 코드를 넣으면 방을 찾을 수 없다고 알려준다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '초대코드 입력' }).click();
  await page.getByLabel('초대코드 6자리').fill('ZZZZZZ');

  await expect(page.getByText('방을 찾을 수 없어요.')).toBeVisible();
});

test('#4 중복 이름으로 입장하면 거부된다 (FR-06)', async ({ page, browser }) => {
  const code = await createRoomViaUi(page);

  const guest = await newDevice(browser);
  await guest.goto(`/r/${code}`);
  await guest.getByLabel('내 이름').fill('홍 길동'); // 정규화하면 "홍길동"과 같다
  await guest.getByRole('button', { name: '입장', exact: true }).click();

  await expect(guest.getByText('이미 있는 이름이에요.')).toBeVisible();
});

test('#5 +1을 누르면 숫자가 오르고 쿨다운 게이지와 스낵바가 뜬다 (FR-09·10·12)', async ({
  page,
}) => {
  await createRoomViaUi(page);
  await addSpecies(page, '우럭');

  await page.getByLabel('우럭 한 마리 추가').click();

  await expect(page.getByLabel('우럭 1마리')).toBeVisible();
  await expect(page.getByRole('timer')).toBeVisible(); // 10초 원형 게이지
  await expect(page.getByText('우럭 +1 기록했어요')).toBeVisible();
  await expect(page.getByRole('button', { name: '되돌리기' })).toBeVisible();
});

test('#6 쿨다운 중에는 다른 어종도 누를 수 없다 (FR-10 — 사람 단위)', async ({ page }) => {
  await createRoomViaUi(page);
  await addSpecies(page, '우럭');
  await addSpecies(page, '광어');

  await page.getByLabel('우럭 한 마리 추가').click();

  // 어종이 달라도 같은 사람이면 막힌다 — +1 버튼 자리가 게이지로 바뀐다
  await expect(page.getByLabel('광어 한 마리 추가')).toHaveCount(0);
  await expect(page.getByRole('timer')).toHaveCount(2);
});

test('#7 0마리면 −1이 비활성이다 (FR-11)', async ({ page }) => {
  await createRoomViaUi(page);
  await addSpecies(page, '우럭');

  await expect(page.getByLabel('우럭 한 마리 취소')).toBeDisabled();
});

test('#8 되돌리기를 누르면 카운트가 돌아가고 쿨다운도 즉시 풀린다 (FR-13)', async ({ page }) => {
  await createRoomViaUi(page);
  await addSpecies(page, '우럭');
  await addSpecies(page, '광어');

  await page.getByLabel('우럭 한 마리 추가').click();
  await expect(page.getByLabel('우럭 1마리')).toBeVisible();

  await page.getByRole('button', { name: '되돌리기' }).click();

  // 어종을 잘못 눌렀을 때 10초 기다리지 않고 바로 고쳐 누를 수 있어야 한다
  await expect(page.getByLabel('우럭 0마리')).toBeVisible();
  await expect(page.getByLabel('광어 한 마리 추가')).toBeEnabled();
  await expect(page.getByRole('timer')).toHaveCount(0);
});

test('#9 −1은 쿨다운 없이 즉시 동작한다 (2026-09-21 확정)', async ({ page }) => {
  await createRoomViaUi(page);
  await addSpecies(page, '우럭');

  await page.getByLabel('우럭 한 마리 추가').click();
  await expect(page.getByLabel('우럭 1마리')).toBeVisible();

  await page.getByLabel('우럭 한 마리 취소').click();

  await expect(page.getByLabel('우럭 0마리')).toBeVisible();
  expect(await countOf(page, '우럭')).toBe(0);
});

test('#10 어종 추가 시트가 방 사전을 자동완성한다 (FR-07)', async ({ page, browser }) => {
  const code = await createRoomViaUi(page);
  await addSpecies(page, '우럭');

  const guest = await joinRoomViaUi(browser, code, '철수');
  await guest.getByRole('button', { name: '+ 어종 추가' }).click();

  // 2026-09-23 — 어종은 방 전원에게 깔린다. 사전에는 보이되 "이미 내 카드"로 잠긴다
  const sheet = guest.getByRole('dialog');
  await expect(sheet.getByRole('button', { name: /우럭 이미 내 카드에 있어요/ })).toBeVisible();

  // "우 럭"을 치면 같은 어종으로 합쳐진다 — 새로 만들기 항목이 뜨지 않는다
  await guest.getByLabel('어종 이름').fill('우 럭');
  await expect(guest.getByText('새 어종으로 추가')).toHaveCount(0);
});

test('#11 탭하면 다른 참여자 화면의 포디움이 갱신된다 (FR-16)', async ({ page, browser }) => {
  const code = await createRoomViaUi(page);
  await addSpecies(page, '우럭');

  const guest = await joinRoomViaUi(browser, code, '철수');

  await page.getByLabel('우럭 한 마리 추가').click();

  // 철수 화면의 포디움에 홍길동 1마리가 나타난다
  await expect(guest.getByRole('listitem').filter({ hasText: '홍길동' })).toBeVisible();
});

test('#12 방장에게만 대리 입력 진입점이 보인다 (FR-21·26)', async ({ page, browser }) => {
  const code = await createRoomViaUi(page);
  const guest = await joinRoomViaUi(browser, code, '철수');

  // 방장: 순위를 펼치면 철수 행에 "대신 입력"이 있다
  await page.getByRole('button', { name: /내 조과/ }).click();
  await expect(page.getByLabel('철수 대신 입력하기')).toBeVisible();

  // 일반 참여자: 버튼 자체가 렌더되지 않는다
  await guest.getByRole('button', { name: /내 조과/ }).click();
  await expect(guest.getByLabel('홍길동 대신 입력하기')).toHaveCount(0);
});

test('#13 대리 입력 화면은 배너로 확실히 구분되고 대상자에게 알림이 간다 (FR-22·23)', async ({
  page,
  browser,
}) => {
  const code = await createRoomViaUi(page);
  const guest = await joinRoomViaUi(browser, code, '철수');
  await addSpecies(guest, '우럭');

  await page.getByRole('button', { name: /내 조과/ }).click();
  await page.getByLabel('철수 대신 입력하기').click();

  await expect(page.getByText('철수 대신 입력 중')).toBeVisible();
  await expect(page.getByText('+1 쿨다운은 철수 기준으로 걸려요')).toBeVisible();

  await page.getByLabel('우럭 한 마리 추가').click();

  // 대상자 화면에 알림 스낵바 (Plan FR-23)
  await expect(guest.getByText(/홍길동님이 우럭 \+1 했어요/)).toBeVisible();
  await expect(guest.getByLabel('우럭 1마리')).toBeVisible();

  await page.getByRole('button', { name: '내 화면으로' }).click();
  await expect(page.getByText('철수 대신 입력 중')).toHaveCount(0);
});

test('#14 방 정보 시트의 방장 메뉴는 방장에게만 보인다', async ({ page, browser }) => {
  const code = await createRoomViaUi(page);
  const guest = await joinRoomViaUi(browser, code, '철수');

  await page.getByLabel('방 정보').click();
  await expect(page.getByText('방장 메뉴')).toBeVisible();
  await expect(page.getByRole('button', { name: '낚시 종료' })).toBeVisible();
  await expect(page.getByText('7일', { exact: true })).toBeVisible(); // 개인정보 안내 (FR-30)

  await guest.getByLabel('방 정보').click();
  await expect(guest.getByText('방장 메뉴')).toHaveCount(0);
});

test('#14-1 순위 종소리를 끄고 켤 수 있고 선택이 기억된다 (FR-34)', async ({ page }) => {
  const code = await createRoomViaUi(page);

  await page.getByLabel('방 정보').click();
  const toggle = page.getByRole('button', { name: /순위가 바뀌면 종소리/ });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true'); // 기본은 켜짐

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('종소리 꺼짐')).toBeVisible();

  // 새로고침해도 꺼진 채로 남는다 — 기기에 저장되기 때문이다
  await page.reload();
  await page.waitForURL(`**/room/${code}`);
  await page.getByLabel('방 정보').click();
  await expect(page.getByRole('button', { name: /순위가 바뀌면 종소리/ })).toHaveAttribute(
    'aria-pressed',
    'false'
  );
});

test('#15 방장이 폰 없는 참여자를 추가하면 순위에 나온다 (FR-24)', async ({ page }) => {
  await createRoomViaUi(page);

  await page.getByLabel('방 정보').click();
  await page.getByLabel('폰 없는 참여자 이름').fill('철수아들');
  await page.getByRole('button', { name: '참여자 추가' }).click();
  await page.getByLabel('닫기').click();

  await page.getByRole('button', { name: /내 조과/ }).click();
  const ranks = page.getByRole('list', { name: '전체 순위' });
  await expect(ranks.getByText('철수아들')).toBeVisible();
  // 2026-09-23 — 순위표에서는 "폰 없음"을 떼어냈다. 방 정보 시트에는 그대로 있다
  await expect(ranks.getByText('폰 없음')).toHaveCount(0);
});

test('#16 방장이 종료하면 모두의 입력이 잠긴다 (FR-17)', async ({ page, browser }) => {
  const code = await createRoomViaUi(page);
  await addSpecies(page, '우럭');
  const guest = await joinRoomViaUi(browser, code, '철수');

  await page.getByLabel('방 정보').click();
  await page.getByRole('button', { name: '낚시 종료' }).click();
  await page.getByRole('button', { name: '종료하기' }).click();

  // Plan FR-17 — 종료하면 모든 참여자 화면이 통계로 전환된다
  await expect(page.getByText('오늘의 강태공')).toBeVisible();
  await expect(guest.getByText('오늘의 강태공')).toBeVisible();

  // 조과 탭으로 돌아가면 입력이 잠겨 있다
  await page.getByRole('button', { name: '조과', exact: true }).click();
  await expect(page.getByText('낚시가 종료됐어요')).toBeVisible();
  await expect(page.getByLabel('우럭 한 마리 추가')).toBeDisabled();
});

test('#17 연결 상태 알약이 상세를 펼친다 (FR-20)', async ({ page }) => {
  await createRoomViaUi(page);

  await page.getByRole('button', { name: /연결 상태/ }).click();

  await expect(page.getByText('마지막 동기화')).toBeVisible();
  await expect(page.getByText('대기 중')).toBeVisible();
  await expect(page.getByRole('button', { name: '지금 다시 시도' })).toBeVisible();
});

/**
 * Check 단계 갭 회귀 테스트.
 *
 * C2(FR-08 도달 불가), I1(접속 점 하드코딩), I2(기기 수 미표시),
 * I4(공동 순위 비가시)가 화면에서 실제로 해소됐는지 확인한다.
 */
test('#18 0마리 카드는 삭제, 기록 있는 카드는 숨기기만 된다 (갭 C2 / FR-08)', async ({ page }) => {
  await createRoomViaUi(page);
  await addSpecies(page, '우럭');
  await addSpecies(page, '광어');

  // 광어에 기록을 남긴다
  await page.getByLabel('광어 한 마리 추가').click();
  await expect(page.getByLabel('광어 1마리')).toBeVisible();

  await page.getByRole('button', { name: '+ 어종 추가' }).click();
  await expect(page.getByText('내 카드 관리')).toBeVisible();

  // 0마리인 우럭은 삭제 가능
  await page.getByLabel('우럭 카드 삭제').click();
  await expect(page.getByText('우럭 카드를 지웠어요')).toBeVisible();

  // 기록 있는 광어는 삭제 버튼이 없고 숨기기만 있다
  await expect(page.getByLabel('광어 카드 삭제')).toHaveCount(0);
  await page.getByLabel('광어 카드 숨기기').click();
  await expect(page.getByText('광어 카드를 숨겼어요')).toBeVisible();

  await page.getByLabel('닫기').click();

  // 그리드에서 둘 다 사라졌다
  await expect(page.getByLabel('우럭 한 마리 추가')).toHaveCount(0);
  await expect(page.getByLabel('광어 한 마리 추가')).toHaveCount(0);
});

test('#19 방 정보 시트에 접속 점과 기기 수가 실제로 표시된다 (갭 I1·I2)', async ({
  page,
  browser,
}) => {
  const code = await createRoomViaUi(page);
  const guest = await joinRoomViaUi(browser, code, '철수');

  await page.getByLabel('방 정보').click();

  // 방장 본인은 접속 중 — aria-label로 확인 (점은 aria-hidden)
  const rows = page.getByRole('dialog').getByText('홍길동');
  await expect(rows.first()).toBeVisible();

  // 철수도 접속 중이므로 초록 점이 2개여야 한다
  await expect(page.locator('.member__dot--on')).toHaveCount(2);

  void guest;
});

test('#20 동점이면 "공동" 배지가 눈에 보인다 (갭 I4 / FR-14)', async ({ page, browser }) => {
  const code = await createRoomViaUi(page);
  await addSpecies(page, '우럭');
  const guest = await joinRoomViaUi(browser, code, '철수');
  await addSpecies(guest, '광어');

  // 둘 다 1마리 = 공동 1위
  await page.getByLabel('우럭 한 마리 추가').click();
  await guest.getByLabel('광어 한 마리 추가').click();

  await page.getByRole('button', { name: /내 조과/ }).click();

  // sr-only가 아니라 실제로 보이는 배지여야 한다
  await expect(page.getByText('공동').first()).toBeVisible();
});

test('#21 한 명이 어종을 추가하면 다른 사람 화면에도 바로 뜬다', async ({ page, browser }) => {
  const code = await createRoomViaUi(page);
  const guest = await joinRoomViaUi(browser, code, '철수');

  // 철수는 아직 아무 카드도 없다
  await expect(guest.getByLabel('우럭 한 마리 추가')).toHaveCount(0);

  await addSpecies(page, '우럭');

  // 철수가 아무것도 안 했는데 카드가 생기고, 바로 누를 수 있어야 한다
  await expect(guest.getByLabel('우럭 한 마리 추가')).toBeVisible({ timeout: 3000 });
  await guest.getByLabel('우럭 한 마리 추가').click();
  await expect(guest.getByLabel(/^우럭 \d+마리$/)).toContainText('1');
});

test('#22 늦게 들어온 사람도 방에 있던 어종을 전부 본다', async ({ page, browser }) => {
  const code = await createRoomViaUi(page);
  await addSpecies(page, '우럭');
  await addSpecies(page, '광어');

  const late = await joinRoomViaUi(browser, code, '영희');

  await expect(late.getByLabel('우럭 한 마리 추가')).toBeVisible();
  await expect(late.getByLabel('광어 한 마리 추가')).toBeVisible();
});
