// Shared shell for secondary pages: header with a back button and a title.
import { h } from '../dom.ts';
import { iconButton } from '../icons.ts';

export function pageShell(title: string, onBack: () => void, ...content: (Node | string)[]): HTMLElement {
  const header = h('header', 'top page-top', iconButton('back', '返回', onBack), h('div', 'page-title', title));
  return h('div', 'page', header, h('main', 'page-body', ...content));
}
