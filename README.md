# 🎣 강태공 (gangtaegong)

지인끼리 낚시 갈 때 초대코드로 방에 모여, 어종 카드를 탭해 조과를 기록하고
금·은·동 순위를 실시간으로 겨루는 **설치 없는 모바일 웹**.

- 회원가입·로그인 없음. 6자리 초대코드 / 링크 / QR로 바로 입장
- 어종 카드 +1 / −1 / 되돌리기, +1은 **사람 단위 10초 쿨다운**
- 금·은·동 포디움 (동점은 공동 순위), 종료 후 통계
- 전파가 약한 낚시터에서도 탭이 유실되지 않는 오프라인 대기열
- Cloudflare Workers + Durable Objects **무료 플랜** (월 0원)

> 재미용 서비스다. **조작 방지는 하지 않는다** (확정). 권한 검사는 보안이 아니라 역할 구분이다.

## 문서

| 단계 | 문서 |
|---|---|
| Plan | [docs/01-plan/features/gangtaegong.plan.md](docs/01-plan/features/gangtaegong.plan.md) |
| Design | [docs/02-design/features/gangtaegong.design.md](docs/02-design/features/gangtaegong.design.md) |
| 갭 분석 | [docs/03-analysis/gangtaegong.analysis.md](docs/03-analysis/gangtaegong.analysis.md) |
| **화면 캡처** | [docs/screenshots/](docs/screenshots/) — 실제 동작 화면 12장 |
| 이어서 할 일 | [docs/NEXT.md](docs/NEXT.md) |
| 기획 원문 | [Notion](https://app.notion.com/p/3e27ef63522980f59b02dfca3777acc5) |
| 디자인 초안 | [Notion](https://app.notion.com/p/3e27ef63522981eea087d92787e3b89b) · [캔버스](https://claude.ai/artifact/4acajiyND8wRCmFfMCmbtk) |

## 시작하기

```bash
pnpm install
pnpm test          # 전체 (L0 143건 + L1 41건)
pnpm test:unit     # L0만 — 도메인·유스케이스, Node에서 빠르게
pnpm test:workers  # L1만 — 진짜 workerd + DO SQLite + WebSocket
pnpm verify        # typecheck + lint + test
pnpm dev           # 프론트 개발 서버 (Vite)
pnpm build         # dist/ 빌드 — 현재 gzip 33.9KB (JS 28.9 + CSS 5.0)
pnpm test:e2e      # L2+L3 — wrangler dev + Chromium (28건)
```

## 아키텍처

Clean Architecture 4레이어. 의존성은 안쪽으로만 흐른다.

```
Presentation ──→ Application ──→ Domain ←── Infrastructure
```

핵심은 **UseCase를 클라이언트와 서버가 함께 쓰고 Repository 구현만 바꿔 끼우는 것**이다.

```
클라이언트 낙관적 예측:  RecordCatch(ProjectionRoomRepository) → 즉시 화면 반영
DO 서버 확정:            RecordCatch(SqliteRoomRepository)     → 브로드캐스트
```

같은 코드가 같은 순서로 돌기 때문에 쿨다운·순위·−1 대상 선택이 양쪽에서 어긋날 수 없다.

레이어 규칙은 `eslint.config.js`의 `no-restricted-imports`로 강제되며 CI에서 실패한다.
`src/domain/`은 npm 패키지를 하나도 import하지 않고, `Date.now()`·`crypto`도 직접 부르지 않는다
(시각과 ID는 인자로 받는다 → 테스트에서 시간 제어 가능).

```
src/
├── domain/          entities · rules · stats · errors   ← 외부 의존 0
├── application/     ports · usecases · dto              (module-2)
├── infrastructure/  worker/ · client/                   (module-2~3)
└── presentation/    client/ · worker/                   (module-3~5)
```

## 현재 진행 상황

Do 단계 완료 — 다음은 `/pdca analyze gangtaegong` (Check).


| 모듈 | 내용 | 상태 |
|---|---|:-:|
| module-1 | 스캐폴딩 + 도메인 코어 + L0 테스트 | ✅ |
| module-2 | Application Port·UseCase + Worker 인프라 + L1 | ✅ |
| module-3 | 클라이언트 인프라 + 화면 ①②③ | ✅ |
| module-4 | 조과 화면 ④⑤⑦⑧⑨⑩ + L2 | ✅ |
| module-5 | 통계 ⑥ + PWA + L3 | ✅ |

## 스택

| 계층 | 선택 |
|---|---|
| 프론트 | Vite + TypeScript + Preact (+ Signals) |
| 호스팅 | Cloudflare Workers (Static Assets) |
| 실시간·상태 | Durable Objects + WebSocket Hibernation |
| DB | DO 내장 SQLite |
| 인증 | 없음 |
| 테스트 | Vitest (L0·L1) + Playwright (L2·L3) |
