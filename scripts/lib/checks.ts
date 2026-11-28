// Checks across all scenes (spec §6): my lines must be new everywhere, plus
// warnings for near-duplicates, long scenes and lines, and repeated focus_zh.
// Used by scripts/validate.ts.
import type { Scene } from '../../src/scene.ts';
import { normalizeLine, sceneWarnings } from '../../src/scene.ts';
import { unlistedAbbreviations } from './pronunciation.ts';

export interface CheckedScene {
  /** Path for messages, e.g. projects/alltag/scenes/x.json */
  where: string;
  scene: Scene;
  draft: boolean;
}

/** Two of my lines at or above either score count as "very similar". */
const WORD_OVERLAP_LIMIT = 0.7;
const CHAR_SIMILARITY_LIMIT = 0.85;

/** Shared words / all words (Jaccard), on normalized lines. */
function wordOverlap(a: string, b: string): number {
  const wa = new Set(a.split(' '));
  const wb = new Set(b.split(' '));
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / (wa.size + wb.size - shared);
}

/** 1 − edit distance / longer length, on normalized lines. */
function charSimilarity(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length, 1);
}

/** Every scene for the checks: projects/, plus drafts when given. */
export function collectScenes(
  projects: { id: string; scenes: Scene[] }[],
  drafts: { where: string; scene: Scene }[],
): CheckedScene[] {
  return [
    ...projects.flatMap((p) =>
      p.scenes.map((scene) => ({ where: `projects/${p.id}/scenes/${scene.id}.json`, scene, draft: false })),
    ),
    ...drafts.map((d) => ({ where: d.where, scene: d.scene, draft: true })),
  ];
}

export function checkAll(entries: CheckedScene[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Scene ids. loadProjects already reports clashes inside projects/, so only
  // clashes involving a draft are reported here.
  const ids = new Map<string, CheckedScene>();
  for (const e of entries) {
    const other = ids.get(e.scene.id);
    if (!other) ids.set(e.scene.id, e);
    else if (e.draft || other.draft) errors.push(`${e.where}: 场景 id "${e.scene.id}" 与 ${other.where} 重复`);
  }

  for (const e of entries) for (const w of sceneWarnings(e.scene)) warnings.push(`${e.where}: ${w}`);

  for (const e of entries) {
    for (const line of e.scene.lines) {
      for (const w of unlistedAbbreviations(line.de)) {
        warnings.push(`${e.where}: 缩写 "${w}" 没在 scripts/pronunciation.json 里写读法，TTS 可能按英语字母读`);
      }
    }
  }

  const focus = new Map<string, string>();
  for (const e of entries) {
    const key = e.scene.focus_zh.trim();
    const other = focus.get(key);
    if (other) warnings.push(`${e.where}: focus_zh "${key}" 与 ${other} 相同`);
    else focus.set(key, e.where);
  }

  // My lines: exact duplicates (after normalizing) are errors, near ones warnings.
  const mine = entries.flatMap((e) =>
    e.scene.lines.flatMap((l, i) =>
      l.role === 'me' ? [{ at: `${e.where} lines[${i}]`, de: l.de, norm: normalizeLine(l.de) }] : [],
    ),
  );
  for (let i = 0; i < mine.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = mine[i];
      const b = mine[j];
      if (a.norm === b.norm) {
        errors.push(`${a.at}: 我的台词与 ${b.at} 重复："${a.de}"`);
        continue;
      }
      const words = wordOverlap(a.norm, b.norm);
      const chars = charSimilarity(a.norm, b.norm);
      if (words >= WORD_OVERLAP_LIMIT || chars >= CHAR_SIMILARITY_LIMIT) {
        warnings.push(
          `${a.at}: 我的台词与 ${b.at} 很像（词重合 ${words.toFixed(2)}，字符相似 ${chars.toFixed(2)}）："${a.de}" ↔ "${b.de}"`,
        );
      }
    }
  }

  return { errors, warnings };
}
