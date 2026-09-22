/**
 * assets/bell-dinging-jam-fx-1-1-00-04.mp3 → public/bell.mp3 (앞 2초만)
 *
 *   node scripts/build-bell-audio.mjs
 *
 * 원본은 4.87초인데 종소리는 1.25초에 끝나고 나머지는 무음이다. 그 무음이
 * 파일의 60%를 차지했다. 모바일에서 받는 바이트를 줄이려고 앞 2초만 남긴다.
 *
 * **재인코딩하지 않는다.** MP3는 독립적인 프레임의 나열이라 프레임 경계에서
 * 자르면 무손실이고, 들리는 소리가 조금도 달라지지 않는다. (macOS의 afconvert는
 * MP3 디코딩만 되고 인코딩은 안 돼서, 어차피 재인코딩할 수단도 없다.)
 *
 * Xing/Info 헤더 프레임은 버린다 — 원본 전체 길이를 적어둔 표라서, 그대로 두면
 * 브라우저가 2초짜리 파일을 4.87초로 표시한다.
 *
 * 그 표에는 인코더 지연(priming)도 적혀 있어서, 버리고 나면 디코더가 앞의 1105샘플
 * (25ms)을 깎지 않는다. 파형을 대조해 보면 잘라낸 결과가 원본과 상대오차 0으로
 * 같고 25ms만 밀려 있다 — 종소리 앞에 25ms 정적이 붙는 셈이라 들리지 않는다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const SOURCE = fileURLToPath(
  new URL('../assets/bell-dinging-jam-fx-1-1-00-04.mp3', import.meta.url)
);
const OUT = fileURLToPath(new URL('../public/bell.mp3', import.meta.url));
const KEEP_SECONDS = 2;

/** MPEG1 Layer III 비트레이트 표 (kbps). 인덱스 0과 15는 쓰지 않는다 */
const BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const SAMPLE_RATES = [44100, 48000, 32000, 0];
const SAMPLES_PER_FRAME = 1152;

const src = readFileSync(SOURCE);

/** ID3v2 태그는 오디오가 아니다. 건너뛰고 결과에도 싣지 않는다 */
function audioStart(buf) {
  if (buf.toString('latin1', 0, 3) !== 'ID3') return 0;
  // 크기는 7비트씩 쓰는 syncsafe 정수다
  const size = (buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9];
  return 10 + size;
}

/** 프레임 하나를 읽는다. 헤더가 아니면 null */
function frameAt(buf, at) {
  if (at + 4 > buf.length) return null;
  if (buf[at] !== 0xff || (buf[at + 1] & 0xe0) !== 0xe0) return null;

  const version = (buf[at + 1] >> 3) & 0x03; // 3 = MPEG1
  const layer = (buf[at + 1] >> 1) & 0x03; // 1 = Layer III
  const bitrate = BITRATES[(buf[at + 2] >> 4) & 0x0f];
  const sampleRate = SAMPLE_RATES[(buf[at + 2] >> 2) & 0x03];
  const padding = (buf[at + 2] >> 1) & 0x01;

  if (version !== 3 || layer !== 1 || bitrate === 0 || sampleRate === 0) return null;

  const length = Math.floor((144000 * bitrate) / sampleRate) + padding;
  return { length, sampleRate, bitrate };
}

/**
 * Xing/Info(길이·VBR 표)를 담은 안내용 프레임인가.
 *
 * **첫 프레임만** 검사한다. 'Xing'/'Info' 네 글자는 압축된 오디오 바이트에서도
 * 우연히 나올 수 있어서, 스트림 전체를 뒤지면 멀쩡한 프레임을 버릴 위험이 있다.
 * 이 헤더는 규격상 언제나 첫 프레임이다.
 */
function isHeaderFrame(buf, at, length) {
  const tail = buf.toString('latin1', at + 4, at + length);
  return tail.includes('Xing') || tail.includes('Info');
}

const frames = [];
let cursor = audioStart(src);
let samples = 0;
let rate = 0;
let skippedHeader = 0;

while (cursor < src.length) {
  const frame = frameAt(src, cursor);
  if (frame === null) {
    cursor += 1; // 동기 이탈 — 다음 바이트부터 다시 찾는다
    continue;
  }

  // 안내용 헤더는 첫 프레임에만 있다 (isHeaderFrame 주석 참고)
  if (frames.length === 0 && skippedHeader === 0 && isHeaderFrame(src, cursor, frame.length)) {
    skippedHeader = 1;
    cursor += frame.length;
    continue;
  }

  rate = frame.sampleRate;
  if (samples + SAMPLES_PER_FRAME > KEEP_SECONDS * rate) break;

  frames.push(src.subarray(cursor, cursor + frame.length));
  samples += SAMPLES_PER_FRAME;
  cursor += frame.length;
}

const out = Buffer.concat(frames);
writeFileSync(OUT, out);

console.log(
  `${OUT}\n  ${String(frames.length)} frames · ${(samples / rate).toFixed(2)}s · ` +
    `${String(out.length)} bytes (원본 ${String(src.length)} bytes)` +
    `\n  Xing/Info 헤더 프레임 ${String(skippedHeader)}개 제거`
);
