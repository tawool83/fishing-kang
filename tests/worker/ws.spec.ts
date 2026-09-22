import { describe, it, expect, afterEach } from 'vitest';
import type {
  AckMessage,
  ErrorMessage,
  ProxiedMessage,
  SnapshotMessage,
  UpdateMessage,
} from '@application/dto/ws-messages';
import { env, runInDurableObject } from 'cloudflare:test';
import { SqliteRoomRepository } from '@infrastructure/worker/SqliteRoomRepository';
import { TestClient, closeAllSockets, createRoom } from './helpers';

afterEach(closeAllSockets);

const T = 1_790_000_000_000;

/**
 * Design §8.3 L1 — WebSocket 프로토콜 (Hibernation).
 *
 * 여기서 잡으려는 것은 도메인 규칙이 아니라 **배선**이다:
 * 멱등 처리, 방장 역할 검사, 종료 잠금, 브로드캐스트, 대리 입력 알림.
 */
describe('WebSocket', () => {
  async function room2() {
    const { client: host, room } = await createRoom();

    const guest = new TestClient('Mozilla/5.0 (Linux; Android) Chrome/120');
    const joined = await guest.post<{ data: { memberId: string } }>(
      `/api/rooms/${room.code}/join`,
      { displayName: '철수' }
    );

    const hostWs = await host.connect(room.code);
    const guestWs = await guest.connect(room.code);
    hostWs.send({ t: 'hello' });
    guestWs.send({ t: 'hello' });
    await hostWs.ofType('snapshot');
    await guestWs.ofType('snapshot');

    return {
      room,
      hostWs,
      guestWs,
      hostId: room.memberId,
      guestId: joined.body.data.memberId,
    };
  }

  async function addSpecies(
    ws: Awaited<ReturnType<typeof room2>>['hostWs'],
    id: string,
    name: string
  ): Promise<string> {
    ws.send({ t: 'addSpecies', id, name });
    await ws.next<AckMessage>((m) => m.t === 'ack' && m.id === id);
    const snap = ws.received.find((m): m is SnapshotMessage => m.t === 'snapshot');
    void snap;
    return id;
  }

  it('#16 hello를 보내면 스냅샷이 온다', async () => {
    const { client, room } = await createRoom();
    const ws = await client.connect(room.code);

    ws.send({ t: 'hello' });
    const snapshot = await ws.ofType<SnapshotMessage>('snapshot');

    expect(snapshot.myMemberId).toBe(room.memberId);
    expect(snapshot.snapshot.room.code).toBe(room.code);
    expect(snapshot.snapshot.members).toHaveLength(1);
    expect(snapshot.snapshot.events).toEqual([]);
    ws.close();
  });

  it('#11 같은 id로 catch를 두 번 보내도 조과는 1건이다 (멱등)', async () => {
    const { hostWs, room } = await room2();
    const client = new TestClient();
    await addSpecies(hostWs, 'sp-1', '우럭');

    const payload = { t: 'catch', id: 'evt-1', speciesId: 'sp-1', at: T };
    hostWs.send(payload);
    await hostWs.next<AckMessage>((m) => m.t === 'ack' && m.id === 'evt-1');
    hostWs.send(payload);

    // 두 번째도 ack는 오지만 상태는 그대로여야 한다
    await new Promise((r) => setTimeout(r, 150));
    const { body } = await client.json<{ data: { summary: { totalCatch: number } } }>(
      `/api/rooms/${room.code}/stats`
    );

    expect(body.data.summary.totalCatch).toBe(1);
    hostWs.close();
  });

  it('탭하면 다른 참여자 화면에도 순위가 브로드캐스트된다 (FR-16)', async () => {
    const { hostWs, guestWs, hostId } = await room2();
    await addSpecies(hostWs, 'sp-1', '우럭');

    hostWs.send({ t: 'catch', id: 'evt-1', speciesId: 'sp-1', at: T });

    const update = await guestWs.next<UpdateMessage>(
      (m) => m.t === 'update' && m.ranking.some((r) => r.memberId === hostId && r.total === 1)
    );

    expect(update.ranking.find((r) => r.memberId === hostId)?.medal).toBe('gold');
    hostWs.close();
    guestWs.close();
  });

  it('#12 일반 참여자가 forMemberId를 쓰면 거부된다 (FR-26)', async () => {
    const { hostWs, guestWs, hostId } = await room2();
    await addSpecies(hostWs, 'sp-1', '우럭');

    guestWs.send({ t: 'catch', id: 'evt-x', speciesId: 'sp-1', at: T, forMemberId: hostId });

    const error = await guestWs.next<ErrorMessage>((m) => m.t === 'error');
    expect(error.code).toBe('FORBIDDEN_PROXY');
    expect(error.refId).toBe('evt-x');

    hostWs.close();
    guestWs.close();
  });

  it('#13 방장이 대리 입력하면 대상자에게 proxied 알림이 간다 (FR-23)', async () => {
    const { hostWs, guestWs, guestId } = await room2();
    await addSpecies(hostWs, 'sp-1', '우럭');

    hostWs.send({ t: 'catch', id: 'evt-1', speciesId: 'sp-1', at: T, forMemberId: guestId });

    const proxied = await guestWs.ofType<ProxiedMessage>('proxied');
    expect(proxied).toMatchObject({ by: '홍길동', speciesName: '우럭', delta: 1 });
    expect(proxied.targetId).toBe('evt-1');

    // 조과의 주인은 철수다
    const update = await guestWs.next<UpdateMessage>(
      (m) => m.t === 'update' && m.ranking.some((r) => r.memberId === guestId && r.total === 1)
    );
    expect(update.ranking.find((r) => r.memberId === guestId)?.total).toBe(1);

    hostWs.close();
    guestWs.close();
  });

  it('#14 일반 참여자는 종료할 수 없다 (FR-17)', async () => {
    const { hostWs, guestWs } = await room2();

    guestWs.send({ t: 'end' });

    const error = await guestWs.next<ErrorMessage>((m) => m.t === 'error');
    expect(error.code).toBe('FORBIDDEN_PROXY');

    hostWs.close();
    guestWs.close();
  });

  it('#15 종료하면 모두에게 ended가 가고 입력이 잠긴다 (FR-17)', async () => {
    const { hostWs, guestWs } = await room2();
    await addSpecies(hostWs, 'sp-1', '우럭');

    hostWs.send({ t: 'end' });
    await guestWs.ofType('ended');

    hostWs.send({ t: 'catch', id: 'evt-after', speciesId: 'sp-1', at: T });
    const error = await hostWs.next<ErrorMessage>((m) => m.t === 'error');

    expect(error.code).toBe('ROOM_ENDED'); // 방장도 잠긴다

    hostWs.close();
    guestWs.close();
  });

  it('재개하면 다시 입력할 수 있다 (종료 → 재개 → 정정 흐름)', async () => {
    const { hostWs, guestWs } = await room2();
    await addSpecies(hostWs, 'sp-1', '우럭');

    hostWs.send({ t: 'end' });
    await hostWs.ofType('ended');
    hostWs.send({ t: 'resume' });
    await hostWs.ofType('resumed');

    hostWs.send({ t: 'catch', id: 'evt-fix', speciesId: 'sp-1', at: T });
    const ack = await hostWs.next<AckMessage>((m) => m.t === 'ack' && m.id === 'evt-fix');

    expect(ack.id).toBe('evt-fix');
    hostWs.close();
    guestWs.close();
  });

  it('정정 창(24h)이 지나면 재개가 거부된다 (FR-32)', async () => {
    const { hostWs, guestWs, room } = await room2();

    hostWs.send({ t: 'end' });
    await hostWs.ofType('ended');

    // 종료를 25시간 전으로 밀어 정정 창을 넘긴다
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(room.code));
    await runInDurableObject(stub, (_instance, state) => {
      new SqliteRoomRepository(state.storage.sql).setRoomStatus(
        'ended',
        Date.now() - 25 * 3_600_000
      );
    });

    hostWs.send({ t: 'resume' });
    const error = await hostWs.next<ErrorMessage>((m) => m.t === 'error');

    expect(error.code).toBe('ROOM_ARCHIVED');

    // 그래도 결과는 볼 수 있다 — 스냅샷은 정상으로 온다 (FR-33)
    guestWs.send({ t: 'hello' });
    const snapshot = await guestWs.ofType('snapshot');
    expect(snapshot.t).toBe('snapshot');

    hostWs.close();
    guestWs.close();
  });

  it('−1과 되돌리기가 동작한다', async () => {
    const { hostWs, room, hostId } = await room2();
    const client = new TestClient();
    await addSpecies(hostWs, 'sp-1', '우럭');

    hostWs.send({ t: 'catch', id: 'evt-1', speciesId: 'sp-1', at: T });
    await hostWs.next<AckMessage>((m) => m.t === 'ack' && m.id === 'evt-1');

    hostWs.send({ t: 'uncatch', actionId: 'act-1', speciesId: 'sp-1' });
    await hostWs.next<UpdateMessage>(
      (m) => m.t === 'update' && m.ranking.some((r) => r.memberId === hostId && r.total === 0)
    );

    hostWs.send({ t: 'restore', actionId: 'act-1' });
    await hostWs.next<UpdateMessage>(
      (m) => m.t === 'update' && m.ranking.some((r) => r.memberId === hostId && r.total === 1)
    );

    const { body } = await client.json<{ data: { summary: { totalCatch: number } } }>(
      `/api/rooms/${room.code}/stats`
    );
    expect(body.data.summary.totalCatch).toBe(1);
    hostWs.close();
  });

  it('방장이 폰 없는 참여자를 추가하면 순위에 나온다 (FR-24)', async () => {
    const { hostWs } = await room2();

    hostWs.send({ t: 'addMember', id: 'm-kid', name: '철수아들' });
    const update = await hostWs.next<UpdateMessage>(
      (m) => m.t === 'update' && m.ranking.some((r) => r.memberId === 'm-kid')
    );

    expect(update.ranking.find((r) => r.memberId === 'm-kid')?.total).toBe(0);
    hostWs.close();
  });

  it('잘못된 모양의 메시지는 BAD_MESSAGE로 응답한다', async () => {
    const { client, room } = await createRoom();
    const ws = await client.connect(room.code);

    ws.send({ t: 'catch', id: 'evt-1' }); // speciesId·at 누락
    const error = await ws.ofType<ErrorMessage>('error');

    expect(error.code).toBe('BAD_MESSAGE');
    ws.close();
  });

  it('없는 방에는 WebSocket 연결이 안 된다', async () => {
    const response = await new TestClient().fetch('/api/rooms/YYYYYY/ws', {
      headers: { Upgrade: 'websocket' },
    });

    expect(response.status).toBe(404);
  });
});

/**
 * Check 단계에서 발견된 갭 C2의 회귀 테스트.
 *
 * `RemoveCard` UseCase는 있었지만 WS 프로토콜에 메시지가 없어 **전송 경로 자체가
 * 없었다**(FR-08 도달 불가). 프로토콜 배선을 테스트로 고정한다.
 */
describe('FR-08 카드 삭제·숨기기 (갭 C2 회귀)', () => {
  async function roomWithCard() {
    const { client, room } = await createRoom();
    const ws = await client.connect(room.code);
    ws.send({ t: 'hello' });
    await ws.ofType('snapshot');

    ws.send({ t: 'addSpecies', id: 'sp-1', name: '우럭' });
    await ws.next<AckMessage>((m) => m.t === 'ack' && m.id === 'sp-1');

    return { client, room, ws };
  }

  it('0마리 카드는 removeCard로 지워진다', async () => {
    const { client, room, ws } = await roomWithCard();

    ws.send({ t: 'removeCard', speciesId: 'sp-1' });
    await ws.next<AckMessage>((m) => m.t === 'ack' && m.id === 'remove:self:sp-1');

    // 카드는 사라져도 어종 사전에는 남는다 — 다른 사람이 쓰고 있을 수 있다.
    // NOTE: `next()`는 이미 받은 메시지부터 훑으므로, 최초 hello 스냅샷
    // (카드 0·어종 0)과 구분되도록 "어종 1 + 카드 0"으로 매처를 좁힌다.
    ws.send({ t: 'hello' });
    const snapshot = await ws.next<SnapshotMessage>(
      (m) => m.t === 'snapshot' && m.snapshot.species.length === 1 && m.snapshot.cards.length === 0
    );

    expect(snapshot.snapshot.cards).toHaveLength(0);
    expect(snapshot.snapshot.species).toHaveLength(1);

    void client;
    void room;
  });

  it('기록이 있는 카드는 removeCard가 거부된다', async () => {
    const { ws } = await roomWithCard();

    ws.send({ t: 'catch', id: 'evt-1', speciesId: 'sp-1', at: T });
    await ws.next<AckMessage>((m) => m.t === 'ack' && m.id === 'evt-1');

    ws.send({ t: 'removeCard', speciesId: 'sp-1' });
    const error = await ws.next<ErrorMessage>((m) => m.t === 'error');

    expect(error.code).toBe('CARD_NOT_EMPTY');
  });

  it('hideCard로 숨기고 다시 꺼낼 수 있다', async () => {
    const { ws } = await roomWithCard();

    ws.send({ t: 'hideCard', speciesId: 'sp-1', hidden: true });
    const hidden = await (async () => {
      await ws.next<AckMessage>((m) => m.t === 'ack' && m.id.startsWith('hide:'));
      ws.send({ t: 'hello' });
      return ws.next<SnapshotMessage>(
        (m) => m.t === 'snapshot' && (m.snapshot.cards[0]?.hidden ?? false)
      );
    })();
    expect(hidden.snapshot.cards[0]?.hidden).toBe(true);

    ws.send({ t: 'hideCard', speciesId: 'sp-1', hidden: false });
    const shown = await (async () => {
      ws.send({ t: 'hello' });
      return ws.next<SnapshotMessage>(
        (m) => m.t === 'snapshot' && m.snapshot.cards[0]?.hidden === false
      );
    })();
    expect(shown.snapshot.cards[0]?.hidden).toBe(false);
  });

  it('일반 참여자는 남의 카드를 지울 수 없다 (FR-26)', async () => {
    const { room, ws } = await roomWithCard();
    const guest = new TestClient('Mozilla/5.0 (Linux; Android) Chrome/120');
    await guest.post(`/api/rooms/${room.code}/join`, { displayName: '철수' });
    const guestWs = await guest.connect(room.code);
    guestWs.send({ t: 'hello' });
    const snap = await guestWs.ofType<SnapshotMessage>('snapshot');
    const hostId = snap.snapshot.room.hostMemberId;

    guestWs.send({ t: 'removeCard', speciesId: 'sp-1', forMemberId: hostId });
    const error = await guestWs.next<ErrorMessage>((m) => m.t === 'error');

    expect(error.code).toBe('FORBIDDEN_PROXY');
    void ws;
  });
});
