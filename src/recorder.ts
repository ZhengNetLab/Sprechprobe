// Microphone recording of my lines (spec §4.4).
// Recordings live only in memory as object URLs: never stored, never uploaded.
// The browser picks the format (webm/opus on Android Chrome, mp4/aac on iOS);
// it is only played back on this device, so nothing is converted.

export interface Recording {
  url: string;
  /** Seconds, measured with the clock (webm files often report no duration). */
  duration: number;
}

export type RecorderErrorKind = 'unsupported' | 'denied' | 'failed';

export class RecorderError extends Error {
  kind: RecorderErrorKind;
  constructor(kind: RecorderErrorKind) {
    super(kind);
    this.kind = kind;
  }
}

/** Shorter than this counts as an accidental tap and is dropped. */
export const MIN_SECONDS = 0.4;
/** Keep the microphone open this long after a recording so the next starts instantly. */
const IDLE_RELEASE_MS = 30_000;

let stream: MediaStream | null = null;
let releaseTimer: number | undefined;
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let startedAt = 0;

export function isSupported(): boolean {
  return Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';
}

function pickMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t));
}

async function getStream(): Promise<MediaStream> {
  clearTimeout(releaseTimer);
  if (stream?.getAudioTracks().some((t) => t.readyState === 'live')) return stream;
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  return stream;
}

function scheduleRelease(): void {
  clearTimeout(releaseTimer);
  releaseTimer = window.setTimeout(release, IDLE_RELEASE_MS);
}

/** Closes the microphone (the browser's mic indicator goes off). */
export function release(): void {
  clearTimeout(releaseTimer);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

/** Starts recording. Asks for microphone permission the first time. */
export async function start(): Promise<void> {
  if (!isSupported()) throw new RecorderError('unsupported');
  cancel();
  let s: MediaStream;
  try {
    s = await getStream();
  } catch (e) {
    const name = (e as DOMException).name;
    throw new RecorderError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'failed');
  }
  const mimeType = pickMimeType();
  const r = new MediaRecorder(s, mimeType ? { mimeType } : undefined);
  chunks = [];
  r.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  r.start();
  recorder = r;
  startedAt = performance.now();
}

export function isRecording(): boolean {
  return recorder !== null;
}

/** Seconds since recording started. */
export function elapsed(): number {
  return recorder ? (performance.now() - startedAt) / 1000 : 0;
}

/** Stops and returns the recording, or null if it was too short. */
export function stop(): Promise<Recording | null> {
  const r = recorder;
  recorder = null;
  if (!r) return Promise.resolve(null);
  const duration = (performance.now() - startedAt) / 1000;
  return new Promise((resolve) => {
    r.onstop = () => {
      scheduleRelease();
      if (duration < MIN_SECONDS || chunks.length === 0) return resolve(null);
      const blob = new Blob(chunks, { type: r.mimeType || chunks[0].type });
      resolve({ url: URL.createObjectURL(blob), duration });
    };
    r.stop();
  });
}

/** Stops and throws the recording away. */
export function cancel(): void {
  const r = recorder;
  recorder = null;
  if (!r) return;
  r.onstop = scheduleRelease;
  r.stop();
}

// Leaving the app mid-recording discards it and closes the microphone.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancel();
    release();
  }
});
