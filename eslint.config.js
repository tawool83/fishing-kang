// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Design Ref: §9.3 — 레이어 의존성 규칙을 설정에 박아 CI에서 실패시킨다.
 *
 *   Presentation ──→ Application ──→ Domain ←── Infrastructure
 *
 * Domain은 완전 독립(외부 패키지 import 0개), Application은 Port 인터페이스만 안다.
 *
 * NOTE: `import/no-restricted-paths`를 쓰지 않는 이유 —
 * 그 규칙은 specifier를 실제 파일로 resolve해야 동작하는데, TypeScript resolver가
 * 없으면 **경고 없이 조용히 no-op**이 된다. 실제로 `../../application/...` 같은
 * 상대 경로 위반이 그냥 통과하는 것을 확인했다. specifier 문자열을 직접 보는
 * `no-restricted-imports` 정규식은 resolver가 필요 없고 항상 동작한다.
 */

/** 별칭(`@application/x`)과 상대 경로(`../../application/x`)를 모두 잡는다 */
const layer = (name) => `(^|[/@])${name}(/|$)`;

export default tseslint.config(
  { ignores: ['dist/**', '.wrangler/**', 'node_modules/**', 'coverage/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // ── Domain: 완전 독립. 외부 패키지도, 바깥 레이어도 import하지 않는다 ──
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // 상대 경로가 아닌 모든 specifier = npm 패키지 또는 경로 별칭
              regex: '^[^.]',
              message:
                'Domain은 외부 패키지·경로 별칭을 import할 수 없습니다. 순수 로직만 담습니다 (Design §1.2)',
            },
            {
              // 상대 경로로 바깥 레이어를 우회 참조하는 것도 막는다
              regex: layer('application|infrastructure|presentation'),
              message: 'Domain은 바깥 레이어를 의존할 수 없습니다 (Design §9.3)',
            },
          ],
        },
      ],
      // Design §10.4 — Domain은 시각·ID를 인자로 받는다. Clock / IdGenerator 포트를 쓴다
      'no-restricted-globals': [
        'error',
        { name: 'crypto', message: 'Domain은 ID를 인자로 받습니다. IdGenerator 포트를 사용하세요' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Date',
          property: 'now',
          message: 'Domain은 시각을 인자로 받습니다. Clock 포트를 사용하세요 (Design §10.4)',
        },
      ],
    },
  },

  // ── Application: Domain + 자기 Port만 안다. 구현은 조립 지점에서 주입받는다 ──
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: layer('infrastructure'),
              message:
                'Application은 Infrastructure 구현을 직접 의존할 수 없습니다. Port를 사용하세요 (Design §9.3)',
            },
            {
              regex: layer('presentation'),
              message: 'Application은 Presentation을 의존할 수 없습니다 (Design §9.3)',
            },
          ],
        },
      ],
    },
  },

  // ── Infrastructure: Domain + Port만 안다. UseCase는 모른다 ──
  {
    files: ['src/infrastructure/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: layer('presentation'),
              message: 'Infrastructure는 Presentation을 의존할 수 없습니다 (Design §9.3)',
            },
            {
              regex: '(^|[/@])application/usecases(/|$)',
              message:
                'Infrastructure는 UseCase를 의존할 수 없습니다. Port만 구현하세요 (Design §9.3)',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['tests/**/*.ts', '*.config.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },

  // 서비스 워커는 별도 전역 스코프에서 돈다 (window가 없다)
  {
    files: ['public/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Response: 'readonly',
        Promise: 'readonly',
      },
    },
  }
);
