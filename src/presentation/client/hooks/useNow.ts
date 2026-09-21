import { useEffect, useState } from 'preact/hooks';

/**
 * 일정 간격으로 현재 시각을 갱신한다.
 *
 * 쿨다운 게이지가 매끄럽게 줄어들려면 화면이 주기적으로 다시 그려져야 한다.
 * 쿨다운은 `cooldownRemainingMs(events, member, now)`로 **파생**되므로,
 * 별도의 타이머 상태를 두지 않고 `now`만 흘려보내면 된다.
 */
export function useNow(intervalMs = 200): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const handle = globalThis.setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      globalThis.clearInterval(handle);
    };
  }, [intervalMs]);

  return now;
}
