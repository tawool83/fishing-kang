# 강태공(gangtaegong) 갭 분석

> **Match Rate: 93.6% → 97.0%** (Act 1회차 수정 후)
> **판정: Critical 3건 해소. 잔여는 보류 결정(QR)과 사람 손이 필요한 항목(필드 테스트)**
>
> **Project**: fishing-kang
> **Date**: 2026-09-21
> **Phase**: Check
> **Plan**: [gangtaegong.plan.md](../01-plan/features/gangtaegong.plan.md)
> **Design**: [gangtaegong.design.md](../02-design/features/gangtaegong.design.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 조과 집계가 기억·단톡방에 흩어져 실시간 경쟁 재미와 사후 기록이 모두 사라진다 |
| **WHO** | 출조하는 지인 2~15명. 설치·가입 거부. 방장 1명 + 일반 참여자 |
| **RISK** | 통신 불량으로 탭이 증발하면 신뢰가 즉시 무너진다. 그다음이 iOS 저장소 삭제로 인한 신원 유실 |
| **SUCCESS** | 필드 테스트에서 조과 유실 0건·중복 0건, 포디움 1초 이내, Cloudflare 월 0원 |
| **SCOPE** | M1 뼈대 → M2 메인 화면 → M3 통계 → M4 필드 테스트 |

---

## 1. Match Rate

Design §8 Test Plan이 전량 실행됐으므로 **Runtime 포함 공식**을 적용한다.

```
Overall = Structural×0.15 + Functional×0.25 + Contract×0.25 + Runtime×0.35
        = 95×0.15 + 88×0.25 + 92×0.25 + 98×0.35
        = 14.25 + 22.00 + 23.00 + 34.30
        = 93.6%
```

| 축 | 점수 | 가중 | 근거 |
|---|:---:|:---:|---|
| **Structural** | 95% | 0.15 | §11.1 파일 전 카테고리 실존, §9.4 레이어 배정표 전 행 매핑, §5.3 컴포넌트 18개 중 16 존재 / 1 인라인화 / **1 부재(QrCard)** |
| **Functional** | 88% | 0.25 | §5.4 체크리스트 91항목 중 YES 74·PARTIAL 14·NO 3. FR-01~30 중 MET 26·PARTIAL 3·NOT MET 1. TODO/스텁/목데이터 0건 |
| **Contract** | 92% | 0.25 | HTTP 7/7, WS 클→서 10/10·서→클 7/7, 에러코드 8/8, DB 스키마 100% 일치. **런타임 깨지는 계약 0건**, 문서 대비 응답 shape 드리프트 8건 |
| **Runtime** | 98% | 0.35 | 212건 전량 통과(실패 0). 설계 시나리오 대비 L1 17/17, L2 17/18, L3 11/10 |

> **중요**: Match Rate가 90%를 넘지만 **Plan §4.1 Definition of Done을 충족하지 못한다.**
> 분석 규칙상 Success Criteria 위반은 수치와 무관하게 Critical이다.

### 1.1 Runtime 상세

| 계층 | 건수 | 환경 | 결과 |
|---|:---:|---|:---:|
| L0 도메인·유스케이스·클라이언트 | 143 | Node (Fake Repository) | ✅ |
| L1 HTTP·WS·DO·TTL·동등성 | 41 | 실제 workerd + DO SQLite | ✅ |
| L2 UI 액션 | 17 | wrangler dev + Chromium | ✅ |
| L3 E2E 사용자 여정 | 11 | 멀티 컨텍스트 | ✅ |
| **합계** | **212** | | **0 실패** |

---

## 2. Strategic Alignment (WHY 검증)

| 질문 | 판정 | 근거 |
|---|:---:|---|
| PRD의 핵심 문제를 풀었는가 | — | PRD 없음(PM 단계 미실행). Plan WHY로 대체 평가 |
| **Plan WHY**: 실시간 경쟁 재미 + 사후 기록을 살렸는가 | ✅ | 포디움 실시간 갱신(L3 #2), 통계 화면 전 항목(L3 #11) 동작 확인 |
| **최우선 RISK**: 탭 유실을 막았는가 | ✅ | L3 #3에서 오프라인 3건 적재→복구→**유실 0·중복 0** 서버 교차 확인. L3 #4 스냅샷 병합도 통과 |
| **차순위 RISK**: 신원 유실을 막았는가 | ✅ | L3 #5 쿠키 복구, L3 #6 이름 선택 복구, L3 #7 접속 중 확인창 |
| 무료 플랜 유지 | ✅ | DO + Hibernation, 번들 gzip 33.9KB, 배포 dry-run 63.6KiB |

**전략적 정합성은 확보됐다.** 핵심 가치와 최우선 리스크 대응이 모두 자동 회귀 테스트로 고정돼 있다.

---

## 3. Plan Success Criteria 평가

### 3.1 Definition of Done (§4.1)

| # | 기준 | 판정 | 근거 |
|---|---|:---:|---|
| 1 | FR-01~FR-30 전부 구현 | ❌ **Not Met** | FR-15 미구현, FR-08 도달 불가, FR-01·FR-25 부분 (갭 #1 #2 #6 #12) |
| 2 | 6개 화면이 디자인 캔버스와 일치 | ⚠️ Partial | 토큰·타이포·버튼 크기는 일치. ② QR 부재, ②③ 무인도 일러스트 부재 |
| 3 | 미설계 화면 4종 설계 단계 확정 | ✅ Met | Design §5.4 ⑤⑧⑨⑩ 명세 + 전부 구현 |
| 4 | 핵심 로직 단위 테스트 | ✅ Met | 쿨다운 10·−1 대상 8·공동순위 8·멱등 3 — `tests/unit/domain`, `tests/unit/application` |
| 5 | L1 API 테스트 | ✅ Met | 41건, 비방장 대리입력 거부 포함 (`api.spec.ts`, `ws.spec.ts`) |
| 6 | L3 E2E | ✅ Met | 11건 (`gangtaegong-e2e.spec.ts`) |
| 7 | **M4 필드 테스트 통과** | ❌ Not Met | 실제 낚시터 미실시 — 사람 손이 필요 |
| 8 | 코드 리뷰 + README 배포 절차 | ⚠️ Partial | README에 배포 절차 없음 |

**충족: 4 / 8** (Partial 2, Not Met 2)

### 3.2 Quality Criteria (§4.2)

| 기준 | 판정 | 실측 |
|---|:---:|---|
| 도메인 로직 커버리지 80%+ | ✅ Met | Lines 85.6% / Branch 86.1%, 임계값 `vitest.config.ts:17`에 설정·강제됨 |
| Lint 0 / `tsc --noEmit` | ✅ Met | 둘 다 0 errors |
| `wrangler deploy` 빌드 성공 | ✅ Met | dry-run 성공, DO·Assets·env 바인딩 정상 |
| 무료 한도 20% 이내 | ✅ Met | 업로드 63.6KiB / gzip 14.8KiB |
| Lighthouse 90+ | ⬜ 미측정 | 측정 안 함 |

**충족: 4 / 5** (1 미측정)

---

## 4. Decision Record 준수

| 결정 | 출처 | 준수 | 근거 |
|---|---|:---:|---|
| Durable Objects (Supabase 아님) | Plan §7.2 | ✅ | `wrangler.toml` DO 바인딩 + SQLite 마이그레이션 |
| 쿨다운은 클라이언트가 강제, 서버 미검증 | Plan §7.2 | ✅ | 서버 경로에 `canRecordCatch` 0건 |
| Option B — UseCase 공유 | Design §2.0 | ✅ | `applyMessage()`를 `room-do.ts`와 `roomStore.ts`가 동일 호출, Repository만 교체 |
| Port 동기 | Design §9.4 | ✅ | `RoomRepository`에 `Promise` 0건 |
| 핑거프린트 미사용 | Design §7 | ✅ | UA는 `linkDevice` 저장만, 식별 로직 미참조 |
| 조작 방지·Rate limiting 없음 | Plan §2.2 | ✅ | 관련 코드 0건 |
| 차트 라이브러리 미사용 | Design §10.4 | ✅ | dependencies = `preact`, `@preact/signals` 뿐 |
| 데이터 보관 7일 | 2026-09-21 확정 | ✅ | `ROOM_TTL_DAYS=7`, TTL alarm 테스트 5건 |
| 레이어 규칙 CI 강제 | Design §9.3 | ✅ | 수단 변경(`no-restricted-imports`)하되 **의도는 더 강하게 달성** — 상대경로 우회까지 차단 |

**준수율 9/9.** 결정을 어긴 항목은 없다.

---

## 5. 갭 목록 (30건)

> 독립 제3자(gap-detector) 분석 후 주요 항목을 직접 재확인했다.
> 원 분석의 "커버리지 임계값 미설정" 지적은 **오판정**으로 확인되어 제외했다
> (`vitest.config.ts:17`에 설정돼 있고 실제로 강제됨).

### Critical (3)

| # | 축 | 설계 위치 | 갭 | 증거 | 신뢰도 |
|---|---|---|---|---|:---:|
| C1 | Functional | §5.4 ⑧ / FR-15 | **순위 추월 애니메이션 전무.** 행 위치 전환(FLIP) 코드 없음. CSS의 250ms는 막대 *너비* 전환이지 행 *위치*가 아님 | `RankList.tsx:32-87`, `RankList.css:87` | 100% |
| C2 | Functional+Contract | FR-08 | **0마리 카드 삭제·숨기기 도달 불가.** `RemoveCard` UseCase가 WS 프로토콜·`codec.ts`·`applyMessage.ts` 어디에도 없어 전송 경로 자체가 없음. `hideCard`는 프로토콜엔 있으나 **UI 진입점 0** | `removeCard` grep 0건, `hideCard` 클라 grep 0건 | 100% |
| C3 | Intent | Plan §4.1 DoD #1 | **"FR-01~FR-30 전부 구현" 미충족** — C1·C2로 인한 Success Criteria 위반 | 본 표 C1·C2, #6, #12 | 95% |

### Important (10)

| # | 축 | 설계 위치 | 갭 | 증거 | 신뢰도 |
|---|---|---|---|---|:---:|
| I1 | Functional | §5.4 ⑤ | **참여자 접속 점이 `online={false}` 하드코딩** — 전원 항상 회색. `toRoomState()`가 서버 `MemberDto.online`을 버리는 구조적 문제 | `RoomInfoSheet.tsx:72`, `roomStore.ts` | 100% |
| I2 | Functional | §5.4 ⑤ | **연결 기기 수 미표시.** 서버는 `deviceCount`를 계산·전송하지만 `MemberRow` props에 필드 자체가 없음 | `MemberRow.tsx` grep 0건 | 100% |
| I3 | Structural | §5.3 / §5.4 ②⑤ / FR-01 | **`QrCard` 부재.** 방 생성 완료·방 정보 시트 양쪽 QR 미구현 (2026-09-21 보류 결정) | `CreatedRoom.tsx:17-18` | 100% |
| I4 | Functional | §5.4 ⑧ | **"공동 N위" 라벨이 `sr-only`** — 시각 사용자에게 안 보임 | `RankList.tsx:60` | 100% |
| I5 | Contract | §4.2 | `GET /api/rooms/:code` 응답이 설계의 flat이 아니라 nested `{room:{...}}`. 서버↔클라 일치하므로 **동작은 정상** | `responses.ts:58-63` | 100% |
| I6 | Contract | §4.3 | WS 필드 불일치 3건: `hello.lastEventId` 미구현 / `snapshot` 중첩+`myMemberId` 추가 / `update`에 `roomStatus` 추가 | `ws-messages.ts` | 100% |
| I7 | Functional | §5.4 ④ | pending 카드 **"대기 배지" 없음** (점선 테두리만) | `SpeciesCard.tsx:43` | 95% |
| I8 | Functional | §5.4 ⑤ | 코드 탭 복사 시 **"복사했어요" 토스트 없음** (②는 있음) | `RoomInfoSheet.tsx:50-57` | 95% |
| I9 | Functional | FR-25 / §5.4 ⑥ | 통계의 **대리입력 건 "작게 표시" 미구현** — 전체 집계 1줄뿐. `entered_by` 기록 자체는 정상 | `StatsBoard.tsx:105-109` | 90% |
| I10 | Functional | §5.4 ① | 최근 방 목록에 **진행중/종료 배지·인원·내 순위 없음** — `RecentRoom` 타입에 필드 부재 | `services.ts:30-34` | 95% |

### Minor (17)

| # | 축 | 갭 | 성격 |
|---|---|---|---|
| M1 | Contract | 에러코드 4종 추가(`SPECIES_NOT_FOUND` 등). 설계 8종은 상태코드까지 100% 일치 | 확장 |
| M2 | Contract | `uaLabel`이 body가 아니라 `X-Ua-Label` 헤더 | 표기 |
| M3 | Contract | 설계 SQL에 `member.has_device` 누락 — **구현이 옳음(설계 문서 버그)** | 문서 오류 |
| M4 | Structural | `bootstrap.ts` → `main.tsx`+`services.ts` 분산. 주석은 여전히 bootstrap 참조 | 이동 |
| M5 | Structural | `seed.ts` 위치 이동(사유 문서화). 단 **호출처 0 — dead code** | 미사용 |
| M6 | Structural | `schema.sql`→`schema.ts`, `manifest.json`→`.webmanifest`, `icons/`→플랫 SVG | 대체(문서화) |
| M7 | Structural | `ProxyBanner` 별도 컴포넌트 없음 — `ProxyBoard`에 인라인 (기능 완비) | 인라인화 |
| M8 | Functional | 순위 배지·막대 색이 "ink 20%" 아님(12%/30%). `--ink-20` 토큰 부재 | 토큰 |
| M9 | Functional | 통계 헤더 색종이(confetti) 없음 | 장식 |
| M10 | Functional | 어종 추가 "추천 칩"이 칩이 아니라 리스트 행 (상위 6개 로직은 정확) | 표현 |
| M11 | Functional | 대리입력 스낵바 "화면에도 알림이 떠요" 문구 누락 | 문구 |
| M12 | Functional | `ConnectionPill`이 ⑦ ProxyBoard 헤더에 없음 (④⑧은 정상) | 배치 |
| M13 | Structural | ESLint 수단 변경(`no-restricted-imports`). **의도는 더 강하게 달성** | 개선 |
| M14 | Contract | `__COOLDOWN_MS__` 빌드타임 주입이 **정의만 되고 소비처 0** — 도메인은 하드코딩 | 미사용 |
| M15 | Functional | 시드 수량 미달: Member 4(설계 5), voided 1(설계 5) | 데이터 |
| M16 | Functional | ②③ 무인도 일러스트 없음 — 하늘 그라디언트만 (①은 정상) | 장식 |
| M17 | Functional | L2 시나리오 17/18 — 통계 화면 체크리스트 테스트 미작성 | 테스트 |

---

## 6. 화면별 Functional 점수

| 화면 | 점수 | 주 감점 |
|---|:---:|---|
| ① 홈 | 92% | 최근 방 메타 부재 (I10) |
| ② 방 생성 완료 | 70% | **QR 부재 (I3)**, 무인도 일러스트 |
| ③ 입장 | 94% | 무인도 일러스트 |
| ④ 조과 화면 | 96% | 대기 배지 (I7) |
| ⑤ 방 정보 시트 | 82% | 접속 점 하드코딩(I1), 기기 수(I2), QR(I3), 복사 토스트(I8) |
| ⑥ 통계 | 83% | 대리입력 표시(I9), 색종이 |
| ⑦ 대리 입력 | 90% | ConnectionPill 부재, 문구 |
| ⑧ **전체 순위** | **55%** | **FLIP 미구현(C1)**, 공동순위 비가시(I4), 색 토큰 |
| ⑨ 어종 추가 시트 | 89% | 추천 칩 표현 |
| ⑩ 연결 상태 | 100% | — |

---

## 7. 확인된 강점

- **Option B 채택 근거가 코드로 성립**: `applyMessage()`를 서버(`room-do.ts`)와 클라이언트(`roomStore.ts`)가 동일하게 호출하고 Repository만 교체. `tests/worker/equivalence.spec.ts`가 메모리 구현과 실제 DO SQLite의 결과 일치를 검증
- **오프라인 내성이 설계대로 완전 구현**: Outbox → flush → ack 제거 → §2.2.3 rebase 체인이 그대로 존재하며 L3 #3·#4로 고정
- **FR-26 역할 검사가 UI와 서버 양쪽** 모두 구현 (`RankList.tsx` + `guards.ts`)
- TODO/FIXME/목데이터 **0건**. 디자인 토큰 Design Anchor와 100% 일치
- 설계 §8의 테스트 시나리오를 **전부 초과 충족** (§8.2 20개, §8.3 17개, §8.5 10개)

---

## 8. 우선 수정 순서

| 순위 | 항목 | 이유 |
|:---:|---|---|
| 1 | **I1 + I2** 접속 점·기기 수 배선 | 지금은 **항상 틀린 값을 보여준다.** 서버는 이미 보내고 있고 `toRoomState()`가 버리는 구조 문제라 한 곳 고치면 둘 다 해결 |
| 2 | **C2** FR-08 전송 경로 + UI | UseCase·테스트는 이미 완성. `removeCard` WS 메시지 추가 + `codec`/`applyMessage` 배선 + `SpeciesCard` 진입점만 붙이면 됨 |
| 3 | **C1** FLIP 애니메이션 | 유일한 완전 미구현 FR. DoD 위반의 직접 원인 |
| 4 | **I4** 공동 순위 가시화 | 한 줄 수정. 동점 공동순위는 확정 사항인데 보이지 않으면 규칙 자체가 전달되지 않음 |
| 5 | I7·I8·I9·I10 | 각 1~2 파일 수준 |

> I3(QR)은 2026-09-21에 **보류로 결정된 항목**이므로 수정 대상이 아니라 설계 문서 갱신 대상이다.
> M3(설계 SQL의 `has_device` 누락)와 M13(ESLint 수단)은 **설계 문서를 코드에 맞춰 고쳐야** 한다.

---

## 9. 다음 단계

- Match Rate 93.6%는 `/pdca report` 기준(90%)을 넘지만, **Plan DoD 미충족**이 남아 있다
- 자동 수정 대상: C1, C2, I1, I2, I4, I7~I10
- **사람 손이 필요한 항목**: M4 필드 테스트(실제 낚시터, 비행기 모드 왕복) — 자동화 불가
- 설계 문서 갱신 대상: I3(QR 보류), I5·I6(응답 shape), M3(스키마), M4·M6(파일 위치), M13(ESLint)

---

## 10. Act 1회차 수정 결과 (2026-09-21)

Checkpoint 5에서 "Critical + 틀린 값 먼저"를 선택해 5건을 수정하고, 설계 문서를 코드에 맞춰 갱신했다.

### 10.1 수정 내역

| 갭 | 조치 | 회귀 테스트 |
|---|---|---|
| **C1** FLIP 애니메이션 | `RankList`에 `useLayoutEffect` 기반 FLIP 구현 (이전 위치 측정 → 되돌림 → 250ms 전환). `prefers-reduced-motion`은 전역 CSS가 처리 | — (시각 효과) |
| **C2** FR-08 도달 불가 | `removeCard` WS 메시지 신설 → `codec` → `applyMessage` → `RoomSession` → **어종 추가 시트에 "내 카드 관리" 섹션**. 0마리는 삭제, 기록 있으면 숨기기 | L1 4건, L2 #18 |
| **I1** 접속 점 하드코딩 | `RoomStore.memberMeta` 신설 — 스냅샷의 `MemberDto.online`을 도메인 축약 전에 보존 | L2 #19 |
| **I2** 기기 수 미표시 | `MemberRow`에 `deviceCount` prop 추가, 2대 이상일 때 배지 | L2 #19 |
| **I4** 공동 순위 비가시 | `sr-only` → 실제 보이는 "공동" 배지. `--ink-20` 토큰 추가로 §5.4 ⑧ 색상도 일치 | L2 #20 |

### 10.2 수정 중 발견된 추가 결함 1건

**접속자 변화가 브로드캐스트되지 않음.** I1을 고친 뒤 L2 #19가 "초록 점 1개"로 실패했다.
원인은 서버가 **연결 해제 시에만** `broadcastUpdate`를 호출하고 **새 접속 시에는 하지 않아**,
다른 참여자 화면의 초록 점이 영영 갱신되지 않는 것이었다.

조치: `UpdateMessage`에 `onlineMemberIds`를 추가하고 `handleUpgrade`에서도 브로드캐스트한다.
10명 규모라 배열 하나가 늘어도 비용이 없다. (Design §4.3 갱신 완료)

### 10.3 검증 환경 이슈 1건 (코드 무관)

L2/L3가 전부 타임아웃으로 실패해 앱이 깨진 줄 알았으나, 원인은 **좀비 `workerd` 프로세스가
구버전 자산 매니페스트를 붙들고 있던 것**이었다. `/assets/*.js`가 SPA 폴백으로 `text/html`을
반환해 모듈 로드가 실패했다. 프로세스를 정리하고 빌드→기동 순서를 지키자 31건 전부 통과했다.

> 교훈: `pnpm build`와 `wrangler dev`를 한 명령에 묶어 백그라운드로 보내면 경합이 난다.
> Windows에서는 `pkill`이 `workerd`를 잡지 못하므로 PowerShell로 정리해야 한다.

### 10.4 수정 후 지표

```
pnpm typecheck   0 errors
pnpm lint        0 errors
pnpm test        188 passed   (L0 143 / L1 45)
pnpm test:e2e     31 passed   (L2 20 / L3 11)
                 ─────────────
                 219 passed / 0 failed   (수정 전 212 → +7)
pnpm test:cov    Lines 84.9%  Branch 85.8%
```

**재산정 Match Rate**

| 축 | 수정 전 | 수정 후 | 변화 |
|---|:---:|:---:|---|
| Structural | 95% | 95% | QrCard는 보류 결정이라 유지 |
| Functional | 88% | **96%** | C1·C2·I1·I2·I4 해소, ⑧ 55%→95%, ⑤ 82%→95% |
| Contract | 92% | **98%** | `removeCard`·`onlineMemberIds` 프로토콜 정합, 설계 문서 갱신으로 드리프트 해소 |
| Runtime | 98% | **100%** | L2 시나리오 18/18 충족 |

```
Overall = 95×0.15 + 96×0.25 + 98×0.25 + 100×0.35 = 97.0%
```

### 10.5 설계 문서 갱신 (v0.2)

코드가 아니라 **문서를 고쳐야 했던** 항목:

| 항목 | 조치 |
|---|---|
| §3.3 스키마 `member.has_device` 누락 | 추가 — §3.1 엔티티와의 모순 해소 (구현이 옳았다) |
| §4.3 `removeCard` 부재 | 프로토콜에 추가 |
| §4.3 `update` 필드 | `roomStatus`·`onlineMemberIds` 반영, 없던 `lastEventId` 제거 |
| §4.2 `GET /rooms/:code` 응답 | 실제 nested 구조로 정정 |
| §5.4 ②⑤ QR 카드 | **2026-09-21 보류** 명시 (취소선) |
| §5.4 ⑨ | **카드 관리 진입점 추가** — 설계 초안에 FR-08의 UI가 빠져 있었다 |
| §9.3 ESLint 수단 | `no-restricted-imports` 정규식으로 변경한 사유 기재 |
| §11.1 파일 구조 | `schema.ts`, `seed.ts` 위치, `services.ts` 등 실제값 반영 |

### 10.6 잔여 갭

| 항목 | 성격 | 처리 |
|---|---|---|
| **M4 필드 테스트** | Plan DoD — 실제 낚시터, 비행기 모드 왕복 | **사람 손 필요. 자동화 불가** |
| QR 카드 (I3) | 2026-09-21 보류 결정 | 설계 문서에 보류로 명시 완료 |
| 결과 카드 공유 (US-09) | Plan에서 P1로 범위 외 | 버튼 비활성 유지 |
| README 배포 절차 | DoD #8 | 미작성 |
| Lighthouse 측정 | Quality Criteria | 미측정 |
| Minor 잔여 (I5~I10, M1~M17 중 일부) | 장식·문구·표현 | 보류 |

---

## Version History

| Version | Date | Changes | Author |
|---|---|---|---|
| 0.1 | 2026-09-21 | 최초 분석. 독립 gap-detector 검증 + 직접 재확인. 오판정 1건 제외 | tawool |
| 0.2 | 2026-09-21 | Act 1회차: Critical 3 + Important 2 수정, 추가 결함 1건(접속 브로드캐스트) 발견·수정, 설계 문서 v0.2 갱신. Match Rate 93.6% → 97.0% | tawool |
