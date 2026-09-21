import type { ClientMessage } from '@application/dto/ws-messages';

/**
 * WS 메시지 파싱·검증 (Design §4.3).
 *
 * 인증이 없으므로 여기서 하는 검증은 "보안"이 아니라 **형태 검사**다.
 * 잘못된 모양의 메시지가 UseCase까지 내려가 이상한 상태를 만들지 않게 막는다.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (value === null || typeof value !== 'object') return null;

  const m = value as Record<string, unknown>;
  const t = m['t'];
  if (typeof t !== 'string') return null;

  const id = () => (typeof m['id'] === 'string' && m['id'].length > 0 ? m['id'] : null);
  const actionId = () =>
    typeof m['actionId'] === 'string' && m['actionId'].length > 0 ? m['actionId'] : null;
  const speciesId = () =>
    typeof m['speciesId'] === 'string' && m['speciesId'].length > 0 ? m['speciesId'] : null;
  const name = () => (typeof m['name'] === 'string' ? m['name'] : null);
  const forMemberId = (): string | undefined =>
    typeof m['forMemberId'] === 'string' && m['forMemberId'].length > 0
      ? m['forMemberId']
      : undefined;

  switch (t) {
    case 'hello':
      return { t: 'hello' };

    case 'catch': {
      const i = id();
      const s = speciesId();
      const at = m['at'];
      if (i === null || s === null || typeof at !== 'number' || !Number.isFinite(at)) return null;
      return { t: 'catch', id: i, speciesId: s, at, ...optional('forMemberId', forMemberId()) };
    }

    case 'uncatch': {
      const a = actionId();
      const s = speciesId();
      if (a === null || s === null) return null;
      return {
        t: 'uncatch',
        actionId: a,
        speciesId: s,
        ...optional('forMemberId', forMemberId()),
      };
    }

    case 'undo': {
      const a = actionId();
      const target = m['targetId'];
      if (a === null || typeof target !== 'string' || target.length === 0) return null;
      return { t: 'undo', actionId: a, targetId: target };
    }

    case 'restore': {
      const a = actionId();
      if (a === null) return null;
      return { t: 'restore', actionId: a };
    }

    case 'addSpecies': {
      const i = id();
      const n = name();
      if (i === null || n === null) return null;
      return { t: 'addSpecies', id: i, name: n, ...optional('forMemberId', forMemberId()) };
    }

    case 'hideCard': {
      const s = speciesId();
      const hidden = m['hidden'];
      if (s === null || typeof hidden !== 'boolean') return null;
      return {
        t: 'hideCard',
        speciesId: s,
        hidden,
        ...optional('forMemberId', forMemberId()),
      };
    }

    case 'removeCard': {
      const sp = speciesId();
      if (sp === null) return null;
      return {
        t: 'removeCard',
        speciesId: sp,
        ...optional('forMemberId', forMemberId()),
      };
    }

    case 'end':
      return { t: 'end' };

    case 'resume':
      return { t: 'resume' };

    case 'addMember': {
      const i = id();
      const n = name();
      if (i === null || n === null) return null;
      return { t: 'addMember', id: i, name: n };
    }

    default:
      return null;
  }
}

/** `exactOptionalPropertyTypes` 없이도 undefined 키가 섞이지 않게 한다 */
function optional<K extends string, V>(key: K, value: V | undefined): Record<K, V> | object {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}
