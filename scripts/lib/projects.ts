// Reads and checks everything under projects/. Shared by the validate and
// audio scripts and by the build (vite.config.ts).
//
//   projects/<project-id>/project.json      { title, description?, order? }
//   projects/<project-id>/scenes/<id>.json  one scene per file (spec §6)
//
// Scene ids must be unique across all projects: learning progress on the
// phone is stored per scene id.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { validateScene } from '../../src/scene.ts';
import type { Scene } from '../../src/scene.ts';

export interface ProjectMeta {
  title: string;
  description?: string;
  /** Position in the library; lower comes first. */
  order?: number;
}

export interface LoadedProject {
  id: string;
  meta: ProjectMeta;
  scenes: Scene[];
}

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const KNOWN_META_KEYS = new Set(['title', 'description', 'order']);

export const projectsDir = (root: string): string => join(root, 'projects');

function readJson(path: string, errors: string[], label: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    errors.push(`${label}: JSON 格式错误 — ${(e as Error).message}`);
    return undefined;
  }
}

function checkMeta(data: unknown, label: string, errors: string[]): data is ProjectMeta {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    errors.push(`${label}: 必须是一个 JSON 对象`);
    return false;
  }
  const m = data as Record<string, unknown>;
  const before = errors.length;
  for (const key of Object.keys(m)) if (!KNOWN_META_KEYS.has(key)) errors.push(`${label}: 未知字段 "${key}"`);
  if (typeof m.title !== 'string' || !m.title.trim()) errors.push(`${label}: 缺少 title`);
  if ('description' in m && typeof m.description !== 'string') errors.push(`${label}: description 必须是文字`);
  if ('order' in m && typeof m.order !== 'number') errors.push(`${label}: order 必须是数字`);
  return errors.length === before;
}

/** Loads all projects. Problems are returned in `errors` (empty = all valid). */
export function loadProjects(root: string): { projects: LoadedProject[]; errors: string[] } {
  const errors: string[] = [];
  const dir = projectsDir(root);
  if (!existsSync(dir)) return { projects: [], errors: ['找不到 projects/ 目录'] };

  const projects: LoadedProject[] = [];
  const sceneOwner = new Map<string, string>();

  for (const id of readdirSync(dir).sort()) {
    const pdir = join(dir, id);
    if (!statSync(pdir).isDirectory()) continue;
    const label = `projects/${id}`;
    if (!ID_PATTERN.test(id)) errors.push(`${label}: 文件夹名只能用小写字母、数字和连字符`);

    const metaPath = join(pdir, 'project.json');
    if (!existsSync(metaPath)) {
      errors.push(`${label}: 缺少 project.json`);
      continue;
    }
    const meta = readJson(metaPath, errors, `${label}/project.json`);
    if (!checkMeta(meta, `${label}/project.json`, errors)) continue;

    const scenesDir = join(pdir, 'scenes');
    const files = existsSync(scenesDir) ? readdirSync(scenesDir).filter((f) => f.endsWith('.json')).sort() : [];
    const scenes: Scene[] = [];
    for (const file of files) {
      const where = `${label}/scenes/${file}`;
      const data = readJson(join(scenesDir, file), errors, where);
      if (data === undefined) continue;
      const problems = validateScene(data);
      for (const p of problems) errors.push(`${where}: ${p}`);
      if (problems.length > 0) continue;
      const scene = data as Scene;
      if (file !== `${scene.id}.json`) errors.push(`${where}: 文件名应为 ${scene.id}.json`);
      const owner = sceneOwner.get(scene.id);
      if (owner) errors.push(`${where}: 场景 id "${scene.id}" 与 ${owner} 重复（所有项目里都不能重复）`);
      else sceneOwner.set(scene.id, where);
      scenes.push(scene);
    }
    projects.push({ id, meta, scenes });
  }

  projects.sort((a, b) => (a.meta.order ?? 999) - (b.meta.order ?? 999) || a.id.localeCompare(b.id));
  return { projects, errors };
}
