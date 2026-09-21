import { defineConfig, devices } from '@playwright/test';

const PORT = 8787;
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;

/**
 * Design Ref: §8.1 — L2/L3는 **진짜 서버**에 붙는다.
 *
 * `wrangler dev`가 Worker + Durable Object + 정적 자산을 모두 띄우므로
 * 브라우저에서 방 생성 → WebSocket → 조과 기록까지 실제 경로로 검증된다.
 * Vite dev 서버에 API를 목으로 붙이면 정작 배선 오류를 놓친다.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // 같은 wrangler dev 인스턴스를 공유한다
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    // 기본은 모바일 — 이 서비스는 폰에서만 쓴다
    ...devices['iPhone 13'],
  },

  projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 5'] } }],

  webServer: {
    command: `pnpm build && npx wrangler dev --port ${String(PORT)} --ip 127.0.0.1 --log-level warn`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
