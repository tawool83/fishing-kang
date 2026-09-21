/* eslint-disable @typescript-eslint/triple-slash-reference, @typescript-eslint/no-empty-object-type */

// `@cloudflare/vitest-pool-workers/types`를 `reference types`로 걸면 패키지 exports의
// "./types" 조건이 TS 해석과 맞지 않아 `cloudflare:test`가 잡히지 않는다.
// 선언 파일 경로를 직접 가리킨다.
/// <reference path="../../node_modules/@cloudflare/vitest-pool-workers/types/cloudflare-test.d.ts" />

import type { Env } from '@presentation/worker/env';

/**
 * `cloudflare:test`의 `env`가 우리 Worker의 바인딩 타입을 갖도록 확장한다.
 * (vitest.workers.config.ts의 miniflare.bindings / durableObjects와 짝을 이룬다)
 *
 * 빈 인터페이스가 맞다 — 확장 자체가 목적이다.
 */
declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}
