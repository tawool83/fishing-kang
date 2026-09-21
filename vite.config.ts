import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath, URL } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Design Ref: §7 — 번들 예산 gzip 150KB. 차트 라이브러리 없이 인라인 SVG로 간다.
export default defineConfig({
  plugins: [preact()],
  root: 'src/presentation/client',
  publicDir: r('./public'),
  resolve: {
    alias: {
      '@domain': r('./src/domain'),
      '@application': r('./src/application'),
      '@infrastructure': r('./src/infrastructure'),
      '@presentation': r('./src/presentation'),
    },
  },
  define: {
    // Design Ref: §10.3 — COOLDOWN_MS는 빌드 타임 주입
    __COOLDOWN_MS__: JSON.stringify(Number(process.env['COOLDOWN_MS'] ?? 10_000)),
  },
  build: {
    outDir: r('./dist'),
    emptyOutDir: true,
    target: 'es2022',
    reportCompressedSize: true,
  },
});
