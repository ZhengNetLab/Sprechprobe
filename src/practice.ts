// Practice page: one scene = one voice chat (spec §4).
//
// Flow of a scene (bottom bar per phase, §4.3):
//   other-speaking  the other side's message arrived and is playing
//   my-turn         [按住 说话] [直接看答案]
//   recorded        [按住 重录] [显示答案]     a new recording replaces my bubble
//   answer-shown    [继续]
//   rating          [重来] [吃力] [顺利]       → next scene, recordings cleared
//
// Hold to talk: press and hold records, release sends, slide up cancels (§4.4).
// The scene queue is a plain list for now; FSRS scheduling replaces it later.
import type { Line, Scene } from './scene.ts';
import { lineAudio } from './audio.ts';
import * as player from './player.ts';
import * as recorder from './recorder.ts';
import { onPress } from './press.ts';
import type { Settings } from './settings.ts';
import { button, h } from './dom.ts';

type Phase = 'other-speaking' | 'my-turn' | 'recorded' | 'answer-shown' | 'rating';
export type Rating = 'again' | 'hard' | 'good';

export interface PracticeOptions {
  scenes: Scene[];
  settings: Settings;
  onOpenSettings: () => void;
  onRate?: (scene: Scene, rating: Rating) => void;
}

export function mountPractice(root: HTMLElement, opts: PracticeOptions): void {
  const { settings } = opts;
  let queue = [...opts.scenes];
  let pos = 0;
  let scene: Scene;
  let lineIdx = 0;
  let phase: Phase = 'my-turn';
  /** Bumped on every scene start so callbacks from an old scene do nothing. */
  let sceneToken = 0;
  /** Object URLs of my recordings for the current scene, by line index. */
  const recordings = new Map<number, string>();
  /** My recording bubble per line index, so a re-recording replaces it. */
  const recordingBubbles = new Map<number, HTMLElement>();
  /** Set once the microphone is refused or missing; the talk button is then disabled. */
  let micProblem: string | null = null;

  // --- Layout --------------------------------------------------------------
  const speakerEl = h('div', 'top-speaker');
  const titleEl = h('div', 'top-title');
  const remainingEl = h('div', 'top-remaining');
  const settingsBtn = button('⚙', 'icon-button', opts.onOpenSettings);
  settingsBtn.setAttribute('aria-label', '设置');
  const top = h('header', 'top', h('div', 'top-names', speakerEl, titleEl), remainingEl, settingsBtn);
  const chat = h('main', 'chat');
  const bar = h('footer', 'bar');
  // Floating panel above the bar while recording.
  const recIcon = h('span', 'rec-dot');
  const recTime = h('span', 'rec-time', '0:00');
  const recHint = h('div', 'rec-hint');
  const recPanel = h('div', 'rec-panel', h('div', 'rec-row', recIcon, recTime), recHint);
  recPanel.hidden = true;
  root.replaceChildren(h('div', 'practice', top, chat, recPanel, bar));

  // --- Messages ------------------------------------------------------------
  function scrollToEnd(): void {
    requestAnimationFrame(() => chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' }));
  }

  function addSystem(text: string, kind: 'context' | 'hint'): void {
    chat.append(h('div', `system system-${kind}`, text));
    scrollToEnd();
  }

  /** Audio URL for a line, looked up when needed so a voice change applies at once. */
  function urlOf(i: number): string | undefined {
    return lineAudio(scene.id, i, settings.myVoice)?.url;
  }

  /**
   * Makes a bubble playable. `play(urls)` plays and marks the bubble while it
   * sounds; `toggle(urls)` stops it instead if this bubble is already playing.
   */
  function playable(el: HTMLElement): {
    play: (urls: (string | undefined)[]) => Promise<player.PlayResult>;
    toggle: (urls: (string | undefined)[]) => Promise<player.PlayResult>;
  } {
    let playing = false;
    let run = 0; // so a stopped earlier run can't clear the mark of a newer one
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    const play = async (urls: (string | undefined)[]): Promise<player.PlayResult> => {
      const valid = urls.filter((u): u is string => Boolean(u));
      if (valid.length === 0) return 'failed';
      const myRun = ++run;
      const result = player.play(valid);
      el.classList.add('playing');
      playing = true;
      void result.then(() => {
        if (myRun !== run) return;
        playing = false;
        el.classList.remove('playing');
      });
      return result;
    };
    const toggle = (urls: (string | undefined)[]): Promise<player.PlayResult> => {
      if (!playing) return play(urls);
      player.stop();
      return Promise.resolve('stopped');
    };
    return { play, toggle };
  }

  /** "3″" like a voice message; "–" when the line has no audio yet. */
  function lengthLabel(duration: number | undefined): string {
    return duration === undefined ? '–' : `${Math.max(1, Math.round(duration))}″`;
  }

  function voiceBody(duration: number | undefined): HTMLElement {
    const width = 64 + Math.min(duration ?? 2, 12) * 12;
    const body = h('div', 'voice-body', h('span', 'voice-wave', h('i'), h('i'), h('i')), h('span', 'voice-len', lengthLabel(duration)));
    body.style.minWidth = `${width}px`;
    return body;
  }

  function addOther(i: number, line: Line): () => Promise<player.PlayResult> {
    const audio = lineAudio(scene.id, i, settings.myVoice);
    const body = voiceBody(audio?.duration);
    const transcript = h('div', 'transcript', line.de);
    transcript.hidden = true;
    const bubble = h('div', 'bubble bubble-other', body);
    const { play, toggle } = playable(bubble);
    onPress(bubble, {
      tap: () => void toggle([urlOf(i)]),
      // Long press: show / hide the German text (§4.2).
      longPress: () => {
        transcript.hidden = !transcript.hidden;
        if (!transcript.hidden) scrollToEnd();
      },
    });
    chat.append(h('div', 'msg msg-other', bubble, transcript));
    scrollToEnd();
    return () => play([urlOf(i)]);
  }

  function addAnswer(i: number, line: Line): void {
    const audio = lineAudio(scene.id, i, settings.myVoice);
    const bubble = h(
      'div',
      'bubble bubble-answer',
      h('span', 'answer-tag', '标准'),
      h('div', 'answer-text', line.de),
      h('div', 'answer-foot', h('span', 'voice-wave', h('i'), h('i'), h('i')), h('span', 'voice-len', lengthLabel(audio?.duration))),
    );
    const { play, toggle } = playable(bubble);
    onPress(bubble, {
      tap: () => void toggle([urlOf(i)]),
      // Long press: compare — my recording first, then the standard audio (§4.2).
      longPress: () => void play([recordings.get(i), urlOf(i)]),
    });
    chat.append(h('div', 'msg msg-me', bubble));
    scrollToEnd();
  }

  /** Shows my recording for line i; a new one replaces the previous bubble. */
  function setRecording(i: number, rec: recorder.Recording): void {
    const old = recordings.get(i);
    if (old) URL.revokeObjectURL(old);
    recordings.set(i, rec.url);
    const bubble = h('div', 'bubble bubble-mine', voiceBody(rec.duration));
    const { toggle } = playable(bubble);
    onPress(bubble, { tap: () => void toggle([recordings.get(i)]), longPress: () => undefined });
    const row = h('div', 'msg msg-me', bubble);
    const previous = recordingBubbles.get(i);
    if (previous) previous.replaceWith(row);
    else chat.append(row);
    recordingBubbles.set(i, row);
    scrollToEnd();
  }

  // --- Hold to talk --------------------------------------------------------
  const CANCEL_DISTANCE_PX = 60;
  const MAX_SECONDS = 30;

  function showRecPanel(state: 'starting' | 'recording' | 'cancel' | 'short'): void {
    recPanel.hidden = false;
    recPanel.dataset.state = state;
    recHint.textContent = {
      starting: '正在打开麦克风…',
      recording: '松开 发送 · 上滑 取消',
      cancel: '松开 取消',
      short: '说话时间太短',
    }[state];
  }

  function hideRecPanel(): void {
    recPanel.hidden = true;
  }

  function showMicProblem(err: unknown): void {
    const kind = err instanceof recorder.RecorderError ? err.kind : 'failed';
    micProblem = {
      unsupported: '这个浏览器不能录音，可以直接看答案',
      denied: '没有麦克风权限。可以在浏览器设置里允许，或直接看答案',
      failed: '麦克风打不开，可以直接看答案',
    }[kind];
    addSystem(micProblem, 'hint');
    setPhase(phase);
  }

  function talkButton(label: string): HTMLButtonElement {
    const btn = h('button', 'btn btn-talk', label);
    btn.type = 'button';
    if (micProblem) {
      btn.disabled = true;
      return btn;
    }
    let pressing = false;
    let started = false;
    let cancelArmed = false;
    let startY = 0;
    let ticker: number | undefined;

    const finish = async (cancelled: boolean): Promise<void> => {
      pressing = false;
      clearInterval(ticker);
      btn.classList.remove('recording');
      if (!started) return hideRecPanel(); // released before the mic was ready
      started = false;
      if (cancelled) {
        recorder.cancel();
        return hideRecPanel();
      }
      const token = sceneToken;
      const i = lineIdx;
      const rec = await recorder.stop();
      if (token !== sceneToken) {
        if (rec) URL.revokeObjectURL(rec.url);
        return hideRecPanel();
      }
      if (!rec) {
        showRecPanel('short');
        window.setTimeout(hideRecPanel, 1200);
        return;
      }
      hideRecPanel();
      setRecording(i, rec);
      setPhase('recorded');
    };

    btn.addEventListener('pointerdown', async (e) => {
      if (e.button !== 0 || pressing) return;
      e.preventDefault();
      try {
        btn.setPointerCapture(e.pointerId); // keep getting moves after the finger leaves the button
      } catch {
        // Pointer already gone; the press still works without capture.
      }
      pressing = true;
      started = false;
      cancelArmed = false;
      startY = e.clientY;
      player.stop(); // §4.4: recording stops any playing audio
      btn.classList.add('recording');
      showRecPanel('starting');
      const token = sceneToken;
      try {
        await recorder.start();
      } catch (err) {
        pressing = false;
        btn.classList.remove('recording');
        hideRecPanel();
        showMicProblem(err);
        return;
      }
      if (!pressing || token !== sceneToken) {
        recorder.cancel(); // let go while the mic was opening
        return;
      }
      started = true;
      showRecPanel(cancelArmed ? 'cancel' : 'recording');
      ticker = window.setInterval(() => {
        const s = recorder.elapsed();
        recTime.textContent = `0:${String(Math.floor(s)).padStart(2, '0')}`;
        if (s >= MAX_SECONDS) void finish(false);
      }, 200);
      recTime.textContent = '0:00';
    });
    btn.addEventListener('pointermove', (e) => {
      if (!pressing) return;
      const armed = startY - e.clientY > CANCEL_DISTANCE_PX;
      if (armed !== cancelArmed) {
        cancelArmed = armed;
        if (started) showRecPanel(armed ? 'cancel' : 'recording');
      }
    });
    btn.addEventListener('pointerup', () => {
      if (pressing) void finish(cancelArmed);
    });
    btn.addEventListener('pointercancel', () => {
      if (pressing) void finish(true);
    });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    return btn;
  }

  // --- Bottom bar ----------------------------------------------------------
  function setPhase(next: Phase): void {
    phase = next;
    let content: HTMLElement[];
    switch (phase) {
      case 'other-speaking':
        content = [h('div', 'bar-note', '对方正在说话… 点气泡可停止')];
        break;
      case 'my-turn':
        content = [talkButton('按住 说话'), button('直接看答案', 'btn btn-small', showAnswer)];
        break;
      case 'recorded':
        content = [talkButton('按住 重录'), button('显示答案', 'btn btn-primary', showAnswer)];
        break;
      case 'answer-shown':
        content = [button('继续', 'btn btn-primary btn-wide', advance)];
        break;
      case 'rating':
        content = [
          button('重来', 'btn btn-again', () => rate('again')),
          button('吃力', 'btn btn-hard', () => rate('hard')),
          button('顺利', 'btn btn-good', () => rate('good')),
        ];
        break;
    }
    bar.dataset.phase = phase;
    bar.replaceChildren(...content);
  }

  // --- Flow ----------------------------------------------------------------
  function advance(): void {
    if (lineIdx >= scene.lines.length) return setPhase('rating');
    const i = lineIdx;
    const line = scene.lines[i];
    if (line.role === 'other') {
      lineIdx++;
      const play = addOther(i, line);
      setPhase('other-speaking');
      const token = sceneToken;
      const proceed = (): void => {
        if (token === sceneToken && phase === 'other-speaking') advance();
      };
      if (settings.autoPlayOther) void play().then(proceed);
      else proceed();
    } else {
      if (line.hint_zh) addSystem(line.hint_zh, 'hint');
      setPhase('my-turn');
    }
  }

  function showAnswer(): void {
    const i = lineIdx;
    addAnswer(i, scene.lines[i]);
    lineIdx++;
    setPhase(lineIdx >= scene.lines.length ? 'rating' : 'answer-shown');
  }

  function rate(rating: Rating): void {
    opts.onRate?.(scene, rating);
    pos++;
    if (pos >= queue.length) showDone();
    else startScene();
  }

  function clearRecordings(): void {
    recorder.cancel();
    hideRecPanel();
    for (const url of recordings.values()) URL.revokeObjectURL(url);
    recordings.clear();
    recordingBubbles.clear();
  }

  function startScene(): void {
    sceneToken++;
    player.stop();
    clearRecordings();
    scene = queue[pos];
    lineIdx = 0;
    speakerEl.textContent = scene.lines.find((l) => l.role === 'other')?.speaker ?? '';
    titleEl.textContent = scene.title;
    remainingEl.textContent = `剩 ${queue.length - pos}`;
    chat.replaceChildren();
    addSystem(scene.context_zh, 'context');
    advance();
  }

  function showDone(): void {
    sceneToken++;
    player.stop();
    clearRecordings();
    speakerEl.textContent = '';
    titleEl.textContent = '';
    remainingEl.textContent = '剩 0';
    chat.replaceChildren(h('div', 'done', h('div', 'done-title', '今天的练习完成了'), h('div', 'done-sub', `共 ${queue.length} 个场景`)));
    bar.dataset.phase = 'done';
    bar.replaceChildren(
      button('再练一遍', 'btn btn-primary btn-wide', () => {
        queue = [...opts.scenes];
        pos = 0;
        startScene();
      }),
    );
  }

  if (queue.length === 0) {
    chat.replaceChildren(h('div', 'done', h('div', 'done-title', '还没有场景'), h('div', 'done-sub', '在 scenes/ 里添加场景后重新构建')));
    bar.replaceChildren();
    return;
  }
  startScene();
}
