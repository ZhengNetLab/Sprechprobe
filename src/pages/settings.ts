// Settings page (spec §9). Every change is saved at once.
import type { MyVoice } from '../audio.ts';
import type { Settings } from '../settings.ts';
import { saveSettings } from '../settings.ts';
import { h } from '../dom.ts';
import { pageShell } from './page.ts';
import type { Store } from '../db.ts';
import { syncControl } from './sync.ts';

function row(label: string, note: string, control: HTMLElement): HTMLElement {
  const text = h('span', 'setting-text', h('span', 'setting-label', label));
  if (note) text.append(h('span', 'setting-note', note));
  return h('label', 'setting', text, control);
}

function numberInput(settings: Settings, key: 'newPerDay' | 'reviewLimit', min: number, max: number): HTMLInputElement {
  const input = h('input', 'setting-number');
  input.type = 'number';
  input.inputMode = 'numeric';
  input.min = String(min);
  input.max = String(max);
  input.value = String(settings[key]);
  input.addEventListener('change', () => {
    const n = Math.min(max, Math.max(min, Math.round(Number(input.value)) || 0));
    input.value = String(n);
    settings[key] = n;
    saveSettings(settings);
  });
  return input;
}

export function settingsPage(settings: Settings, store: Store, onBack: () => void, onContentChanged: () => void): HTMLElement {
  const sync = syncControl(store, 'wide', onContentChanged);
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

  return pageShell(
    '设置',
    onBack,
    h('h3', 'setting-group', '练习'),
    row('每日新场景', '每个项目每天最多引入几个新场景', numberInput(settings, 'newPerDay', 0, 50)),
    row('每日复习上限', '每个项目每天最多复习几个场景', numberInput(settings, 'reviewLimit', 0, 500)),
    h('h3', 'setting-group', '声音'),
    row('我的声音', '标准答案用男声还是女声朗读', voice),
    row('对方语音自动播放', '对方的消息到达时自动播放一次', autoPlay),
    h('h3', 'setting-group', '同步'),
    h('div', 'setting-block', h('p', 'setting-note', '下载已添加项目的新场景和音频，并检查应用新版本。只在点按钮时联网。'), sync.button, sync.status),
    h('p', 'setting-footer', '设置和学习进度只保存在这台设备上。'),
  );
}
