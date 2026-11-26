// The sync button (spec: manual sync only) and its status line, used on the
// library and the settings page.
import type { Store } from '../db.ts';
import { describeSync, syncAll } from '../content.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';

export interface SyncControl {
  button: HTMLButtonElement;
  status: HTMLElement;
}

let running = false;

/**
 * `style` 'icon' is a round header button, 'wide' a full-width button.
 * `onChanged` runs after a sync that changed something on the phone.
 */
export function syncControl(store: Store, style: 'icon' | 'wide', onChanged: () => void): SyncControl {
  const status = h('div', 'sync-status');
  status.hidden = true;
  const btn = h('button', style === 'icon' ? 'icon-button sync-button' : 'btn btn-primary btn-wide sync-button');
  btn.type = 'button';
  btn.setAttribute('aria-label', '同步');
  btn.title = '同步';
  if (style === 'icon') btn.append(icon('sync'));
  else btn.append(icon('sync'), '同步');

  const show = (text: string, kind: 'info' | 'ok' | 'error'): void => {
    status.hidden = false;
    status.dataset.kind = kind;
    status.textContent = text;
  };

  btn.addEventListener('click', async () => {
    if (running) return;
    running = true;
    btn.disabled = true;
    btn.classList.add('spinning');
    try {
      const result = await syncAll(store, (text) => show(text, 'info'));
      show(describeSync(result), 'ok');
      if (result.updated.length || result.newProjects.length || result.repairedAudio) onChanged();
      if (result.appUpdated) {
        show(`${describeSync(result)}。正在重新打开…`, 'ok');
        window.setTimeout(() => location.reload(), 1200);
      }
    } catch (e) {
      console.error(e);
      // fetch() rejects with a TypeError when the server can't be reached.
      const offline = !navigator.onLine || e instanceof TypeError;
      show(offline ? '连不上服务器，检查网络后再同步' : `同步失败：${(e as Error).message}`, 'error');
    } finally {
      running = false;
      btn.disabled = false;
      btn.classList.remove('spinning');
    }
  });

  return { button: btn, status };
}
