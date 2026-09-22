/**
 * scripts/og-card.html → public/og.png (1200×630) 렌더러.
 *
 *   node scripts/build-og-image.mjs
 *
 * 이미 devDependency로 있는 Playwright 크로미움을 쓴다. 이미지 라이브러리를
 * 새로 들이지 않으려고 이 방식을 택했다. 카드 문구·색을 바꿨으면 다시 돌려서
 * public/og.png 를 커밋한다 (런타임에는 PNG만 쓰인다).
 */
import { chromium } from '@playwright/test';
import { fileURLToPath, URL } from 'node:url';

const src = fileURLToPath(new URL('./og-card.html', import.meta.url));
const out = fileURLToPath(new URL('../public/og.png', import.meta.url));

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.goto(`file://${src}`);
// 웹폰트(Black Han Sans)가 붙기 전에 찍으면 제목이 시스템 폰트로 나온다
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();

console.log(`wrote ${out}`);
