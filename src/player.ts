// The one audio output of the app (spec §4.4: only one sound at a time).
// A single shared <audio> element is reused so iOS keeps it unlocked after
// the first tap.

export type PlayResult = 'ended' | 'stopped' | 'failed';

const audio = new Audio();
let current: ((result: PlayResult) => void) | null = null;

/** Stops whatever is playing; its play() promise resolves with 'stopped'. */
export function stop(): void {
  const finish = current;
  if (!finish) return;
  audio.pause();
  finish('stopped');
}

/** Plays the URLs one after another. Resolves when done, stopped or failed. */
export function play(urls: string[]): Promise<PlayResult> {
  stop();
  return new Promise((resolve) => {
    let i = 0;
    const finish = (result: PlayResult): void => {
      if (current !== finish) return;
      current = null;
      audio.onended = null;
      audio.onerror = null;
      resolve(result);
    };
    const next = (): void => {
      if (current !== finish) return;
      if (i >= urls.length) return finish('ended');
      audio.src = urls[i++];
      audio.play().catch(() => finish('failed'));
    };
    current = finish;
    audio.onended = next;
    audio.onerror = () => finish('failed');
    next();
  });
}
