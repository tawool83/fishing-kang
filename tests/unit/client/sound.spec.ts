import { describe, it, expect, vi } from 'vitest';
import { podium, rankTotals, podiumKey } from '@domain/rules/ranking';
import { MemoryKeyValue } from '@infrastructure/client/storage';
import { SoundStore } from '@presentation/client/view-models/soundStore';

/** BellSound 자리에 끼우는 가짜 — WebAudio 없이 "몇 번 울렸나"만 센다 */
function fakeBell() {
  return { ring: vi.fn(), unlock: vi.fn() };
}

function podiumOf(...totals: [string, number][]) {
  return podium(
    rankTotals(totals.map(([memberId, total]) => ({ memberId, displayName: memberId, total })))
  );
}

/**
 * Plan FR-34 — 금·은·동이 바뀔 때 딸랑딸랑.
 */
describe('순위 종소리', () => {
  it('첫 포디움은 소리 없이 기준점만 잡는다', () => {
    const bell = fakeBell();
    const store = new SoundStore(new MemoryKeyValue(), bell as never);

    store.onPodium(podiumOf(['a', 3], ['b', 1]));

    expect(bell.ring).not.toHaveBeenCalled();
  });

  it('추월이 일어나면 울린다', () => {
    const bell = fakeBell();
    const store = new SoundStore(new MemoryKeyValue(), bell as never);

    store.onPodium(podiumOf(['a', 3], ['b', 1]));
    store.onPodium(podiumOf(['a', 3], ['b', 5])); // b가 1등으로

    expect(bell.ring).toHaveBeenCalledTimes(1);
  });

  it('격차만 벌어지는 건 순위 변동이 아니다 — 조용하다', () => {
    const bell = fakeBell();
    const store = new SoundStore(new MemoryKeyValue(), bell as never);

    store.onPodium(podiumOf(['a', 3], ['b', 1]));
    store.onPodium(podiumOf(['a', 9], ['b', 1])); // 1등이 계속 잡았을 뿐

    expect(bell.ring).not.toHaveBeenCalled();
  });

  it('같은 포디움으로 여러 번 다시 그려도 한 번만 울린다', () => {
    const bell = fakeBell();
    const store = new SoundStore(new MemoryKeyValue(), bell as never);

    store.onPodium(podiumOf(['a', 3], ['b', 1]));
    store.onPodium(podiumOf(['a', 1], ['b', 3]));
    store.onPodium(podiumOf(['a', 1], ['b', 3]));
    store.onPodium(podiumOf(['a', 1], ['b', 3]));

    expect(bell.ring).toHaveBeenCalledTimes(1);
  });

  it('음소거면 울리지 않지만 기준점은 계속 따라간다', () => {
    const kv = new MemoryKeyValue();
    kv.set('gt.muted', '1');
    const bell = fakeBell();
    const store = new SoundStore(kv, bell as never);

    expect(store.muted.value).toBe(true);

    store.onPodium(podiumOf(['a', 3], ['b', 1]));
    store.onPodium(podiumOf(['a', 1], ['b', 3]));
    expect(bell.ring).not.toHaveBeenCalled();

    // 음소거를 풀면 확인음이 한 번 나고, 그 뒤 변동부터 다시 울린다
    store.toggleMute();
    expect(bell.ring).toHaveBeenCalledTimes(1);
    store.onPodium(podiumOf(['a', 5], ['b', 3]));
    expect(bell.ring).toHaveBeenCalledTimes(2);
  });

  it('음소거 선택은 기기에 남는다', () => {
    const kv = new MemoryKeyValue();
    new SoundStore(kv, fakeBell() as never).toggleMute();

    expect(kv.get('gt.muted')).toBe('1');
    expect(new SoundStore(kv, fakeBell() as never).muted.value).toBe(true);
  });

  it('방을 옮기면 기준점을 버린다 — 새 방의 첫 포디움은 울리지 않는다', () => {
    const bell = fakeBell();
    const store = new SoundStore(new MemoryKeyValue(), bell as never);

    store.onPodium(podiumOf(['a', 3]));
    store.reset();
    store.onPodium(podiumOf(['x', 7], ['y', 2]));

    expect(bell.ring).not.toHaveBeenCalled();
  });

  it('지문은 마릿수가 아니라 수상자로만 만들어진다', () => {
    expect(podiumKey(podiumOf(['a', 3], ['b', 1]))).toBe(
      podiumKey(podiumOf(['a', 30], ['b', 1]))
    );
    expect(podiumKey(podiumOf(['a', 3], ['b', 1]))).not.toBe(
      podiumKey(podiumOf(['a', 1], ['b', 3]))
    );
  });

  it('0마리뿐이면 메달이 없다 — 지문이 비어 있고 울리지 않는다', () => {
    const bell = fakeBell();
    const store = new SoundStore(new MemoryKeyValue(), bell as never);

    store.onPodium(podiumOf(['a', 0], ['b', 0]));
    store.onPodium(podiumOf(['a', 0], ['b', 0]));

    expect(bell.ring).not.toHaveBeenCalled();
  });
});
