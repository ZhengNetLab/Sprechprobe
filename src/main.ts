// Entry point and page routing.
//
//   #/                  library (home): projects on the phone / to add
//   #/p/<id>            practice one project (chat)
//   #/p/<id>/scenes     that project's scene list
//   #/settings          settings and sync
//
// The practice view stays mounted while its scene list or the settings are
// open, so coming back keeps the scene where it was. Routes are URL hashes,
// so the phone's back gesture works.
import './style.css';
import { mountPractice } from './practice.ts';
import type { PracticeView } from './practice.ts';
import { loadSettings } from './settings.ts';
import { openStore } from './db.ts';
import { createScheduler } from './scheduler.ts';
import type { Scheduler } from './scheduler.ts';
import type { ProjectData } from './project.ts';
import { libraryPage } from './pages/library.ts';
import { scenesPage } from './pages/scenes.ts';
import { settingsPage } from './pages/settings.ts';
import * as player from './player.ts';
import { h } from './dom.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const settings = loadSettings();
const store = await openStore();

const practiceRoot = h('div', 'route route-practice');
const pageRoot = h('div', 'route route-page');
app.replaceChildren(practiceRoot, pageRoot);

/** The project being practised, if any. */
let active: { project: ProjectData; scheduler: Scheduler; view: PracticeView } | null = null;

function dropPractice(): void {
  active?.view.destroy();
  active = null;
  practiceRoot.replaceChildren();
}

async function practiceFor(id: string): Promise<typeof active> {
  if (active?.project.id === id) return active;
  dropPractice();
  const project = (await store.getProjects()).find((p) => p.id === id);
  if (!project) return null;
  const scheduler = await createScheduler(project.scenes, settings, store);
  const view = mountPractice(practiceRoot, {
    project,
    scheduler,
    settings,
    onBack: () => goBack('#/'),
    onOpenScenes: () => go(`#/p/${id}/scenes`),
    onOpenSettings: () => go('#/settings'),
  });
  active = { project, scheduler, view };
  return active;
}

// --- Navigation ------------------------------------------------------------
/** Forward navigation inside the app (back returns here). */
function go(route: string): void {
  history.pushState({ inApp: true }, '', route);
  void render();
}

/** Back: use history when we navigated here ourselves, else jump to `fallback`. */
function goBack(fallback: string): void {
  if (history.state?.inApp) history.back();
  else {
    history.replaceState(null, '', fallback);
    void render();
  }
}

function contentChanged(): void {
  dropPractice(); // rebuilt from fresh data next time a project is opened
}

function showPage(page: HTMLElement): void {
  active?.view.pause();
  practiceRoot.hidden = true;
  pageRoot.replaceChildren(page);
  pageRoot.hidden = false;
  window.scrollTo(0, 0);
}

let renderCount = 0;
async function render(): Promise<void> {
  const mine = ++renderCount;
  const route = location.hash.replace(/^#/, '') || '/';
  player.stop();
  const projectMatch = /^\/p\/([a-z0-9-]+)(\/scenes)?$/.exec(route);

  if (projectMatch) {
    const current = await practiceFor(projectMatch[1]);
    if (mine !== renderCount) return;
    if (!current) {
      // Not on this phone (removed, or an old link): back to the library.
      history.replaceState(null, '', '#/');
      return render();
    }
    if (projectMatch[2]) {
      showPage(scenesPage(current.project, current.scheduler, settings, () => goBack(`#/p/${current.project.id}`)));
    } else {
      pageRoot.hidden = true;
      pageRoot.replaceChildren();
      practiceRoot.hidden = false;
      current.view.refresh(); // settings may have changed limits or voices
    }
    return;
  }

  if (route === '/settings') {
    showPage(settingsPage(settings, store, () => goBack('#/'), contentChanged));
    return;
  }

  // Library. Leaving practice for the library ends that session.
  dropPractice();
  const page = await libraryPage({
    store,
    settings,
    onOpenProject: (id) => go(`#/p/${id}`),
    onOpenSettings: () => go('#/settings'),
    onContentChanged: contentChanged,
  });
  if (mine === renderCount) showPage(page);
}

window.addEventListener('popstate', () => void render());
await render();

// Offline support (built site only; the dev server always serves fresh files).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((e: unknown) => {
    console.warn('Service worker registration failed', e);
  });
}
