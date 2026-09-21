import './TabBar.css';

export type Tab = 'catch' | 'rank' | 'stats';

const TABS: { key: Tab; label: string }[] = [
  { key: 'catch', label: '조과' },
  { key: 'rank', label: '순위' },
  { key: 'stats', label: '통계' },
];

/** 하단 탭바 (Design §5.4 ④) */
export function TabBar({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav class="tabs" aria-label="화면 전환">
      {TABS.map((tab) => (
        <button
          type="button"
          key={tab.key}
          class={`tabs__item ${active === tab.key ? 'tabs__item--active' : ''}`}
          onClick={() => {
            onChange(tab.key);
          }}
          aria-current={active === tab.key ? 'page' : undefined}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
