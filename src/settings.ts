// User settings, kept on this device only (spec §8).
// The settings page (spec §9) reads and writes these.
import type { MyVoice } from './audio.ts';

export interface Settings {
  /** Which voice reads my lines: male = Brian, female = Alice (scripts/voices.json). */
  myVoice: MyVoice;
  /** Play the other side's message once when it arrives (spec §4.2). */
  autoPlayOther: boolean;
  /** New scenes introduced per day (spec §4.5). */
  newPerDay: number;
  /** Most review scenes per day. */
  reviewLimit: number;
}

const KEY = 'sprechprobe.settings';
const DEFAULTS: Settings = { myVoice: 'male', autoPlayOther: true, newPerDay: 5, reviewLimit: 50 };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode etc.): the setting lasts until reload.
  }
}
