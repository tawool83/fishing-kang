/**
 * 기기 ID 저장소 (Plan FR-29).
 *
 * Design Ref: §3.1 — 저장되는 값은 **서버가 발급한 랜덤 UUID**이며
 * 기기·브라우저 정보를 일절 담지 않는다. 핑거프린트를 쓰지 않는 이유는
 * `domain/entities/device.ts` 주석 참고.
 *
 * **비동기인 이유**: 3중 저장의 한 축이 IndexedDB다. 동기 포트로는 담을 수 없다.
 * 이 포트는 클라이언트 전용이고 UseCase가 쓰지 않으므로(기기 ID는 부트스트랩에서
 * 한 번 해석된다) `RoomRepository`의 동기 계약에는 영향이 없다.
 */
export interface DeviceIdStore {
  /** 살아있는 값을 찾아 돌려주고, 비어 있던 저장소를 다시 채운다 */
  read(): Promise<string | null>;
  write(deviceId: string): Promise<void>;
  clear(): Promise<void>;
}
