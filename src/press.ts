// Tap vs. long-press on one element, for voice bubbles (spec §4.2).
// Also blocks the browser's own long-press menu (copy / select text, §10).

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;

export function onPress(el: HTMLElement, handlers: { tap: () => void; longPress: () => void }): void {
  let timer: number | undefined;
  let fired = false;
  let cancelled = false;
  let startX = 0;
  let startY = 0;

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    fired = false;
    cancelled = false;
    startX = e.clientX;
    startY = e.clientY;
    timer = window.setTimeout(() => {
      fired = true;
      navigator.vibrate?.(15);
      handlers.longPress();
    }, LONG_PRESS_MS);
  });
  el.addEventListener('pointermove', (e) => {
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > MOVE_TOLERANCE_PX) {
      cancelled = true;
      clearTimeout(timer);
    }
  });
  el.addEventListener('pointerup', () => {
    clearTimeout(timer);
    if (!fired && !cancelled) handlers.tap();
  });
  // The browser took over (scrolling) or the pointer left: treat as no press.
  for (const type of ['pointercancel', 'pointerleave'] as const) {
    el.addEventListener(type, () => {
      cancelled = true;
      clearTimeout(timer);
    });
  }
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  // Keyboard: Enter / Space taps.
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handlers.tap();
    }
  });
}
