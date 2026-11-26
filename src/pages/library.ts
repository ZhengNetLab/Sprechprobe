// Library (home screen): the projects on this phone and the ones that can be
// added. Tap an added project to practise it; projects are only downloaded
// or updated when you tap 添加 or 同步 (no automatic syncing).
import type { Store } from '../db.ts';
import type { Catalog, CatalogEntry, ProjectData } from '../project.ts';
import type { Settings } from '../settings.ts';
import { createScheduler } from '../scheduler.ts';
import { addProject, fetchCatalog, removeProject, savedCatalog } from '../content.ts';
import { button, h } from '../dom.ts';
import { iconButton } from '../icons.ts';
import { syncControl } from './sync.ts';

export interface LibraryOptions {
  store: Store;
  settings: Settings;
  onOpenProject: (id: string) => void;
  onOpenSettings: () => void;
  /** Projects were added, removed or updated: drop anything built from old data. */
  onContentChanged: () => void;
}

function megabytes(bytes: number): string {
  const mb = bytes / 1_048_576;
  return mb < 0.1 ? '不到 0.1 MB' : `约 ${mb.toFixed(1)} MB`;
}

async function addedCard(project: ProjectData, opts: LibraryOptions, rerender: () => void): Promise<HTMLElement> {
  const scheduler = await createScheduler(project.scenes, opts.settings, opts.store);
  const due = scheduler.remaining();
  const open = h(
    'button',
    'project-open',
    h('div', 'project-title', project.title),
    project.description ? h('div', 'project-desc', project.description) : '',
    h('div', 'project-meta', `${project.scenes.length} 个场景`),
  );
  open.type = 'button';
  open.addEventListener('click', () => opts.onOpenProject(project.id));
  const badge = h('div', due > 0 ? 'project-due' : 'project-due project-due-zero', due > 0 ? `今日 ${due}` : '已练完');
  const remove = button('移除', 'link-button', async () => {
    const ok = confirm(`移除「${project.title}」？\n\n剧本和音频会从手机上删除；学习记录会保留，重新添加后可以接着练。`);
    if (!ok) return;
    remove.disabled = true;
    await removeProject(opts.store, project.id);
    opts.onContentChanged();
    rerender();
  });
  return h('li', 'project-card', open, h('div', 'project-side', badge, remove));
}

function availableCard(entry: CatalogEntry, opts: LibraryOptions, rerender: () => void): HTMLElement {
  const add = button('添加', 'btn btn-primary btn-add', async () => {
    add.disabled = true;
    add.textContent = '下载中…';
    try {
      await addProject(opts.store, entry.id, (done, total) => {
        if (total) add.textContent = `${done}/${total}`;
      });
      opts.onContentChanged();
      rerender();
    } catch (e) {
      console.error(e);
      add.disabled = false;
      add.textContent = '重试';
      alert(`「${entry.title}」下载失败，请检查网络后重试。`);
    }
  });
  return h(
    'li',
    'project-card project-available',
    h(
      'div',
      'project-open',
      h('div', 'project-title', entry.title),
      entry.description ? h('div', 'project-desc', entry.description) : '',
      h('div', 'project-meta', `${entry.sceneCount} 个场景 · ${megabytes(entry.audioBytes)}`),
    ),
    h('div', 'project-side', add),
  );
}

export async function libraryPage(opts: LibraryOptions): Promise<HTMLElement> {
  const root = h('div', 'page library');
  const body = h('main', 'page-body');

  const rerender = (): void => {
    void fill();
  };

  const sync = syncControl(opts.store, 'icon', () => {
    opts.onContentChanged();
    rerender();
  });
  const header = h(
    'header',
    'top page-top library-top',
    h('div', 'page-title library-title', 'Sprechprobe'),
    sync.button,
    iconButton('settings', '设置', opts.onOpenSettings),
  );
  root.append(header, body);

  async function fill(): Promise<void> {
    const added = (await opts.store.getProjects()).sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
    let catalog: Catalog | undefined = await savedCatalog(opts.store);
    let catalogProblem = '';
    if (!catalog) {
      // First launch: fetch the list of projects once (not a sync).
      try {
        catalog = await fetchCatalog(opts.store);
      } catch {
        catalogProblem = '连不上网络。联网后点右上角的同步，获取项目列表。';
      }
    }
    // Keep the server's order for added projects too.
    const order = new Map(catalog?.projects.map((p, i) => [p.id, i]) ?? []);
    added.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));

    const addedIds = new Set(added.map((p) => p.id));
    const available = catalog?.projects.filter((p) => !addedIds.has(p.id)) ?? [];

    const sections: (Node | string)[] = [sync.status];
    sections.push(h('h3', 'section-title', '我的项目'));
    if (added.length) {
      sections.push(h('ul', 'project-list', ...(await Promise.all(added.map((p) => addedCard(p, opts, rerender))))));
    } else {
      sections.push(h('p', 'section-empty', '还没有添加项目。从下面选一个添加到手机上。'));
    }
    if (available.length || catalogProblem) {
      sections.push(h('h3', 'section-title', '可添加'));
      if (catalogProblem) sections.push(h('p', 'section-empty', catalogProblem));
      sections.push(h('ul', 'project-list', ...available.map((e) => availableCard(e, opts, rerender))));
    }
    sections.push(h('p', 'section-note', '项目更新后，点右上角的同步下载到手机。'));
    body.replaceChildren(...sections);
  }

  await fill();
  return root;
}
