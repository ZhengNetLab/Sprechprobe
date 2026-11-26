// Entry point: the practice page plus a small settings sheet.
// The full settings page and scene list come in a later step (spec §9).
import './style.css';
import { scenes } from './scenes.ts';
import type { MyVoice } from './audio.ts';
import { mountPractice } from './practice.ts';
import { loadSettings, saveSettings } from './settings.ts';
import { button, h } from './dom.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const settings = loadSettings();

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
  );
  sheet.append(button('完成', 'btn btn-primary', () => sheet.close()));
  sheet.addEventListener('close', () => sheet.remove());
  // Tap outside the sheet closes it.
  sheet.addEventListener('click', (e) => {
    const r = sheet.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (e.target === sheet && !inside) sheet.close();
  });
  document.body.append(sheet);
  sheet.showModal();
}

mountPractice(app, { scenes, settings, onOpenSettings: openSettings });
