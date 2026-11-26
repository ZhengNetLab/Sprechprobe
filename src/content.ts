// Downloading projects to the phone, removing them, and syncing (manual only).
//
// A project's scenes go into IndexedDB (db.ts); its audio goes into Cache
// Storage ("sprechprobe-content"), where the service worker plays it from
// offline. Audio files are named by content hash and shared between projects,
// so an update only downloads files the phone doesn't have yet, and a file is
// deleted only when no added project uses it any more.
import type { Store } from './db.ts';
import type { Catalog, CatalogEntry, ProjectData } from './project.ts';
import { audioFilesOf } from './project.ts';
import { audioUrl } from './audio.ts';

const CONTENT_CACHE = 'sprechprobe-content';
const CATALOG_KEY = 'catalog';
const PARALLEL_DOWNLOADS = 4;

export type Progress = (done: number, total: number) => void;

const contentUrl = (path: string): string => `${import.meta.env.BASE_URL}content/${path}`;
const absolute = (url: string): string => new URL(url, location.href).href;
const hasCacheStorage = (): boolean => typeof caches !== 'undefined';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(contentUrl(path), { cache: 'no-store' });
  if (!res.ok) throw new Error(`下载失败（${res.status}）：${path}`);
  return (await res.json()) as T;
}

// --- Catalog -------------------------------------------------------------

/** The catalog from the last sync, or null if never fetched. */
export function savedCatalog(store: Store): Promise<Catalog | undefined> {
  return store.getMeta<Catalog>(CATALOG_KEY);
}

export async function fetchCatalog(store: Store): Promise<Catalog> {
  const catalog = await fetchJson<Catalog>('catalog.json');
  await store.putMeta(CATALOG_KEY, catalog);
  return catalog;
}

// --- Audio ---------------------------------------------------------------

/** Downloads the audio files the phone doesn't have yet. */
async function downloadAudio(files: string[], onProgress?: Progress): Promise<void> {
  if (!hasCacheStorage()) return; // no offline storage: play from the network
  const cache = await caches.open(CONTENT_CACHE);
  const missing: string[] = [];
  for (const f of files) if (!(await cache.match(absolute(audioUrl(f))))) missing.push(f);
  let done = 0;
  onProgress?.(0, missing.length);
  const queue = [...missing];
  const worker = async (): Promise<void> => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const url = absolute(audioUrl(f));
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`音频下载失败（${res.status}）：${f}`);
      await cache.put(url, res);
      onProgress?.(++done, missing.length);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL_DOWNLOADS }, worker));
}

/** Deletes cached audio that no added project uses. */
async function pruneAudio(store: Store): Promise<number> {
  if (!hasCacheStorage()) return 0;
  const keep = new Set((await store.getProjects()).flatMap(audioFilesOf).map((f) => absolute(audioUrl(f))));
  const cache = await caches.open(CONTENT_CACHE);
  let removed = 0;
  for (const req of await cache.keys()) {
    if (!keep.has(req.url)) {
      await cache.delete(req);
      removed++;
    }
  }
  return removed;
}

// --- Projects ------------------------------------------------------------

export function addedProjects(store: Store): Promise<ProjectData[]> {
  return store.getProjects();
}

/** Downloads a project with all its audio and keeps it on the phone. */
export async function addProject(store: Store, id: string, onProgress?: Progress): Promise<ProjectData> {
  const project = await fetchJson<ProjectData>(`projects/${id}.json`);
  await downloadAudio(audioFilesOf(project), onProgress);
  // Saved last: a project only appears once all its audio is there.
  await store.putProject(project);
  return project;
}

/** Removes a project's scenes and audio. Learning progress is kept. */
export async function removeProject(store: Store, id: string): Promise<void> {
  await store.deleteProject(id);
  await pruneAudio(store);
}

// --- Sync ----------------------------------------------------------------

export interface ProjectChange {
  title: string;
  added: number;
  removed: number;
  changed: number;
}

export interface SyncResult {
  updated: ProjectChange[];
  /** Projects on the server that weren't in the previous catalog. */
  newProjects: CatalogEntry[];
  /** Audio files downloaded because they were missing (e.g. evicted). */
  repairedAudio: number;
  appUpdated: boolean;
}

function diff(before: ProjectData, after: ProjectData): ProjectChange {
  const old = new Map(before.scenes.map((s) => [s.id, JSON.stringify(s)]));
  const now = new Map(after.scenes.map((s) => [s.id, JSON.stringify(s)]));
  let added = 0;
  let changed = 0;
  for (const [id, text] of now) {
    if (!old.has(id)) added++;
    else if (old.get(id) !== text) changed++;
  }
  const removed = [...old.keys()].filter((id) => !now.has(id)).length;
  return { title: after.title, added, removed, changed };
}

/**
 * Fetches the catalog, updates every added project whose version changed,
 * fills in missing audio, deletes unused audio, and checks for a new version
 * of the app itself. `onStatus` receives short progress texts.
 */
export async function syncAll(store: Store, onStatus: (text: string) => void): Promise<SyncResult> {
  onStatus('正在检查更新…');
  const previous = await savedCatalog(store);
  const catalog = await fetchCatalog(store);
  const known = new Set(previous?.projects.map((p) => p.id) ?? []);
  const result: SyncResult = {
    updated: [],
    newProjects: previous ? catalog.projects.filter((p) => !known.has(p.id)) : [],
    repairedAudio: 0,
    appUpdated: false,
  };

  for (const local of await store.getProjects()) {
    const entry = catalog.projects.find((p) => p.id === local.id);
    if (!entry) continue; // gone from the server: keep the phone's copy
    if (entry.version !== local.version) {
      onStatus(`正在更新「${entry.title}」…`);
      const fresh = await addProject(store, local.id, (d, t) => t && onStatus(`正在更新「${entry.title}」音频 ${d}/${t}`));
      result.updated.push(diff(local, fresh));
    } else {
      // Same version: make sure no audio went missing on the phone.
      let fixed = 0;
      await downloadAudio(audioFilesOf(local), (d, t) => {
        fixed = t;
        if (t) onStatus(`正在补全「${local.title}」音频 ${d}/${t}`);
      });
      result.repairedAudio += fixed;
    }
  }
  await pruneAudio(store);

  onStatus('正在检查应用新版本…');
  result.appUpdated = await updateApp();
  return result;
}

/**
 * Asks the browser to check for a new service worker (= new app version)
 * and waits until it has taken over. The caller reloads the page to use it.
 */
async function updateApp(): Promise<boolean> {
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg) return false;
  try {
    await reg.update();
  } catch {
    return false;
  }
  const sw = reg.installing ?? reg.waiting;
  if (!sw) return false;
  await new Promise<void>((resolve) => {
    const done = (): void => {
      if (sw.state === 'activated' || sw.state === 'redundant') resolve();
    };
    sw.addEventListener('statechange', done);
    done();
    window.setTimeout(resolve, 30_000);
  });
  return sw.state === 'activated';
}

/** A one-paragraph summary of a sync for the screen. */
export function describeSync(r: SyncResult): string {
  const parts: string[] = [];
  for (const u of r.updated) {
    const bits = [u.added && `新增 ${u.added}`, u.changed && `修改 ${u.changed}`, u.removed && `删除 ${u.removed}`].filter(Boolean);
    parts.push(`「${u.title}」已更新${bits.length ? `（${bits.join('，')} 个场景）` : ''}`);
  }
  if (r.newProjects.length) parts.push(`新项目：${r.newProjects.map((p) => p.title).join('、')}`);
  if (r.repairedAudio) parts.push(`补全了 ${r.repairedAudio} 个音频`);
  if (r.appUpdated) parts.push('应用已更新到新版本');
  return parts.length ? parts.join('；') : '已是最新';
}
