// Entry point and page routing.
//
//   #/          practice (chat)        — always mounted, so leaving and
//   #/scenes    scene list               coming back keeps the scene where
//   #/settings  settings                 it was
//
// Routes are URL hashes, so the phone's back gesture returns to practice.
import './style.css';
import { scenes } from './scenes.ts';
import { mountPractice } from './practice.ts';
import { loadSettings } from './settings.ts';
import { openStore } from './db.ts';
import { createScheduler } from './scheduler.ts';
import { scenesPage } from './pages/scenes.ts';
import { settingsPage } from './pages/settings.ts';
import * as player from './player.ts';
import { h } from './dom.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const settings = loadSettings();
const scheduler = await createScheduler(scenes, settings, await openStore());

const practiceRoot = h('div', 'route route-practice');
const overlayRoot = h('div', 'route route-overlay');
app.replaceChildren(practiceRoot, overlayRoot);

/** Back to practice: use history when we came from there, so back/forward stay tidy. */
function goBack(): void {
  if (history.state?.fromPractice) history.back();
  else location.hash = '#/';
}

function open(route: string): void {
  history.pushState({ fromPractice: true }, '', route);
  render();
}

const practice = mountPractice(practiceRoot, {
  scheduler,
  settings,
  onOpenScenes: () => open('#/scenes'),
  onOpenSettings: () => open('#/settings'),
});

function render(): void {
  const route = location.hash.replace(/^#/, '') || '/';
  player.stop();
  if (route === '/scenes' || route === '/settings') {
    practice.pause();
    const page = route === '/scenes' ? scenesPage(scenes, scheduler, settings, goBack) : settingsPage(settings, goBack);
    overlayRoot.replaceChildren(page);
    overlayRoot.hidden = false;
    practiceRoot.hidden = true;
    window.scrollTo(0, 0);
  } else {
    overlayRoot.replaceChildren();
    overlayRoot.hidden = true;
    practiceRoot.hidden = false;
    practice.refresh(); // settings may have changed the limits or voices
  }
}

window.addEventListener('popstate', render);
render();

// Offline support (built site only; the dev server always serves fresh files).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((e: unknown) => {
    console.warn('Service worker registration failed', e);
  });
}
