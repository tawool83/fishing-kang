import type { Browser, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** 홈에서 방을 만들고 조과 화면까지 들어간다. 초대코드를 돌려준다 */
export async function createRoomViaUi(
  page: Page,
  roomName = '9월 27일 태안 선상',
  displayName = '홍길동'
): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: '방 만들기' }).click();

  await page.getByLabel('방 이름').fill(roomName);
  await page.getByLabel('내 이름').fill(displayName);
  await page.getByRole('button', { name: '만들기' }).click();

  await expect(page.getByText('방이 만들어졌어요')).toBeVisible();

  // 코드 타일의 aria-label에서 6자리를 읽어낸다
  const label = await page.getByRole('button', { name: /초대코드/ }).getAttribute('aria-label');
  const code = (label ?? '').replace(/[^0-9A-Z]/g, '').slice(0, 6);

  await page.getByRole('button', { name: '출조 시작 · 방 들어가기' }).click();
  await expect(page.getByText('연결됨')).toBeVisible();

  return code;
}

/**
 * 다른 **기기**로 방에 참여한다.
 *
 * 반드시 새 BrowserContext를 만든다. 같은 컨텍스트에서 페이지만 새로 열면
 * 기기 ID 쿠키를 공유해서 서버가 "이미 멤버"로 판단하고 입장 화면을 건너뛴다
 * (Plan FR-03의 정상 동작). 컨텍스트가 곧 기기다.
 */
export async function newDevice(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

export async function joinRoomViaUi(
  browser: Browser,
  code: string,
  displayName: string
): Promise<Page> {
  const page = await newDevice(browser);
  await page.goto(`/r/${code}`);

  await page.getByLabel('내 이름').fill(displayName);
  await page.getByRole('button', { name: '입장', exact: true }).click();
  await expect(page.getByText('연결됨')).toBeVisible();

  return page;
}

/** 조과 화면에서 어종 카드를 추가한다 */
export async function addSpecies(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: '+ 어종 추가' }).click();
  await page.getByLabel('어종 이름').fill(name);
  await page.getByRole('button', { name: '추가', exact: true }).click();
  await expect(page.getByLabel(`${name} 한 마리 추가`)).toBeVisible();
}

/** 카드의 현재 마릿수 */
export async function countOf(page: Page, species: string): Promise<number> {
  const text = await page.getByLabel(new RegExp(`^${species} \\d+마리$`)).textContent();
  return Number((text ?? '0').trim());
}
