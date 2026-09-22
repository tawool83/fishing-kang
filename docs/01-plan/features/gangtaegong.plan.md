# 강태공(gangtaegong) 기획 계획서

> **Summary**: 지인끼리 낚시 갈 때 초대코드로 방에 모여, 어종 카드를 탭해 조과를 기록하고 금·은·동 순위를 실시간으로 겨루는 설치 없는 모바일 웹.
>
> **Project**: fishing-kang (강태공)
> **Version**: v0.1 (Plan)
> **Author**: tawool
> **Date**: 2026-09-21
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 같이 낚시 가면 "누가 몇 마리 잡았냐"가 가장 큰 재미인데, 기억이나 단톡방 메시지로 세다 보니 금방 흐려지고 끝나고 나면 정리가 안 된다. |
| **Solution** | 회원가입 없이 6자리 초대코드로 입장하는 방 단위 웹. 어종 카드 +1/−1로 조과를 기록하고, 방 Durable Object가 모든 참여자에게 순위를 실시간 브로드캐스트한다. 출조 종료 후 통계로 결과를 남긴다. |
| **Function/UX Effect** | 탭 한 번이 1초 안에 모두의 포디움에 반영된다. 전파가 약한 선상·갯바위에서도 탭이 대기열에 쌓였다가 자동 전송되어 유실되지 않는다. 손이 젖었거나 폰이 없는 사람은 방장이 대신 입력해 준다. |
| **Core Value** | **출조가 끝나도 남는, 실시간 경쟁의 재미.** 설치·가입·조작방지 없이 링크 하나로 시작해서 통계 화면으로 마무리된다. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 조과 집계가 기억·단톡방에 흩어져 실시간 경쟁 재미와 사후 기록이 모두 사라진다. |
| **WHO** | 함께 출조하는 지인 그룹 2~15명. 앱 설치·가입을 꺼리고, 한 달에 한두 번 쓰는 비개발자 사용자. 방을 주도하는 **방장 1명** + 일반 참여자. |
| **RISK** | 낚시터 통신 불량으로 탭이 증발하면 서비스 신뢰가 즉시 무너진다. 그 다음이 iOS 저장소 삭제로 인한 신원 유실. |
| **SUCCESS** | 필드 테스트(지인 2~3명, 실제 낚시터)에서 비행기 모드 on/off 왕복 후 **조과 유실 0건·중복 0건**, 온라인 상태 포디움 반영 1초 이내, Cloudflare 월 비용 0원. |
| **SCOPE** | M1 뼈대(Worker+DO+WS+스키마+방 생성/입장) → M2 메인 화면(포디움·카드·쿨다운·대기열·대리입력) → M3 통계·종료/재개·PWA → M4 필드 테스트. 1인 저녁 작업 기준 약 2주(순수 4~5일). |

---

## 1. Overview

### 1.1 Purpose

한 번의 출조 동안 참여자들의 조과를 **실시간으로 집계·순위화**하고, 출조가 끝나면 **통계로 남기는** 웹 서비스를 만든다.
목표는 업무용 정확성이 아니라 **함께 낚시하는 동안의 경쟁 재미**다. 따라서 조작 방지(사진 인증 등)는 명시적으로 범위에서 제외한다.

### 1.2 Background

- 조과 집계는 지금 "기억 + 단톡방 메시지"로 이뤄진다 → 중간에 흐려지고, 끝나고 정리가 안 된다.
- 실시간으로 순위가 보이면 경쟁 재미가 생기고, 종료 후 결과를 남길 수 있다.
- 사용 빈도가 낮고(월 1~2회) 인원이 적어(방당 2~15명), **설치·가입 요구가 곧 이탈**이다 → 웹 + 초대코드/QR로 확정.
- 인프라는 무료 플랜 안에서 끝나야 한다(월 0원) → Cloudflare Workers + Durable Objects.

### 1.3 Related Documents

- 기획 원문(Notion): [🎣 낚시 조과 결과 및 랭킹](https://app.notion.com/p/3e27ef63522980f59b02dfca3777acc5) — v0.1 기획 초안
- 디자인 초안(Notion): [🎨 강태공 모바일 웹 디자인 초안 v0.2](https://app.notion.com/p/3e27ef63522981eea087d92787e3b89b)
- 디자인 캔버스: [강태공 모바일 웹 초안](https://claude.ai/artifact/4acajiyND8wRCmFfMCmbtk) — 아트보드 6개
  (`Main` 홈 / `Created` 방 생성 완료 / `Join` 초대코드 입장 / `Catch` 조과 화면(인터랙티브) / `Proxy` 방장 대리 입력 / `Stats` 종료 후 통계)

---

## 2. Scope

### 2.1 In Scope (MVP — F1~F6 전부, 2026-09-21 확정)

- [ ] **F1 방 만들기 / 입장** — 누구나 방 생성 → 6자리 초대코드 + 링크 + QR. 코드 + 이름으로 입장. 기기 ID 자동 재입장, 실패 시 이름 선택 복구
- [ ] **F2 어종 카드 카운팅** — 내 어종 카드 추가 → 카드별 +1 / −1 / 되돌리기, +1은 사람 단위 10초 쿨다운
- [ ] **F3 실시간 포디움** — 금·은·동 + 전체 순위, 동점 공동 순위, 탭 시 전원 화면 즉시 갱신
- [ ] **F4 낚시 종료 & 통계** — 방장이 종료 → 입력 잠금 → 통계 화면. 진행 중에도 통계 열람 가능
- [ ] **F5 통신 불안정 대응** — 오프라인에서도 탭 기록, 재연결 시 자동 전송, 멱등키로 중복 방지
- [ ] **F6 방장 대리 입력** — 방장이 다른 참여자의 카드를 열어 대신 +1 / −1 / 어종 추가, 폰 없는 참여자 등록
- [ ] PWA 매니페스트 + 서비스 워커(앱 셸 캐싱). 설치 유도는 하지 않음
- [ ] 방 페이지 `noindex`, 개인정보 안내 문구 1줄

### 2.2 Out of Scope

- **조작 방지 일체** (사진 인증, 서버측 쿨다운 강제, PIN) — 확정 제외
- **회원가입 / 로그인 / 계정** — 없음
- **방장 넘기기(권한 위임)** — 2026-09-21 결정, MVP 제외. 필요 시 P1 재검토
- 결과 카드 이미지 저장 / 공유 (US-09, **P1**)
- 화면 꺼짐 방지(Wake Lock) 토글 (P1)
- 사이즈(cm) 기록 → "최대어" 랭킹 (P2)
- 사진 첨부 (P2, R2), 지난 출조 기록 모아보기 / 개인 누적 통계 (P2), 팀전 (P2)
- 카드 드래그 정렬 (P2), 기기 시각 차이 보정 (P2)
- 네이티브 앱 (iOS/Android)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | 근거 US | Priority | Status |
|----|-------------|---------|----------|--------|
| FR-01 | 방 이름 + 내 이름으로 방 생성 시 헷갈리는 문자(0·O·1·I) 제외 6자리 초대코드와 링크·QR을 발급하고, 생성자를 방장으로 지정한다 | US-01 | High | Pending |
| FR-02 | 초대코드 6자리(대문자 자동 변환) 또는 링크·QR로 입장 화면에 진입하고, 방 이름·참여자 목록을 표시한다. 없는 코드는 "방을 찾을 수 없음" | US-02 | High | Pending |
| FR-03 | 기기 ID가 이미 해당 방 멤버면 이름 입력 없이 조과 화면으로 직행한다 | US-02 | High | Pending |
| FR-04 | 처음 보는 기기에서 기존 이름을 선택하면 그 멤버에 기기를 추가 연결한다. 해당 이름이 다른 기기에서 접속 중이면 확인창을 띄운다 (실수 방지용, 인증 아님) | US-02 | High | Pending |
| FR-05 | 카톡 인앱 브라우저를 감지하면 "외부 브라우저로 열기" 안내를 노출한다 | US-02 | High | Pending |
| FR-06 | 방 안 이름 중복을 금지한다 (공백 제거·대소문자 무시) | US-02 | High | Pending |
| FR-07 | 어종 카드를 추가할 수 있고, 방 단위 어종 사전에서 자동완성 추천 + 동일 이름은 같은 어종으로 연결한다 (표기 분열 방지) | US-03 | High | Pending |
| FR-08 | 0마리인 카드만 삭제 가능하고, 기록이 있는 카드는 숨기기만 가능하다 | US-03 | Medium | Pending |
| FR-09 | + 탭 시 낙관적 업데이트로 즉시 반영 후 서버 전송한다 | US-04 | High | Pending |
| FR-10 | +1 후 10초간 **내 모든** + 버튼을 비활성화하고 남은 초를 원형 게이지로 표시한다 (쿨다운은 사람 단위, 어종 무관) | US-04 | High | Pending |
| FR-11 | − 탭 시 해당 어종의 가장 최근 유효 건 1건을 취소한다. **쿨다운 없음**, 0마리면 비활성 (음수 불가) | US-05 | High | Pending |
| FR-12 | +1/−1 직후 5초간 되돌리기 스낵바를 표시한다 (+1 되돌리기 = 취소, −1 되돌리기 = 복원) | US-05 | High | Pending |
| FR-13 | 취소된 +1이 쿨다운 기준이었으면 쿨다운을 즉시 해제한다 (기준 = 취소되지 않은 가장 최근 +1) | US-05 | High | Pending |
| FR-14 | 상단 고정 금·은·동 포디움(이름 + 마릿수)을 표시하고, 동점은 공동 순위(`RANK()`)로 처리한다. 0마리는 메달 없음 | US-06 | High | Pending |
| FR-15 | 펼치기로 4위 이하 전체 순위를 표시하고, 순위 변동 시 짧은 추월 애니메이션을 준다 | US-06 | Medium | Pending |
| FR-16 | 다른 참여자 화면의 포디움·순위가 온라인 기준 1초 이내 갱신된다 | US-04/06 | High | Pending |
| FR-17 | 방장만 낚시 종료/재개를 할 수 있고, 종료 시 전원 화면이 통계로 전환되며 모든 입력이 잠긴다 | US-07 | High | Pending |
| FR-18 | 종료된 방 링크는 통계를 계속 열람할 수 있고, 진행 중에도 누구나 통계 탭을 볼 수 있다 | US-07 | High | Pending |
| FR-19 | 전송 실패·오프라인 시 이벤트를 로컬 대기열에 저장하고, 재연결 시 자동 전송하며 멱등키로 중복 반영을 막는다 | US-04/08 | High | Pending |
| FR-20 | 상단에 연결 상태(연결됨 / 재연결 중 / 오프라인 · 대기 N건)를 표시하고 지수 백오프(최대 30초)로 자동 재연결한다 | US-08 | High | Pending |
| FR-21 | 방장은 순위·참여자 목록에서 사람을 탭해 **"OOO 대신 입력 중" 모드**(다른 배경색 + 배너)로 진입한다 | US-10 | High | Pending |
| FR-22 | 대리 모드에서 +1 / −1 / 되돌리기 / 어종 카드 추가가 가능하고, +1 쿨다운은 **대상자 기준**으로 적용된다 | US-10 | High | Pending |
| FR-23 | 대리 입력 시 대상자 화면에 "방장이 우럭 +1 했어요" 스낵바를 띄우고, 대상자도 되돌릴 수 있다 | US-10 | Medium | Pending |
| FR-24 | 방장은 방 정보 시트에서 폰 없는 참여자를 이름만으로 추가할 수 있고, 그 멤버도 순위·통계에 동일하게 포함된다 | US-10 | High | Pending |
| FR-25 | 모든 이벤트에 실제 입력자(`entered_by`)를 기록하고, 통계에서 대리 입력 건을 작게 표시한다 | US-10 | Medium | Pending |
| FR-26 | 일반 참여자에게는 대리 입력 진입점이 보이지 않고, **서버도 방장이 아닌 `forMemberId` 요청을 거부**한다 (역할 구분 목적) | US-10 | High | Pending |
| FR-27 | 통계 화면: 요약 4칸(총 조과/참여 인원/어종 수/출조 시간), 최종 포디움, 사람별·어종별 막대, 사람×어종 매트릭스, 30분 단위 시간대 막대, 누적 추이 | §7 | High | Pending |
| FR-28 | 통계 하이라이트: 첫 수 / 마지막 수 / 피크 타임 / 최다 어종 / 가장 다양한 어종 / 최단 간격 연속 조과 / 최다 역전 | §7 | Medium | Pending |
| FR-29 | 첫 접속 시 서버가 랜덤 UUID 기기 ID를 발급해 HttpOnly 퍼스트파티 쿠키 + localStorage + IndexedDB에 3중 저장하고, 하나라도 살아있으면 나머지를 복구한다 | §3-5 | High | Pending |
| FR-30 | ~~방 데이터는 마지막 활동 후 **7일** 뒤 DO alarm으로 자동 삭제한다~~ → FR-33으로 대체 (2026-09-22) | §9 | Medium | Superseded |
| FR-31 | 낚시는 **최대 3일**. 방 생성 후 3일이 되면 DO alarm이 자동으로 종료시키고, 아무도 누르지 않았음을 화면에 알린다 | §9 | High | Pending |
| FR-32 | 종료(자동·수동 무관) 후 **24시간** 안에는 방장이 재개해 정정할 수 있다. 지나면 재개 불가 — 서버가 `ROOM_ARCHIVED`로 거부한다. 단 3일 상한을 넘겼으면 처음부터 재개할 수 없다 | §9 | High | Pending |
| FR-33 | 종료 후 **7일**까지는 모든 참여자가 접속해 결과를 볼 수 있고(읽기 전용), 그 뒤 DO alarm이 방 데이터를 전부 삭제한다 | §9 | High | Pending |
| FR-34 | 금·은·동 **구성이 바뀌면** 딸랑딸랑 종소리를 울린다. 마릿수만 벌어지는 건 울리지 않는다. 방 정보 시트에서 끄고 켤 수 있고 선택은 기기에 저장된다 | §7 | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 실시간성 | 온라인 상태에서 탭 → 타인 화면 포디움 반영 **1초 이내** | 2대 기기 동시 접속 수동 측정 / L3 E2E |
| 초기 로딩 | 3G급 회선에서 첫 화면 인터랙티브 **3초 이내**. JS 번들 gzip **150KB 이하** 목표 | Lighthouse(모바일, throttling) + `vite build` 번들 리포트 |
| 오프라인 내성 | 비행기 모드 중 탭한 이벤트 **유실 0건 / 중복 0건**, 재연결 후 자동 반영 | 비행기 모드 on/off 왕복 시나리오 (M4 필드 테스트 + L3) |
| 조작성 | + 버튼 **최소 64px**, 모든 터치 영역 **44px 이상**, − 버튼은 카드 구석에 작게 분리 | 디자인 캔버스 대조 + 실기기 장갑 착용 테스트 |
| 접근성 | 텍스트 대비 4.5:1 (24px+ 3:1), 아이콘 버튼 `aria-label`, 실제 `<button>`/`<a>` 사용 | axe DevTools + 수동 점검 |
| 비용 | Cloudflare **무료 플랜 내 월 0원** 유지 (DO 요청 10만/일, 실행 13,000 GB-s/일, SQLite 쓰기 10만 행/일) | Cloudflare 대시보드 사용량 확인 |
| 동시성 | 한 방 최대 15명 동시 WebSocket, 전체 순위 통째 브로드캐스트로 충분 | 부하 계산 + 다중 탭 테스트 |
| 개인정보 | 수집 = 방 안 이름 + 랜덤 기기 ID + 기기 표시용 요약(UA 라벨). **핑거프린트 미사용**, 방 데이터 7일 후 자동 삭제 | 코드 리뷰 체크리스트 + 안내 문구 확인 |
| 보안(역할) | 타인 앞으로 온 입력은 서버가 방장 여부를 검증 후에만 수락 | L1 API 테스트 (비방장 `forMemberId` → 거부) |
| 검색 노출 | 방 페이지 `noindex` | 응답 헤더 / 메타태그 확인 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01 ~ FR-34 전부 구현 (FR-30은 FR-33으로 대체)
- [ ] 6개 화면이 디자인 캔버스(`Main`/`Created`/`Join`/`Catch`/`Proxy`/`Stats`)와 일치 — 컬러 토큰·타이포·버튼 크기 포함
- [ ] 아직 디자인이 없는 화면(⑤ 방 정보 시트, 전체 순위 펼침, 오프라인 상태 표시, 어종 추가 시트) 설계 단계에서 확정
- [ ] 핵심 로직 단위 테스트: 쿨다운 판정, −1 대상 선택, 공동 순위 집계, 멱등 처리
- [ ] L1 API 테스트: 방 생성/입장/claim/stats + 비방장 대리입력 거부
- [ ] L3 E2E: 방 생성 → 2인 입장 → +1/−1/되돌리기 → 포디움 갱신 → 종료 → 통계
- [ ] **M4 필드 테스트 통과** — 지인 2~3명과 실제 낚시터, 비행기 모드 왕복 후 조과 유실 0건
- [ ] 코드 리뷰 완료, README 배포 절차 작성

### 4.2 Quality Criteria

- [ ] 핵심 도메인 로직(쿨다운·순위·멱등) 테스트 커버리지 80% 이상
- [ ] Lint 에러 0, `tsc --noEmit` 통과
- [ ] `wrangler deploy` 빌드 성공, 무료 플랜 사용량 한도의 20% 이내
- [ ] Lighthouse 모바일 Performance 90+ / Accessibility 90+

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 낚시터 통신 불량으로 탭 유실 | High | High | 앱 셸 캐싱 + localStorage 이벤트 대기열 + 클라이언트 생성 UUID 멱등키(`INSERT OR IGNORE`). **M4 필드 테스트에서 반드시 검증** |
| iOS 사파리가 스크립트 저장소를 삭제 → 신원 유실 | High | Medium | 서버 발급 HttpOnly 퍼스트파티 쿠키 + localStorage + IndexedDB 3중 저장, 실패 시 이름 선택 복구(PIN 없음) |
| 카톡 인앱 브라우저 ↔ 사파리 저장소 분리 (한국에서 가장 흔한 케이스) | Medium | High | 인앱 브라우저 감지 → 외부 브라우저 열기 안내. 그래도 끊기면 이름 선택 1회 |
| 방장이 대리 입력 모드인 걸 잊고 남의 계정에 입력 | Medium | Medium | 배경색 변경 + 상단 배너 + 경고 줄무늬 + "내 화면으로" 버튼, 대상자에게 스낵바 알림 |
| 대리 입력과 본인 입력의 중복 카운트 | Medium | Medium | 쿨다운을 **대상자 기준**으로 적용해 자연스럽게 차단 |
| 어종 표기 분열(우럭/조피볼락)로 통계 깨짐 | Medium | Medium | 방 단위 어종 사전 + 자동완성 + 공백 제거·대소문자 무시 중복 판정 |
| 폰 기기 시각 차이로 시간대 통계 왜곡 | Low | Medium | `caught_at`(클라이언트) / `received_at`(서버) 둘 다 저장. 통계용이므로 허용, 큰 차이는 P2에서 보정 |
| 젖은 손·장갑 오터치 | Medium | High | + 버튼 64px 풀폭, − 버튼은 카드 구석 작은 원형, 5초 되돌리기 스낵바 |
| DO 무료 플랜 한도 초과 | Low | Low | 탭 1회 ≈ 11건, 10명·500마리여도 약 6,000건(한도의 6%). Hibernation으로 대기 중 과금 ≈ 0 |
| 배터리 소모 | Medium | Medium | 화면 상시 점등을 설계상 요구하지 않음. WebSocket 자체 소모는 작음. Wake Lock은 P1 선택 토글 |
| 미설계 화면(방 정보 시트 등) 때문에 구현이 막힘 | Medium | High | Design 단계 진입 전 4개 미설계 화면을 우선 확정 (§9 Next Steps) |

---

## 6. Impact Analysis

> 신규 프로젝트다. 현재 리포지토리(`fishing-kang`)는 **커밋 0개의 빈 상태**이며, 기존 코드·DB·API 소비자가 없다.
> 따라서 기존 기능을 깨뜨리는 변경은 존재하지 않는다.

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| 전체 리포지토리 | Project scaffold | Vite + TS + Preact 프론트 + Cloudflare Worker/DO 백엔드 신규 생성 |
| `room` / `member` / `member_device` / `species` / `member_species` / `catch_event` | DB Schema (DO SQLite) | 신규 생성 |
| `/api/*` | API | 신규 생성 |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| — | — | 기존 소비자 없음 (신규 프로젝트) | None |

### 6.3 Verification

- [x] 기존 소비자 없음을 확인 (`git log` 커밋 0개, 소스 파일 없음)
- [x] 인증·권한 변경으로 깨질 기존 동작 없음
- [x] 필드 추가·삭제로 깨질 기존 쿼리 없음

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | 단순 구조 | 정적 사이트 | ☐ |
| **Dynamic** | 기능 단위 모듈 + 백엔드 연동 | 백엔드 있는 웹앱, MVP | ☑ |
| **Enterprise** | 엄격한 레이어 분리, DI, 마이크로서비스 | 대규모 트래픽 | ☐ |

**Dynamic 선택 이유**: 백엔드(Worker + DO)가 있고 실시간 동기화가 핵심이지만, 화면 6개·테이블 6개 규모라 Enterprise의 레이어 분리는 과하다.
단, **BaaS(bkend.ai)는 사용하지 않는다** — 방 단위로 상태가 완결되는 구조라 Durable Object 한 개로 상태·동기화·브로드캐스트가 모두 해결되고, 무료 플랜 상시 가동 요건을 만족하기 때문이다.

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 프론트 프레임워크 | React / Preact / Svelte / Flutter Web | **Vite + TS + Preact** | 화면 6개짜리라 번들 크기가 최우선. 낚시터 약전파에서 첫 로딩이 빨라야 함 |
| 호스팅 | Vercel / Netlify / Cloudflare Workers | **Cloudflare Workers (Static Assets)** | 정적 파일 + API + DO를 한 번에 배포, 정적 요청 무료 |
| 실시간 / 상태 | Supabase Realtime / 자체 Socket 서버 / Durable Objects | **Durable Objects + WS Hibernation** | 방 1개 = DO 1개로 상태·동기화·브로드캐스트를 한 곳에서 처리. **Supabase 무료는 1주 미사용 시 자동 일시정지 → 월 1~2회 쓰는 서비스에 치명적이라 탈락** |
| DB | D1 / KV / DO 내장 SQLite | **DO 내장 SQLite** | 데이터가 방 단위로 완결됨. KV는 무료 쓰기 1,000건/일이라 카운팅에 부적합 |
| 상태 관리 | Context / Zustand / Signals | **Preact Signals** (설계 단계 최종 확정) | 서버 스냅샷 + 로컬 낙관적 상태의 병합이 잦음. 번들도 작음 |
| API 클라이언트 | fetch / axios | **fetch** (+ 자체 WS 클라이언트) | 의존성 최소화 |
| 폼 처리 | react-hook-form / native | **native** | 입력 필드가 이름·방 이름·코드 6칸뿐 |
| 스타일링 | Tailwind / CSS Modules / styled-components | **CSS Modules + CSS 변수** | 디자인 토큰(§7.4)을 CSS 변수로 고정. 런타임 비용 0 |
| 일러스트/아이콘 | 이미지 파일 / 인라인 SVG | **인라인 SVG** | 이미지 요청 없이 첫 로딩 경량화 (디자인 문서 확정 사항) |
| 테스트 | Jest / Vitest + Playwright | **Vitest(단위) + Playwright(E2E)** | Vite 기본 통합. DO 로직은 `@cloudflare/vitest-pool-workers` 검토 |
| 백엔드 | BaaS(bkend.ai) / Custom Server / Serverless | **Serverless (Workers + DO)** | 위 실시간/상태 결정과 동일 근거 |
| 인증 | 세션 / JWT / 없음 | **없음** | 재미용, 조작 방지 미고려 (확정) |
| 쿨다운 강제 위치 | 서버 / 클라이언트 | **클라이언트** | 서버가 도착 시각으로 검증하면 오프라인 대기열 일괄 전송 시 정상 입력이 거부된다. 서버는 멱등 처리와 **역할 검사(방장 여부)만** 담당 |
| 도메인 | — | **fish.allegru.dev** (확정) | 기존 도메인의 서브도메인 활용 |
| 데이터 보관 | 90일 / 7일 | **마지막 활동 후 7일** (2026-09-21 확정) | 출조 직후 공유가 끝나면 가치가 급감. 개인정보 보관 최소화 |

### 7.3 Clean Architecture Approach

```
Selected Level: Dynamic (BaaS 미사용 / Workers + DO 백엔드)

Folder Structure Preview:
┌─────────────────────────────────────────────────────┐
│ src/client/                                         │
│   components/    포디움, 어종 카드, 스낵바, 연결상태 │
│   features/      room / catch / ranking / stats /   │
│                  proxy(대리입력) / offline(대기열)   │
│   lib/           ws-client.ts, device-id.ts,        │
│                  queue.ts, api.ts                   │
│   styles/        tokens.css (§7.4 디자인 토큰)       │
│   pages/         Home, Created, Join, Catch,        │
│                  Proxy, Stats                       │
├─────────────────────────────────────────────────────┤
│ src/worker/                                         │
│   index.ts       라우팅 + 정적 자산 + DO 프록시      │
│   room-do.ts     Durable Object (WS Hibernation)    │
│   schema.sql     기획서 §6-4 스키마                  │
│   protocol.ts    WS 메시지 타입 (클라와 공유)        │
├─────────────────────────────────────────────────────┤
│ src/shared/      types, ranking.ts, cooldown.ts     │
│                  (순수 함수 → 단위 테스트 대상)      │
├─────────────────────────────────────────────────────┤
│ public/          manifest.json, sw.js, 아이콘        │
│ tests/           unit/, e2e/                        │
│ wrangler.toml                                       │
└─────────────────────────────────────────────────────┘
```

### 7.4 디자인 토큰 (디자인 초안 v0.2 확정)

| 역할 | 값 | 쓰임 |
|---|---|---|
| 하늘 | `#9ED9F0` | 헤더·히어로 배경 |
| 바다 | `#2BA9C4` / `#22A0BB` / `#1A8DA8` | 수평선 아래, 파도 레이어 |
| 모래(바탕) | `#F7F2E7` | 페이지 기본 배경 |
| 잉크 | `#0B2A3C` | 본문·제목, 포디움 외곽선, 스낵바 |
| 부표 주황 | `#C43E18` | 주요 버튼 (+1, 방 만들기, 입장) |
| 금 / 은 / 동 | `#E2A523` / `#B8C3CA` / `#C07A3C` | 포디움 블록, 순위 막대 |
| 청새치 | `#245C99` / `#1A4677` | 히어로 일러스트 |
| 대리 입력 모드 | 배경 `#FBE7C6` + 배너 `#7A3A0C` | 방장 대리 입력 화면 전용 |
| 어종 아이콘 | 우럭 `#4E5E66` / 광어 `#8A6A48` / 노래미 `#5E7A3A` / 쥐치 `#2F6F8A` | 동일 실루엣 + 색 구분 |

- 제목·숫자: **Black Han Sans** / 본문: **IBM Plex Sans KR** (400/500/700), 둘 다 Google Fonts
- 기준 폭 **390px** 모바일 웹. 일러스트·아이콘은 전부 인라인 SVG (이모지 미사용)

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [ ] `CLAUDE.md` 코딩 컨벤션 섹션 — **없음**
- [ ] `docs/01-plan/conventions.md` — **없음**
- [ ] `CONVENTIONS.md` — **없음**
- [ ] ESLint 설정 — **없음**
- [ ] Prettier 설정 — **없음**
- [ ] `tsconfig.json` — **없음**

> 빈 리포지토리다. 아래 항목을 M1 시작 전에 모두 새로 정의한다.

### 8.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| **네이밍** | missing | 컴포넌트 PascalCase, 훅/유틸 camelCase, DB 컬럼 snake_case, WS 메시지는 `t` 필드 소문자 | High |
| **폴더 구조** | missing | §7.3 구조 고정. `shared/`는 브라우저·Worker 양쪽에서 import 가능한 순수 코드만 | High |
| **Import 순서** | missing | 외부 → `@shared` → `@client`/`@worker` → 상대경로 → 스타일 | Medium |
| **환경 변수** | missing | §8.3. Worker는 `wrangler.toml` vars/secret, 클라이언트는 `VITE_` 접두사 | Medium |
| **에러 처리** | missing | HTTP API는 `{ data }` / `{ error: { code, message } }` 고정. WS는 에러 응답 대신 `ack` 미수신으로 대기열 유지 | High |
| **TypeScript** | missing | `strict: true`, `noUncheckedIndexedAccess`, WS 프로토콜은 discriminated union | High |
| **시각 단위** | missing | 모든 시각은 **epoch ms 정수**. `caught_at`=클라이언트, `received_at`=서버 | High |
| **멱등키** | missing | 모든 변경 요청은 클라이언트 생성 UUID를 동반 (`id` / `actionId`) | High |
| **커밋** | missing | Conventional Commits (`feat:`, `fix:`, `chore:`) | Low |

### 8.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `ROOM_DO` | Durable Object 바인딩 (`wrangler.toml`) | Worker | ☑ |
| `APP_ORIGIN` | 초대 링크·QR 생성 기준 오리진 (`https://fish.allegru.dev`) | Worker | ☑ |
| `ROOM_TTL_DAYS` | 방 데이터 자동 삭제 기간 (기본 `7`) | Worker | ☑ |
| `COOLDOWN_MS` | +1 쿨다운 (기본 `10000`) | Shared | ☑ |
| `VITE_WS_PATH` | WebSocket 경로 (기본 `/api/rooms/:code/ws`) | Client | ☐ |

> 인증이 없으므로 `AUTH_SECRET`·`DATABASE_URL` 류는 불필요하다.

### 8.4 Pipeline Integration

| Phase | Status | Document Location | Command |
|-------|:------:|-------------------|---------|
| Phase 1 (Schema) | ☑ 기획서 §6-4에 SQL 확정 → 문서로 이관 필요 | `docs/01-plan/schema.md` | `/pipeline-next` |
| Phase 2 (Convention) | ☐ §8.2를 문서화 필요 | `docs/01-plan/conventions.md` | `/pipeline-next` |

---

## 9. Next Steps

1. [ ] **미설계 화면 4종 확정** (Design 단계 진입 전 선행) — ⑤ 방 정보 시트 / 전체 순위 펼침(방장 대리입력 진입점) / 오프라인·재연결·대기 N건 상태 표시 / 어종 추가 시트(자동완성)
2. [ ] `docs/01-plan/schema.md`, `docs/01-plan/conventions.md` 작성
3. [ ] 설계 문서 작성 — `/pdca design gangtaegong`
4. [ ] M1~M4 마일스톤에 맞춘 세션 분할 (Design §11 Session Guide)
5. [ ] 구현 시작 — `/pdca do gangtaegong --scope module-1`

### 마일스톤 (1인 저녁 작업 기준 약 2주, 순수 4~5일)

| ID | 내용 | 관련 FR |
|----|------|---------|
| **M1 뼈대** | Worker + DO + WebSocket Hibernation, SQLite 스키마, 기기 ID 발급, 방 생성/입장 API | FR-01~06, FR-29 |
| **M2 메인 화면** | 포디움, 어종 카드, +1/−1/되돌리기, 쿨다운, 연결 상태·대기열, 방장 대리 입력 | FR-07~16, FR-19~26 |
| **M3 통계** | 종료/재개, 통계 화면(표·차트·하이라이트), PWA 매니페스트·서비스 워커, 7일 자동 삭제 | FR-17, FR-18, FR-27, FR-28, FR-30 |
| **M5 수명·소리** | 3일 자동 종료, 24시간 정정 창, 종료 후 7일 열람 후 삭제, 순위 변동 종소리 | FR-31~34 |
| **M4 필드 테스트** | 지인 2~3명과 실제 낚시터 실전. 비행기 모드 on/off로 대기열 검증 | 전체 |

---

## 10. Open Issues (2026-09-21 기준)

| 이슈 | 상태 |
|---|---|
| 서비스 이름 → **강태공** | ✅ 확정 |
| 형태 → **웹** (앱 아님) | ✅ 확정 |
| 쿨다운 범위 → **사람(접속자) 단위**, 어종 무관 | ✅ 확정 |
| 동점 처리 → **공동 순위** | ✅ 확정 |
| 종료 권한 → **방장만** | ✅ 확정 |
| 방장 대리 입력 → **포함** (쿨다운은 대상자 기준) | ✅ 확정 |
| 이름 선택 복구 PIN → **없음**, 접속 중인 이름 선택 시 확인창만 | ✅ 확정 |
| −1 쿨다운 → **없음** | ✅ 확정 (2026-09-21) |
| 방장 넘기기 → **MVP 제외** | ✅ 확정 (2026-09-21) |
| 도메인 → **fish.allegru.dev** | ✅ 확정 (2026-09-21) |
| 방 데이터 보관 → **마지막 활동 후 7일** (기획서 90일 제안에서 변경) | ✅ 확정 (2026-09-21) |
| 미설계 화면 4종 (방 정보 시트 / 전체 순위 펼침 / 오프라인 상태 / 어종 추가 시트) | ⏳ Design 단계에서 확정 |
| 상태 관리 라이브러리(Preact Signals) 최종 확정 | ⏳ Design 단계 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-09-21 | Notion 기획서 v0.1 + 디자인 초안 v0.2 + 디자인 캔버스 기반 최초 작성. 오픈 이슈 4건 확정 반영 | tawool |
