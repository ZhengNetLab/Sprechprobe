// Scene list (spec §9): every scene with where it stands in the schedule.
// Tap a scene to see its script; tap a line to hear it.
import type { Scene } from '../scene.ts';
import type { ProjectData } from '../project.ts';
import type { Scheduler, SceneStatus } from '../scheduler.ts';
import { dayStart } from '../scheduler.ts';
import type { Settings } from '../settings.ts';
import { lineAudio } from '../audio.ts';
import * as player from '../player.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { pageShell } from './page.ts';

function time(d: Date): string {
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/** "今天" / "明天" / "3 天后" / "12月5日", counted in practice days. */
function dayLabel(due: Date, now: Date): string {
  const days = Math.round((dayStart(due).getTime() - dayStart(now).getTime()) / 86_400_000);
  if (days <= 0) return '今天';
  if (days === 1) return '明天';
  if (days < 30) return `${days} 天后`;
  return due.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}

function statusChip(status: SceneStatus, now: Date): HTMLElement {
  switch (status.kind) {
    case 'new':
      return h('span', 'chip chip-new', '新');
    case 'learning':
      return h('span', 'chip chip-learning', `学习中 · ${status.due <= now ? '现在' : time(status.due)}`);
    case 'review':
      return h('span', 'chip chip-review', `复习 · ${dayLabel(status.due, now)}`);
  }
}

function scriptView(project: ProjectData, scene: Scene, settings: Settings): HTMLElement {
  const list = h('ol', 'script');
  scene.lines.forEach((line, i) => {
    const who = line.role === 'me' ? '我' : (line.speaker ?? '对方');
    const audio = lineAudio(project, scene.id, i, settings.myVoice);
    const item = h(
      'li',
      `script-line script-${line.role}`,
      h('span', 'script-who', who),
      h('span', 'script-de', line.de),
    );
    if (line.role === 'me' && line.hint_zh) item.append(h('span', 'script-hint', line.hint_zh));
    if (audio) {
      const playBtn = h('button', 'script-play', icon('play'));
      playBtn.type = 'button';
      playBtn.setAttribute('aria-label', '播放');
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        void player.play([audio.url]);
      });
      item.prepend(playBtn);
    }
    list.append(item);
  });
  return list;
}

export function scenesPage(project: ProjectData, scheduler: Scheduler, settings: Settings, onBack: () => void): HTMLElement {
  const scenes = project.scenes;
  const now = new Date();
  const statuses = scenes.map((s) => scheduler.status(s.id));
  const count = (kind: SceneStatus['kind']): number => statuses.filter((s) => s.kind === kind).length;
  const summary = h(
    'div',
    'summary',
    h('div', 'summary-item', h('b', '', String(scenes.length)), '全部'),
    h('div', 'summary-item', h('b', '', String(count('new'))), '新'),
    h('div', 'summary-item', h('b', '', String(count('learning'))), '学习中'),
    h('div', 'summary-item', h('b', '', String(count('review'))), '复习中'),
    h('div', 'summary-item', h('b', '', String(scheduler.remaining(now))), '今日待练'),
  );

  const list = h('ul', 'scene-list');
  scenes.forEach((scene, i) => {
    const mine = scene.lines.filter((l) => l.role === 'me').length;
    const head = h(
      'button',
      'scene-head',
      h('div', 'scene-main', h('div', 'scene-title', scene.title), h('div', 'scene-context', scene.focus_zh)),
      h('div', 'scene-side', statusChip(statuses[i], now), h('span', 'scene-count', `我说 ${mine} 句`)),
    );
    head.type = 'button';
    const item = h('li', 'scene-item', head);
    let script: HTMLElement | null = null;
    head.setAttribute('aria-expanded', 'false');
    head.addEventListener('click', () => {
      if (script) {
        script.remove();
        script = null;
        player.stop();
      } else {
        script = scriptView(project, scene, settings);
        item.append(script);
      }
      head.setAttribute('aria-expanded', String(Boolean(script)));
    });
    list.append(item);
  });

  return pageShell(project.title, onBack, summary, scenes.length ? list : h('p', 'empty', '还没有场景'));
}
