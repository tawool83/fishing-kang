import { defineConfig } from 'vitest/config';

/**
 * 테스트 프로젝트 2개 (Design §8.1):
 *   · unit    — L0 도메인·유스케이스. Node 환경, 빠름
 *   · workers — L1 HTTP·WS·DO. 진짜 workerd 런타임
 *
 * 커버리지는 도메인·애플리케이션 레이어만 본다 (Plan §4.2 — 80% 이상).
 * `pnpm test:cov`는 unit 프로젝트만 돌린다.
 */
export default defineConfig({
  test: {
    projects: ['./vitest.unit.config.ts', './vitest.workers.config.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/application/**'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
      reporter: ['text', 'html'],
    },
  },
});
