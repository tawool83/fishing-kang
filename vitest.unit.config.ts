import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Design Ref: §8.1 — L0(도메인 + 유스케이스)는 DO·브라우저 없이 Node에서 전부 돈다.
 * Option B의 실익이 여기서 나온다: Port에 Fake를 꽂으면 UseCase 전체를 순수하게 검증할 수 있다.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@domain': r('./src/domain'),
      '@application': r('./src/application'),
      '@infrastructure': r('./src/infrastructure'),
      '@presentation': r('./src/presentation'),
      '@tests': r('./tests'),
    },
  },
  test: {
    name: 'unit',
    environment: 'node',
    include: ['tests/unit/**/*.spec.ts'],
  },
});
