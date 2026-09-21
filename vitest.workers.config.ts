import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { fileURLToPath, URL } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Design Ref: §8.1 — L1은 **진짜 workerd 런타임**에서 돈다.
 * DO SQLite, WebSocket Hibernation, alarm이 모두 실물이라
 * 배선 오류를 여기서 잡는다.
 *
 * wrangler.toml을 참조하지 않고 바인딩을 인라인으로 준다.
 * `[assets]`의 `./dist`가 아직 없어 설정 읽기가 실패할 수 있기 때문이다.
 */
export default defineWorkersConfig({
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
    name: 'workers',
    include: ['tests/worker/**/*.spec.ts'],
    poolOptions: {
      workers: {
        main: './src/presentation/worker/index.ts',
        singleWorker: true,
        /**
         * 스토리지 격리를 끈다.
         *
         * DO의 `webSocketClose`가 접속자 목록(초록 점)을 갱신하려고 스토리지를 읽는데,
         * 이게 테스트 프레임이 닫힌 뒤에 비동기로 실행돼 "Failed to pop isolated storage"가 난다.
         * 각 테스트는 매번 새 초대코드로 방을 만들어 서로 다른 DO를 쓰므로
         * 격리를 꺼도 테스트 간 간섭이 없다.
         *
         * 존재하지 않는 방을 조회하는 테스트는 **파일마다 다른 코드**를 써야 한다.
         * 같은 코드를 두 파일이 쓰면 파일 사이 모듈 리로드로 그 DO가 무효화되어
         * ("changed, invalidating this Durable Object") 500이 난다.
         */
        isolatedStorage: false,
        miniflare: {
          // 런타임이 지원하는 날짜로 맞춘다. 프로덕션(wrangler.toml)은 더 최신이어도
          // 테스트는 DO SQLite만 있으면 되므로 낮춰도 검증력에 영향이 없다.
          compatibilityDate: '2025-10-01',
          durableObjects: {
            ROOM_DO: { className: 'RoomDurableObject', useSQLite: true },
          },
          bindings: {
            APP_ORIGIN: 'https://fish.allegru.dev',
            ROOM_TTL_DAYS: '7',
            COOLDOWN_MS: '10000',
          },
        },
      },
    },
  },
});
