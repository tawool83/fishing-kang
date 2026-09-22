# 이어서 할 일 (2026-09-21 기준)

> 다른 환경에서 이어받을 때 이 문서부터 읽으세요.
> 현재 상태: **PDCA Act 1회차 완료, Match Rate 97.0%, 테스트 219건 통과.**

---

## 0. 환경 복구

```bash
pnpm install

# 검증 (테스트 219건)
pnpm verify        # typecheck + lint + L0·L1 테스트 188건
pnpm test:e2e      # L2·L3 브라우저 테스트 31건 (Chromium 필요)

# 처음이면 브라우저 설치
npx playwright install chromium
```

### 화면 직접 보기

```bash
pnpm build && npx wrangler dev --port 8787
# → http://127.0.0.1:8787
```

**주의사항 3가지** (전부 실제로 겪은 것):

1. **빌드가 끝난 뒤에 서버를 켜야 한다.** `pnpm build & wrangler dev &` 처럼 한 명령으로 묶어
   백그라운드에 보내면 wrangler가 빌드 중인 `dist/`를 읽어 `/assets/*.js`가 SPA 폴백(HTML)으로
   응답한다. 브라우저는 MIME 오류로 앱을 못 띄우고, 증상은 "모든 테스트가 타임아웃"으로 나타난다.
2. **Windows에서 `pkill`은 `workerd`를 못 잡는다.** 좀비 프로세스가 구버전 자산 매니페스트를
   붙들고 있으면 위와 같은 증상이 난다. PowerShell로 정리한다:
   ```powershell
   Get-Process workerd -ErrorAction SilentlyContinue | Stop-Process -Force
   Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
     Where-Object { $_.CommandLine -like '*wrangler*' } |
     ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
   ```
3. **2인 이상 테스트는 시크릿 창으로.** 기기 ID가 쿠키라서 같은 브라우저의 새 탭은
   **같은 참여자**로 인식된다(FR-03의 정상 동작). 별도 쿠키 저장소가 곧 별도 기기다.

---

## 1. 우선 수정 — 통계 화면 레이아웃 (신규 발견)

실제 화면을 캡처해 보고 발견했다. 테스트는 "요소가 존재하는가"만 보므로 잡히지 않았다.
캡처는 [`screenshots/`](screenshots/)에 있다 — 문제가 보이는 화면은
[`screenshots/11-stats.png`](screenshots/11-stats.png).

### 1-1. 포디움이 두 번 나온다 ⚠️ 가장 눈에 띔

**증상**: 통계 탭인데 상단 조과 헤더(포디움 + "내 조과 N마리" + 순위 목록)가 그대로 남아 있고,
그 아래 통계의 "오늘의 강태공" 포디움이 또 나온다.

**원인**: `src/presentation/client/pages/CatchBoard.tsx` — `board__header`가 탭과 무관하게 항상 렌더된다.
`{tab === 'stats' && <StatsBoard/>}`로 본문만 갈아끼웠고 헤더는 그대로 뒀다.

**수정안**: 통계 탭에서는 헤더를 방 이름 + `ConnectionPill` + 방 정보 버튼만 남기고
포디움·내 순위 요약·순위 목록을 숨긴다.

```tsx
// CatchBoard.tsx — 헤더 내부
{tab !== 'stats' && (
  <>
    <Podium podium={store.podium.value} />
    <button class="board__mysummary" …>…</button>
    {(expandRanks || tab === 'rank') && …}
  </>
)}
```

> Design §5.4 ⑥은 통계 화면이 **자체 하늘 헤더 + 최종 포디움**을 갖는다고 명시한다.
> 즉 위쪽 조과 헤더는 통계 탭에서 나오면 안 된다.

### 1-2. 시간대별 막대가 화면을 가득 채운다

**증상**: 버킷이 1~2개일 때 막대 하나가 화면 폭 전체를 차지해 거대한 빨간 블록이 된다.

**원인**: `src/presentation/client/components/stats/stats.css`
```css
.buckets__col { flex: 1 0 auto; min-width: 26px; }
```
`flex-grow: 1` 때문에 칸 수가 적으면 무한정 넓어진다.

**수정안**:
```css
.buckets { justify-content: flex-start; }          /* 추가 */
.buckets__col { flex: 0 0 auto; width: 26px; }     /* grow 제거 */
```

### 1-3. 출조 시간이 "0분"으로 나온다

**원인**: `src/presentation/client/components/stats/SummaryGrid.tsx`의 `formatDuration()` —
`Math.round(ms / 60_000)`이라 30초는 0분이 된다. `ms <= 0`일 때만 `'—'`를 돌려준다.

**수정안**:
```ts
if (ms <= 0) return '—';
if (ms < 60_000) return '1분 미만';
```

### 1-4. 탭바와 본문 겹침 — **실기기 확인 필요**

캡처에서 요약 4칸("3마리 / 2명 / 2종 / 0분")이 탭바에 잘려 보인다.
다만 `fullPage` 캡처는 `position: sticky` 요소를 스크롤 위치에 렌더하므로 **캡처 특성일 수 있다.**
실제 뷰포트에서 먼저 확인하고, 진짜 겹치면 `.board__body`에 하단 패딩을 준다:

```css
.board__body { padding-bottom: calc(56px + var(--sp-8)); }
```

### 1-5. 누적 추이 선 그래프가 빈약함 (Minor)

축·눈금이 없어 선 두 개만 떠 있다. 조과가 적을 때 특히 어색하다.
Design §5.4 ⑥은 "역전 드라마 확인용"이라고만 적어 축을 요구하진 않는다. 우선순위 낮음.

---

## 1-6. 단톡방 링크 미리보기 (OG 카드) — **2026-09-22 적용됨**

링크를 단톡방에 붙이면 제목 없는 맨 URL로 떴다. `index.html` 에 기본 카드를 박고,
초대 링크(`/r/:CODE`)에서만 워커가 문구를 초대장으로 덮어쓴다.

| 파일 | 역할 |
|---|---|
| `src/presentation/client/index.html` | 기본 og:*/twitter:* — 홈 카드 |
| `src/presentation/worker/og.ts` | `/r/:CODE` 에서 바꿀 값 (`Map`). 그 외 경로는 `null` → 리라이터를 아예 안 태운다 |
| `src/presentation/worker/index.ts` | `HTMLRewriter` 로 `<meta content>` 만 교체 |
| `public/og.png` | 1200×630 카드. 원본 `scripts/og-card.html`, 재생성 `pnpm build:og` |

**왜 홈 카드를 워커가 안 만드나** — Workers Assets는 실제 파일이 있는 경로(`/`, `/og.png`)를
워커를 거치지 않고 내보낸다 (Plan §7.2 "정적 요청은 무료"의 이면). `/r/:CODE` 는 파일이 없어
SPA 폴백으로 워커를 타므로 거기서만 손댈 수 있다.

**방 이름은 싣지 않는다** — 사용자가 적은 문자열이고 스크래퍼 캐시에 남는데, 링크를 받는 쪽은
이미 어느 단톡방인지 안다 (Plan §9). 덕분에 카드가 방과 무관해져 스크랩 요청이 DO를 깨우지 않는다.

---

## 2. Check 단계에서 남긴 갭

전체 목록과 근거는 `docs/03-analysis/gangtaegong.analysis.md` §5, §10.6 참고.

### 사람 손이 필요한 것

| 항목 | 내용 |
|---|---|
| **M4 필드 테스트** | 실제 낚시터에서 지인 2~3명과 실전. 비행기 모드 on/off로 대기열 검증. **Plan DoD의 마지막 미충족 항목이며 자동화 불가** |
| Lighthouse 측정 | Plan §4.2 Quality Criteria. 모바일 Performance/Accessibility 90+ 목표 |
| **OG 카드 실물 확인** | 배포 후 단톡방에 `https://fish.allegru.dev/r/<코드>` 를 붙여 카드가 뜨는지 본다. 카톡은 스크랩 결과를 캐시하므로 문구를 고쳤으면 [카카오 개발자 도구](https://developers.kakao.com/tool/clear/og)에서 캐시를 지운다. 2026-09-22 추가 |

### 코드 작업 (Important, 미수정)

| # | 항목 | 위치 |
|---|---|---|
| I7 | pending 카드 "대기 배지" 없음 (점선 테두리만) | `SpeciesCard.tsx` |
| I8 | 방 정보 시트에서 코드 복사 시 토스트 없음 (② 화면엔 있음) | `RoomInfoSheet.tsx` |
| I9 | 통계에서 대리입력 건 "작게 표시" 미구현 (전체 집계 1줄뿐) | `StatsBoard.tsx` |
| I10 | 최근 방 목록에 진행중/종료 배지·인원·내 순위 없음 | `services.ts`의 `RecentRoom` 타입부터 필드 추가 필요 |

### 보류 결정 (수정 대상 아님)

| 항목 | 사유 |
|---|---|
| QR 카드 (§5.4 ②⑤) | 2026-09-21 보류 결정. 설계 문서에 취소선으로 명시됨. 되살리려면 `qrcode-generator`급 소형 라이브러리(gzip ~5KB) 권장 — QR은 Reed-Solomon 오류정정이 들어가 직접 구현 시 스캔 안 되는 코드가 나올 수 있다 |
| 결과 카드 공유 (US-09) | Plan에서 P1로 범위 외. 현재 버튼 비활성. 착수하면 Canvas로 카드를 그려 `navigator.share({files})` 로 넘기는 쪽이 싸다 — 카카오 SDK는 이미지가 **URL**이어야 해서 R2 업로드가 따라붙는다 |
| 카카오 JS SDK 공유 | 2026-09-22 검토 후 보류. `Kakao.Share.sendDefault()` 는 로그인·심사 없이 쓸 수 있지만(JS키 + 플랫폼 도메인 등록이면 끝), OG 카드 대비 더 주는 건 "카톡 전용 카드 UI"와 데스크톱 공유뿐이다. 외부 스크립트 ~100KB는 gzip 150KB 예산(Plan NFR)에 비해 비싸다 |

### 문서 작업

| 항목 | 내용 |
|---|---|
| README 배포 절차 | Plan §4.1 DoD #8. `wrangler deploy`, 커스텀 도메인(`fish.allegru.dev`) 연결 절차 |
| `docs/01-plan/schema.md` | Design §3이 사실상의 스키마 정의. Pipeline Phase 1 문서로 이관 |
| `docs/01-plan/conventions.md` | Design §9·§10이 사실상의 컨벤션. Pipeline Phase 2 문서로 이관 |
| `seed.ts` dead code | `src/presentation/worker/seed.ts`의 `seedRoom()` 호출처가 0건. 개발용 시드 라우트를 붙이거나 삭제 |
| `__COOLDOWN_MS__` 미사용 | `vite.config.ts`가 주입하지만 소비처 0. 도메인은 `10_000` 하드코딩. 둘 중 하나로 정리 |

---

## 3. 다음 PDCA 단계

```bash
/pdca report gangtaegong      # Match Rate 97% ≥ 90% → 보고서 생성 가능
```

레이아웃 수정을 먼저 하려면:

```bash
/pdca iterate gangtaegong     # Act 2회차
```

---

## 4. 화면 캡처 재생성

현재 캡처는 [`screenshots/`](screenshots/)에 커밋돼 있다(12장 + 설명).
코드를 고친 뒤 갱신하려면 `tests/e2e/`에 임시 spec을 두고 실행한다.
(캡처 스크립트 자체는 커밋하지 않았다 — 아래 골자로 다시 작성)

```ts
// tests/e2e/shots.spec.ts (임시)
import { test, expect } from '@playwright/test';
import { addSpecies, createRoomViaUi, joinRoomViaUi } from './helpers';

test('화면 캡처', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await page.screenshot({ path: '.screens/01-home.png', fullPage: true });
  // … createRoomViaUi → addSpecies → 탭 → 시트별로 screenshot
});
```

```bash
npx playwright test shots --reporter=line
```

`tests/e2e/helpers.ts`의 `createRoomViaUi` / `joinRoomViaUi` / `addSpecies`를 쓰면
방 생성·입장·어종 추가를 한 줄로 끝낼 수 있다. `joinRoomViaUi(browser, …)`는
**새 BrowserContext**를 만든다 — 같은 컨텍스트의 새 탭은 같은 기기로 인식되기 때문이다.

---

## 5. 현재 상태 요약

| 항목 | 값 |
|---|---|
| Match Rate | **97.0%** (Structural 95 / Functional 96 / Contract 98 / Runtime 100) |
| 테스트 | **219건** — L0 143 / L1 45 / L2 20 / L3 11 |
| 커버리지 | Lines 84.9% / Branch 85.8% (임계값 80/75) |
| 번들 | gzip 34KB (예산 150KB의 23%) |
| Plan DoD | 5/8 충족 (미충족: 필드 테스트, README 배포 절차, 화면-캔버스 일치 부분) |
| Decision Record | 9/9 준수 |

**Plan 최우선 리스크는 자동 회귀 테스트로 고정돼 있다** —
`tests/e2e/gangtaegong-e2e.spec.ts` #3(오프라인 대기열: 유실 0·중복 0)과
#4(스냅샷 병합)가 그것이다. 리팩터링 시 이 둘이 깨지면 멈추고 원인을 찾을 것.
