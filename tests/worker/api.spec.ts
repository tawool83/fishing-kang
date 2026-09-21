import { describe, it, expect, afterEach } from 'vitest';
import { isValidCode } from '@domain/rules/inviteCode';
import type { RoomInfoDto, StatsDto } from '@application/dto/responses';
import { TestClient, closeAllSockets, createRoom } from './helpers';

afterEach(closeAllSockets);

interface ErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

/**
 * Design §8.3 L1 — HTTP 엔드포인트.
 * 진짜 workerd + DO SQLite 위에서 돈다.
 */
describe('GET /api/device', () => {
  it('#1 쿠키가 없으면 새로 발급하고 Set-Cookie를 내린다', async () => {
    const client = new TestClient();
    const response = await client.fetch('/api/device');
    const body = (await response.json()) as { data: { deviceId: string; restored: boolean } };

    expect(response.status).toBe(200);
    expect(body.data.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.data.restored).toBe(false);

    const cookie = response.headers.get('Set-Cookie') ?? '';
    expect(cookie).toContain('__Host-dev_id=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('#2 백업 헤더를 보내면 그 값으로 쿠키를 복원한다 (FR-29)', async () => {
    const backup = '11111111-2222-3333-4444-555555555555';
    const response = await new TestClient().fetch('/api/device', {
      headers: { 'X-Device-Id-Backup': backup },
    });
    const body = (await response.json()) as { data: { deviceId: string; restored: boolean } };

    expect(body.data.deviceId).toBe(backup);
    expect(body.data.restored).toBe(true);
  });

  it('#2b UUID 형태가 아닌 백업값은 무시한다', async () => {
    const response = await new TestClient().fetch('/api/device', {
      headers: { 'X-Device-Id-Backup': 'not-a-uuid; injected=1' },
    });
    const body = (await response.json()) as { data: { deviceId: string; restored: boolean } };

    expect(body.data.restored).toBe(false);
  });

  it('쿠키가 이미 있으면 그대로 쓴다', async () => {
    const client = new TestClient();
    const first = (await client.json<{ data: { deviceId: string } }>('/api/device')).body;
    const second = (await client.json<{ data: { deviceId: string } }>('/api/device')).body;

    expect(second.data.deviceId).toBe(first.data.deviceId);
  });
});

describe('POST /api/rooms', () => {
  it('#3 방을 만들면 6자리 코드와 공유 URL이 온다 (FR-01)', async () => {
    const { room } = await createRoom();

    expect(isValidCode(room.code)).toBe(true);
    expect(room.isHost).toBe(true);
    expect(room.shareUrl).toBe(`https://fish.allegru.dev/r/${room.code}`);
  });

  it('#4 이름이 너무 길면 400', async () => {
    const { status, body } = await new TestClient().post<ErrorBody>('/api/rooms', {
      roomName: '태안 선상',
      displayName: '가'.repeat(13),
    });

    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.['field']).toBe('displayName');
  });
});

describe('GET /api/rooms/:code', () => {
  it('#5 방 정보와 참여자 목록이 온다', async () => {
    const { client, room } = await createRoom();
    const { status, body } = await client.json<{ data: RoomInfoDto }>(`/api/rooms/${room.code}`);

    expect(status).toBe(200);
    expect(body.data.room.name).toBe('9월 27일 태안 선상');
    expect(body.data.members).toHaveLength(1);
    expect(body.data.members[0]).toMatchObject({ displayName: '홍길동', isHost: true });
  });

  it('#5b 이 기기가 이미 멤버면 myMemberId가 온다 (FR-03)', async () => {
    const { client, room } = await createRoom();
    const { body } = await client.json<{ data: RoomInfoDto }>(`/api/rooms/${room.code}`);

    expect(body.data.myMemberId).toBe(room.memberId);
  });

  it('#5c 처음 보는 기기면 myMemberId가 null이다', async () => {
    const { room } = await createRoom();
    const { body } = await new TestClient().json<{ data: RoomInfoDto }>(`/api/rooms/${room.code}`);

    expect(body.data.myMemberId).toBeNull();
  });

  it('#6 없는 코드는 404', async () => {
    const { status, body } = await new TestClient().json<ErrorBody>('/api/rooms/ZZZZZZ');

    expect(status).toBe(404);
    expect(body.error.code).toBe('ROOM_NOT_FOUND');
  });

  it('#6b 코드 형식이 아니면 404 (대문자 변환 후 판정)', async () => {
    const { status } = await new TestClient().json<ErrorBody>('/api/rooms/ab');
    expect(status).toBe(404);
  });

  it('소문자로 입력해도 같은 방을 찾는다 (FR-02)', async () => {
    const { room } = await createRoom();
    const { status } = await new TestClient().json<{ data: RoomInfoDto }>(
      `/api/rooms/${room.code.toLowerCase()}`
    );

    expect(status).toBe(200);
  });
});

describe('POST /api/rooms/:code/join', () => {
  it('새 이름으로 참여하면 201', async () => {
    const { room } = await createRoom();
    const guest = new TestClient('Mozilla/5.0 (Linux; Android) Chrome/120');

    const { status, body } = await guest.post<{ data: { memberId: string; isHost: boolean } }>(
      `/api/rooms/${room.code}/join`,
      { displayName: '철수' }
    );

    expect(status).toBe(201);
    expect(body.data.isHost).toBe(false);
  });

  it('#7 중복 이름은 409 NAME_TAKEN', async () => {
    const { room } = await createRoom();
    const guest = new TestClient();

    const { status, body } = await guest.post<ErrorBody>(`/api/rooms/${room.code}/join`, {
      displayName: '홍 길동', // 정규화하면 "홍길동"과 같다
    });

    expect(status).toBe(409);
    expect(body.error.code).toBe('NAME_TAKEN');
  });

  it('연결된 기기 요약이 표시용으로만 저장된다 (핑거프린트 미사용)', async () => {
    const { client, room } = await createRoom();
    const guest = new TestClient('Mozilla/5.0 (Linux; Android) Chrome/120 KAKAOTALK');
    await guest.post(`/api/rooms/${room.code}/join`, { displayName: '철수' });

    const { body } = await client.json<{ data: RoomInfoDto }>(`/api/rooms/${room.code}`);
    const 철수 = body.data.members.find((m) => m.displayName === '철수');

    expect(철수?.deviceCount).toBe(1);
  });
});

describe('POST /api/rooms/:code/claim', () => {
  it('#9 새 기기에서 이름을 고르면 그 멤버에 연결된다 (FR-04)', async () => {
    const { client, room } = await createRoom();

    client.forgetDevice(); // 저장소가 날아간 상황
    const { status, body } = await client.post<{ data: { memberId: string; isHost: boolean } }>(
      `/api/rooms/${room.code}/claim`,
      { memberId: room.memberId, confirmedOnlineConflict: false }
    );

    expect(status).toBe(200);
    expect(body.data.memberId).toBe(room.memberId);
    expect(body.data.isHost).toBe(true); // 방장 권한이 따라온다
  });

  it('#8 접속 중인 이름을 고르면 409 MEMBER_ONLINE', async () => {
    const { client, room } = await createRoom();
    const socket = await client.connect(room.code);
    socket.send({ t: 'hello' });
    await socket.ofType('snapshot');

    const other = new TestClient();
    const { status, body } = await other.post<ErrorBody>(`/api/rooms/${room.code}/claim`, {
      memberId: room.memberId,
      confirmedOnlineConflict: false,
    });

    expect(status).toBe(409);
    expect(body.error.code).toBe('MEMBER_ONLINE');

    // 확인창을 통과하면 PIN 없이 연결된다 (확정: PIN 없음)
    const confirmed = await other.post<{ data: { memberId: string } }>(
      `/api/rooms/${room.code}/claim`,
      { memberId: room.memberId, confirmedOnlineConflict: true }
    );
    expect(confirmed.status).toBe(200);

    socket.close();
  });

  it('없는 멤버는 404', async () => {
    const { room } = await createRoom();
    const { status, body } = await new TestClient().post<ErrorBody>(
      `/api/rooms/${room.code}/claim`,
      { memberId: 'nobody', confirmedOnlineConflict: false }
    );

    expect(status).toBe(404);
    expect(body.error.code).toBe('MEMBER_NOT_FOUND');
  });
});

describe('GET /api/rooms/:code/stats', () => {
  it('#10 통계 JSON을 돌려준다', async () => {
    const { client, room } = await createRoom();
    const { status, body } = await client.json<{ data: StatsDto }>(
      `/api/rooms/${room.code}/stats`
    );

    expect(status).toBe(200);
    expect(body.data.summary.memberCount).toBe(1);
    expect(body.data.summary.totalCatch).toBe(0);
    expect(body.data.highlights.firstCatch).toBeNull();
    expect(body.data.ranking).toHaveLength(1);
  });

  it('없는 방의 통계는 404', async () => {
    const { status } = await new TestClient().json<ErrorBody>('/api/rooms/ZZZZZZ/stats');
    expect(status).toBe(404);
  });
});

describe('라우팅', () => {
  it('알 수 없는 API 경로는 404', async () => {
    const { status } = await new TestClient().json<ErrorBody>('/api/nope');
    expect(status).toBe(404);
  });

  it('허용되지 않은 메서드는 404', async () => {
    const { room } = await createRoom();
    const response = await new TestClient().fetch(`/api/rooms/${room.code}/join`, {
      method: 'DELETE',
    });
    expect(response.status).toBe(404);
  });
});
