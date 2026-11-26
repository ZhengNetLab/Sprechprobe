// Placeholder entry point: lists the loaded scenes. The chat UI comes in a later step.
import './style.css';
import { scenes } from './scenes.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;

const list = document.createElement('ul');
for (const scene of scenes) {
  const item = document.createElement('li');
  const mine = scene.lines.filter((l) => l.role === 'me').length;
  item.textContent = `${scene.title}（我说 ${mine} 句）`;
  list.append(item);
}

const heading = document.createElement('h1');
heading.textContent = `Sprechprobe · ${scenes.length} 个场景`;
app.replaceChildren(heading, list);
