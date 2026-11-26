// Entry point: the practice page plus a small settings sheet.
// The full settings page and scene list come in a later step (spec §9).
import './style.css';
import { scenes } from './scenes.ts';
import type { MyVoice } from './audio.ts';
import { mountPractice } from './practice.ts';
import type { PracticeView } from './practice.ts';
import { openStore } from './db.ts';
import { createScheduler } from './scheduler.ts';
import { loadSettings, saveSettings } from './settings.ts';
import { button, h } from './dom.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const settings = loadSettings();
let practice: PracticeView | undefined;

/** A whole-number input that saves on change, clamped to [min, max]. */
function numberInput(get: () => number, set: (n: number) => void, min: number, max: number): HTMLInputElement {
  const input = h('input', 'setting-number');
  input.type = 'number';
  input.inputMode = 'numeric';
  input.min = String(min);
  input.max = String(max);
  input.value = String(get());
  input.addEventListener('change', () => {
    const n = Math.min(max, Math.max(min, Math.round(Number(input.value)) || 0));
    input.value = String(n);
    set(n);
    saveSettings(settings);
  });
  return input;
}

function openSettings(): void {
  const voice = h('select');
  for (const [value, text] of [['male', '男声'], ['female', '女声']] as const) {
    voice.add(new Option(text, value, false, settings.myVoice === value));
  }
  voice.addEventListener('change', () => {
    settings.myVoice = voice.value as MyVoice;
    saveSettings(settings);
  });

  const autoPlay = h('input');
  autoPlay.type = 'checkbox';
  autoPlay.checked = settings.autoPlayOther;
  autoPlay.addEventListener('change', () => {
    settings.autoPlayOther = autoPlay.checked;
    saveSettings(settings);
  });

  const sheet = h(
    'dialog',
    'sheet',
    h('h2', '', '设置'),
    h('label', 'setting', '我的声音', voice),
    h('label', 'setting', '对方语音自动播放', autoPlay),
    h('label', 'setting', '每日新场景', numberInput(() => settings.newPerDay, (n) => (settings.newPerDay = n), 0, 50)),
    h('label', 'setting', '每日复习上限', numberInput(() => settings.reviewLimit, (n) => (settings.reviewLimit = n), 0, 500)),
  );
  // Closing is done here rather than in a 'close' listener: some browsers
  // close a dialog without firing that event.
  let closed = false;
  const closeSheet = (): void => {
    if (closed) return;
    closed = true;
    if (sheet.open) sheet.close();
    sheet.remove();
    practice?.refresh();
  };
  sheet.append(button('完成', 'btn btn-primary', closeSheet));
  sheet.addEventListener('close', closeSheet); // Esc / back gesture
  // Tap outside the sheet closes it.
  sheet.addEventListener('click', (e) => {
    const r = sheet.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (e.target === sheet && !inside) closeSheet();
  });
  document.body.append(sheet);
  sheet.showModal();
}

const scheduler = await createScheduler(scenes, settings, await openStore());
practice = mountPractice(app, { scheduler, settings, onOpenSettings: openSettings });
