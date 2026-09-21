/**
 * Design Ref: §10.4 — 모든 시각은 epoch ms 정수다.
 * Date 객체는 화면에 찍기 직전에만 만든다. DB 컬럼도 INTEGER.
 *
 * 이유: 오프라인 대기열이 직렬화되어 localStorage를 왕복하고,
 * 클라이언트 예측과 서버 확정이 같은 값으로 비교돼야 하기 때문이다.
 */
export type Millis = number;

/** 30분 — 시간대별 통계 버킷 기본 단위 (Design §3.4) */
export const HALF_HOUR_MS = 1_800_000;
