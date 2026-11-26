// Placeholder entry point: lists scenes and lets you play each line's audio.
// The chat UI replaces this in a later step.
import './style.css';
import { scenes } from './scenes.ts';
import { lineAudio } from './audio.ts';
import type { MyVoice } from './audio.ts';
import { loadSettings, saveSettings } from './settings.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const player = new Audio();
const settings = loadSettings();

function voicePicker(): HTMLElement {
  const label = document.createElement('label');
  const select = document.createElement('select');
  for (const [value, text] of [['male', '男声'], ['female', '女声']] as const) {
    select.add(new Option(text, value, false, settings.myVoice === value));
  }
  select.addEventListener('change', () => {
    settings.myVoice = select.value as MyVoice;
    saveSettings(settings);
    render();
  });
  label.append('我的声音：', select);
  return label;
}

function render(): void {
  const heading = document.createElement('h1');
  heading.textContent = `Sprechprobe · ${scenes.length} 个场景`;
  const sections = scenes.map((scene) => {
    const section = document.createElement('section');
    const title = document.createElement('h2');
    title.textContent = scene.title;
    const list = document.createElement('ol');
    scene.lines.forEach((line, i) => {
      const item = document.createElement('li');
      const audio = lineAudio(scene.id, i, settings.myVoice);
      const who = line.role === 'me' ? '我' : (line.speaker ?? '对方');
      const button = document.createElement('button');
      button.textContent = audio ? `▶ ${audio.duration}″` : '无音频';
      button.disabled = !audio;
      button.dataset.src = audio?.url ?? '';
      button.addEventListener('click', () => {
        player.src = audio!.url;
        void player.play();
      });
      item.append(button, ` ${who}：${line.de}`);
      list.append(item);
    });
    section.append(title, list);
    return section;
  });
  app.replaceChildren(heading, voicePicker(), ...sections);
}

render();
