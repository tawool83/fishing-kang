import { SELF } from 'cloudflare:test';
import type { ServerMessage } from '@application/dto/ws-messages';

const ORIGIN = 'https://fish.allegru.dev';

/**
 * 열린 소켓 레지스트리.
 *
 * 테스트가 소켓을 열어둔 채 끝나면 DO가 계속 살아 있어서
 * vitest-pool-workers의 격리 스토리지 정리가 실패한다
 * ("Failed to pop isolated storage stack frame").
 * afterEach에서 `closeAllSockets()`를 부르는 것이 규칙이다.
 */
const openSockets: TestSocket[] = [];

export async function closeAllSockets(): Promise<void> {
  for (const s of openSockets.splice(0)) s.close();
  // DO가 webSocketClose 처리를 마칠 틈을 준다
  await new Promise((r) => setTimeout(r, 50));
}

/**
 * 쿠키를 들고 다니는 테스트 클라이언트.
 *
 * 기기 ID가 `__Host-dev_id` 쿠키로 오가므로, 한 사람의 여러 요청이
 * 같은 기기로 인식되려면 쿠키를 유지해야 한다 (Plan FR-29).
 * 쿠키를 새로 만들면 "다른 폰"이 된다 — 이름 선택 복구 시나리오에 쓴다.
 */
export class TestClient {
  private cookie: string | null = null;

  constructor(readonly userAgent = 'Mozilla/5.0 (iPhone) Safari/605.1') {}

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('User-Agent', this.userAgent);
    if (this.cookie !== null) headers.set('Cookie', this.cookie);
    if (init.body !== undefined) headers.set('Content-Type', 'application/json');

    const response = await SELF.fetch(`${ORIGIN}${path}`, { ...init, headers });

    const setCookie = response.headers.get('Set-Cookie');
    if (setCookie !== null) {
      const first = setCookie.split(';')[0];
      if (first !== undefined) this.cookie = first;
    }
    return response;
  }

  async json<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
    const response = await this.fetch(path, init);
    const body = (await response.json()) as T;
    return { status: response.status, body };
  }

  async post<T>(path: string, payload: unknown): Promise<{ status: number; body: T }> {
    return this.json<T>(path, { method: 'POST', body: JSON.stringify(payload) });
  }

  /** 쿠키를 버려 "새 기기"로 만든다 */
  forgetDevice(): void {
    this.cookie = null;
  }

  async connect(code: string): Promise<TestSocket> {
    const response = await this.fetch(`/api/rooms/${code}/ws`, {
      headers: { Upgrade: 'websocket' },
    });
    if (response.webSocket === null) {
      throw new Error(`websocket upgrade failed: ${String(response.status)}`);
    }
    const socket = new TestSocket(response.webSocket);
    openSockets.push(socket);
    return socket;
  }
}

/** 수신 메시지를 모아두고 조건에 맞는 것을 기다릴 수 있는 WS 래퍼 */
export class TestSocket {
  readonly received: ServerMessage[] = [];
  private readonly waiters: Array<{
    match: (m: ServerMessage) => boolean;
    resolve: (m: ServerMessage) => void;
  }> = [];

  constructor(private readonly ws: WebSocket) {
    ws.accept();
    ws.addEventListener('message', (event: MessageEvent) => {
      const data = typeof event.data === 'string' ? event.data : '';
      const message = JSON.parse(data) as ServerMessage;
      this.received.push(message);

      for (let i = this.waiters.length - 1; i >= 0; i -= 1) {
        const w = this.waiters[i];
        if (w !== undefined && w.match(message)) {
          this.waiters.splice(i, 1);
          w.resolve(message);
        }
      }
    });
  }

  send(message: unknown): void {
    this.ws.send(JSON.stringify(message));
  }

  /** 조건에 맞는 메시지를 기다린다. 이미 받은 것 중에 있으면 즉시 반환 */
  next<T extends ServerMessage>(
    match: (m: ServerMessage) => boolean,
    timeoutMs = 3000
  ): Promise<T> {
    const already = this.received.find(match);
    if (already !== undefined) return Promise.resolve(already as T);

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('timed out waiting for message'));
      }, timeoutMs);

      this.waiters.push({
        match,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as T);
        },
      });
    });
  }

  ofType<T extends ServerMessage>(t: ServerMessage['t'], timeoutMs = 3000): Promise<T> {
    return this.next<T>((m) => m.t === t, timeoutMs);
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // 이미 닫힌 경우 무시
    }
  }
}

export interface CreatedRoom {
  code: string;
  memberId: string;
  isHost: boolean;
  shareUrl: string;
}

/** 방을 만들고 방장 클라이언트를 돌려준다 */
export async function createRoom(
  client = new TestClient(),
  roomName = '9월 27일 태안 선상',
  displayName = '홍길동'
): Promise<{ client: TestClient; room: CreatedRoom }> {
  const { status, body } = await client.post<{ data: CreatedRoom }>('/api/rooms', {
    roomName,
    displayName,
  });
  if (status !== 201) throw new Error(`createRoom failed: ${String(status)}`);
  return { client, room: body.data };
}
