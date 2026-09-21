/**
 * 어종 아이콘 (Design "Design Anchor").
 *
 * **같은 물고기 실루엣에 색만 다르게** 한다. 어종마다 다른 그림을 그리면
 * 어종이 늘 때마다 그림이 필요해지고, 사용자는 어차피 이름으로 구분한다.
 *
 * 디자인 초안이 지정한 4색을 이름 해시로 순환 배정한다.
 */
const PALETTE = [
  'var(--fish-rock)', // 우럭
  'var(--fish-flat)', // 광어
  'var(--fish-gree)', // 노래미
  'var(--fish-file)', // 쥐치
];

export function fishColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return PALETTE[hash % PALETTE.length] ?? PALETTE[0]!;
}

export function FishIcon({ name, size = 28 }: { name: string; size?: number }) {
  const color = fishColor(name);
  return (
    <svg viewBox="0 0 40 24" width={size} height={(size * 24) / 40} aria-hidden="true">
      <path
        d="M11 12 q6 -9 17 -8 q7 1 10 8 q-3 7 -10 8 q-11 1 -17 -8z"
        fill={color}
      />
      <path d="M11 12 q-6 -5 -9 -8 q1 8 0 16 q3 -3 9 -8z" fill={color} opacity="0.75" />
      <circle cx="30" cy="10" r="1.8" fill="#fff" />
    </svg>
  );
}
