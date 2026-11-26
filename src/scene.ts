// Scene data format (spec §6). One JSON file per scene in scenes/.
// This file has no browser or Node dependencies, so both the app and
// scripts/validate-scenes.ts import it.

export type Role = 'me' | 'other';

export interface MyLine {
  role: 'me';
  de: string;
  hint_zh?: string;
}

export interface OtherLine {
  role: 'other';
  de: string;
  speaker?: string;
}

export type Line = MyLine | OtherLine;

export interface Scene {
  id: string;
  title: string;
  context_zh: string;
  lines: Line[];
}

export const MAX_MY_LINES = 3;
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const KNOWN_SCENE_KEYS = new Set(['id', 'title', 'context_zh', 'lines']);
const KNOWN_LINE_KEYS = new Set(['role', 'de', 'speaker', 'hint_zh']);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Returns a list of problems; empty means the scene is valid. */
export function validateScene(data: unknown): string[] {
  const errors: string[] = [];
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return ['场景必须是一个 JSON 对象'];
  }
  const s = data as Record<string, unknown>;

  for (const key of Object.keys(s)) {
    if (!KNOWN_SCENE_KEYS.has(key)) errors.push(`未知字段 "${key}"`);
  }
  if (!isNonEmptyString(s.id)) errors.push('缺少 id');
  else if (!ID_PATTERN.test(s.id)) errors.push(`id "${s.id}" 只能用小写字母、数字和连字符`);
  if (!isNonEmptyString(s.title)) errors.push('缺少 title');
  if (!isNonEmptyString(s.context_zh)) errors.push('缺少 context_zh');

  if (!Array.isArray(s.lines) || s.lines.length === 0) {
    errors.push('lines 必须是非空数组');
    return errors;
  }

  let myLines = 0;
  s.lines.forEach((raw: unknown, i: number) => {
    const at = `lines[${i}]`;
    if (typeof raw !== 'object' || raw === null) {
      errors.push(`${at} 必须是对象`);
      return;
    }
    const line = raw as Record<string, unknown>;
    for (const key of Object.keys(line)) {
      if (!KNOWN_LINE_KEYS.has(key)) errors.push(`${at} 未知字段 "${key}"`);
    }
    if (line.role === 'me') {
      myLines++;
      if ('speaker' in line) errors.push(`${at} role 为 me 时不应有 speaker`);
    } else if (line.role === 'other') {
      if ('hint_zh' in line) errors.push(`${at} role 为 other 时不应有 hint_zh`);
    } else {
      errors.push(`${at} role 必须是 "me" 或 "other"`);
    }
    if (!isNonEmptyString(line.de)) errors.push(`${at} de 不能为空`);
    if ('speaker' in line && !isNonEmptyString(line.speaker)) errors.push(`${at} speaker 不能为空字符串`);
    if ('hint_zh' in line && !isNonEmptyString(line.hint_zh)) errors.push(`${at} hint_zh 不能为空字符串`);
  });

  if (myLines === 0) errors.push('场景里至少要有一句 role 为 me 的台词');
  if (myLines > MAX_MY_LINES) errors.push(`me 的台词有 ${myLines} 句，超过上限 ${MAX_MY_LINES}`);

  return errors;
}

/** Checks a whole set of scenes, including cross-scene rules (unique ids). */
export function validateScenes(entries: { file: string; data: unknown }[]): string[] {
  const errors: string[] = [];
  const seen = new Map<string, string>();
  for (const { file, data } of entries) {
    for (const e of validateScene(data)) errors.push(`${file}: ${e}`);
    const id = (data as { id?: unknown } | null)?.id;
    if (typeof id === 'string') {
      const other = seen.get(id);
      if (other) errors.push(`${file}: id "${id}" 与 ${other} 重复`);
      else seen.set(id, file);
    }
  }
  return errors;
}
