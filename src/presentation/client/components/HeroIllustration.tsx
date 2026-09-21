/**
 * 홈 히어로 일러스트 (디자인 초안 v0.2).
 *
 * 낮 하늘 + 구름 + 갈매기, 왼쪽 수평선에 야자수 무인도,
 * 오른쪽에 물보라와 함께 뛰어오르는 청새치, 아래 낚싯배와 밀짚모자 낚시꾼.
 *
 * Design Ref: "Design Anchor" — 전부 인라인 SVG다. 이미지 파일을 쓰면
 * 약한 전파에서 첫 로딩이 그만큼 느려진다.
 */
export function HeroIllustration({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      class="hero"
      viewBox="0 0 390 220"
      role="img"
      aria-label="바다에서 청새치가 뛰어오르고, 무인도 옆에서 낚시하는 그림"
      style={{ display: 'block', width: '100%', height: compact ? '140px' : 'auto' }}
      preserveAspectRatio="xMidYMax slice"
    >
      {/* 하늘 */}
      <rect width="390" height="220" fill="var(--sky)" />

      {/* 구름 */}
      <g fill="#fff" opacity="0.9">
        <ellipse cx="70" cy="40" rx="30" ry="14" />
        <ellipse cx="92" cy="34" rx="20" ry="12" />
        <ellipse cx="300" cy="30" rx="26" ry="12" />
        <ellipse cx="322" cy="26" rx="16" ry="9" />
      </g>

      {/* 갈매기 */}
      <g stroke="var(--ink)" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.75">
        <path d="M150 42 q7 -7 14 0 q7 -7 14 0" />
        <path d="M205 62 q5 -5 10 0 q5 -5 10 0" />
      </g>

      {/* 무인도 (왼쪽 수평선) */}
      <g>
        <ellipse cx="58" cy="132" rx="46" ry="12" fill="#efdcb4" />
        <path
          d="M52 132 q-2 -22 4 -32"
          stroke="#6b5a3a"
          stroke-width="4"
          fill="none"
          stroke-linecap="round"
        />
        <g fill="#4f7a34">
          <path d="M56 100 q-20 -8 -26 4 q16 -2 26 2z" />
          <path d="M56 100 q20 -8 26 4 q-16 -2 -26 2z" />
          <path d="M56 100 q-6 -20 6 -24 q2 16 -6 24z" />
        </g>
      </g>

      {/* 바다 */}
      <rect y="136" width="390" height="84" fill="var(--sea)" />
      <path d="M0 150 q30 -8 60 0 t60 0 t60 0 t60 0 t60 0 t90 0 v70 H0z" fill="var(--sea-2)" />
      <path d="M0 172 q40 -8 80 0 t80 0 t80 0 t80 0 t70 0 v48 H0z" fill="var(--sea-3)" />

      {/* 청새치 — 오른쪽에서 뛰어오른다 */}
      <g transform="translate(262 92) rotate(-24)">
        <path
          d="M0 28 q30 -26 74 -16 q-10 12 -2 20 q-8 10 -22 12 q-30 4 -50 -16z"
          fill="var(--marlin)"
        />
        {/* 긴 주둥이 */}
        <path d="M74 12 l34 -14 l-30 20z" fill="var(--marlin-2)" />
        {/* 등지느러미 */}
        <path d="M24 10 q14 -20 34 -14 q-16 6 -22 18z" fill="var(--marlin-2)" />
        {/* 꼬리 */}
        <path d="M0 28 q-16 -14 -22 -22 q18 6 26 12z" fill="var(--marlin-2)" />
        <path d="M0 28 q-18 8 -26 18 q20 -2 28 -10z" fill="var(--marlin-2)" />
        <circle cx="62" cy="14" r="3" fill="#fff" />
        <circle cx="62.5" cy="14" r="1.6" fill="var(--ink)" />
      </g>

      {/* 물보라 */}
      <g fill="#fff" opacity="0.85">
        <ellipse cx="246" cy="150" rx="26" ry="8" />
        <circle cx="228" cy="138" r="4" />
        <circle cx="268" cy="134" r="3" />
        <circle cx="252" cy="128" r="2.5" />
      </g>

      {/* 낚싯배 + 낚시꾼 */}
      <g transform="translate(96 156)">
        {/* 낚싯대와 줄 */}
        <path
          d="M40 -18 L82 -44"
          stroke="var(--ink)"
          stroke-width="2.5"
          stroke-linecap="round"
        />
        <path d="M82 -44 q10 16 6 34" stroke="var(--ink)" stroke-width="1.2" fill="none" />
        {/* 낚시꾼 */}
        <circle cx="30" cy="-30" r="8" fill="#f3d3a8" />
        <path d="M18 -32 q12 -10 24 0 q-12 4 -24 0z" fill="#e0c07a" />
        <path d="M22 -22 q8 -4 16 0 l4 22 H18z" fill="#2f6f8a" />
        {/* 배 */}
        <path d="M-10 0 h96 l-12 22 H2z" fill="#fff" />
        <path d="M-10 0 h96 l-3 6 H-7z" fill="var(--buoy)" />
      </g>
    </svg>
  );
}
