// Placeholder entry point: lists scenes and lets you play each line's audio.
// The chat UI replaces this in a later step.
import './style.css';
import { scenes } from './scenes.ts';
import { lineAudio } from './audio.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const player = new Audio();

const heading = document.createElement('h1');
heading.textContent = `Sprechprobe · ${scenes.length} 个场景`;
const sections = scenes.map((scene) => {
  const section = document.createElement('section');
  const title = document.createElement('h2');
  title.textContent = scene.title;
  const list = document.createElement('ol');
  scene.lines.forEach((line, i) => {
    const item = document.createElement('li');
    const audio = lineAudio(scene.id, i);
    const who = line.role === 'me' ? '我' : (line.speaker ?? '对方');
    const button = document.createElement('button');
    button.textContent = audio ? `▶ ${audio.duration}″` : '无音频';
    button.disabled = !audio;
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
app.replaceChildren(heading, ...sections);
