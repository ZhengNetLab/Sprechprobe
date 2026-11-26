// Practice page: one scene = one voice chat (spec §4).
//
// Flow of a scene (bottom bar per phase, §4.3):
//   other-speaking  the other side's message arrived and is playing
//   my-turn         [按住 说话] [直接看答案]
//   recorded        [重录] [显示答案]          (recording arrives in step 5)
//   answer-shown    [继续]
//   rating          [重来] [吃力] [顺利]       → next scene, recordings cleared
//
// The scene queue is a plain list for now; FSRS scheduling replaces it later.
import type { Line, Scene } from './scene.ts';
import { lineAudio } from './audio.ts';
import * as player from './player.ts';
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
  /** Object URLs of my recordings for the current scene, by line index (step 5). */
  const recordings = new Map<number, string>();

  // --- Layout --------------------------------------------------------------
  const speakerEl = h('div', 'top-speaker');
  const titleEl = h('div', 'top-title');
  const remainingEl = h('div', 'top-remaining');
  const settingsBtn = button('⚙', 'icon-button', opts.onOpenSettings);
  settingsBtn.setAttribute('aria-label', '设置');
  const top = h('header', 'top', h('div', 'top-names', speakerEl, titleEl), remainingEl, settingsBtn);
  const chat = h('main', 'chat');
  const bar = h('footer', 'bar');
  root.replaceChildren(h('div', 'practice', top, chat, bar));

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

  // --- Bottom bar ----------------------------------------------------------
  function setPhase(next: Phase): void {
    phase = next;
    let content: HTMLElement[];
    switch (phase) {
      case 'other-speaking':
        content = [h('div', 'bar-note', '对方正在说话… 点气泡可停止')];
        break;
      case 'my-turn': {
        const talk = button('按住 说话', 'btn btn-talk', () => undefined);
        talk.disabled = true;
        talk.title = '录音功能将在下一步接入';
        content = [talk, button('直接看答案', 'btn btn-small', showAnswer)];
        break;
      }
      case 'recorded':
        content = [button('重录', 'btn', () => setPhase('my-turn')), button('显示答案', 'btn btn-primary', showAnswer)];
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
    for (const url of recordings.values()) URL.revokeObjectURL(url);
    recordings.clear();
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
