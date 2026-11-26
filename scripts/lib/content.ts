// Turns projects/ + audio/ into the files the app downloads (see src/project.ts).
// Used by vite.config.ts: written to dist/content/ on build, served from
// memory by the dev server.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AudioManifest } from '../../src/audio.ts';
import type { Catalog, ProjectData } from '../../src/project.ts';
import { audioFilesOf } from '../../src/project.ts';
import { loadProjects } from './projects.ts';

export interface BuiltContent {
  /** JSON files by path under content/. */
  json: Map<string, string>;
  /** Audio file names to copy from audio/ to content/audio/. */
  audio: Set<string>;
}

export function buildContent(root: string): BuiltContent {
  const { projects, errors } = loadProjects(root);
  if (errors.length > 0) throw new Error(`projects/ 校验失败：\n  - ${errors.join('\n  - ')}`);

  const audioDir = join(root, 'audio');
  const manifestPath = join(audioDir, 'manifest.json');
  const manifest = (existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}) as AudioManifest;

  const json = new Map<string, string>();
  const audio = new Set<string>();
  const catalog: Catalog = { projects: [] };
  const missing: string[] = [];

  for (const p of projects) {
    const audioMap: ProjectData['audio'] = {};
    for (const scene of p.scenes) {
      const lines = manifest[scene.id];
      if (!lines || lines.length !== scene.lines.length) missing.push(`${p.id}/${scene.id}`);
      else audioMap[scene.id] = lines;
    }
    const body = {
      id: p.id,
      title: p.meta.title,
      description: p.meta.description ?? '',
      scenes: p.scenes,
      audio: audioMap,
    };
    const version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12);
    const data: ProjectData = { ...body, version };

    let audioBytes = 0;
    for (const file of audioFilesOf(data)) {
      const path = join(audioDir, file);
      if (!existsSync(path)) {
        missing.push(`${p.id}: audio/${file}`);
        continue;
      }
      audio.add(file);
      audioBytes += statSync(path).size;
    }

    json.set(`projects/${p.id}.json`, JSON.stringify(data));
    catalog.projects.push({
      id: p.id,
      title: data.title,
      description: data.description,
      version,
      sceneCount: p.scenes.length,
      audioBytes,
    });
  }

  if (missing.length > 0) {
    throw new Error(`这些场景或文件缺少音频，先运行 npm run audio：\n  - ${missing.join('\n  - ')}`);
  }
  json.set('catalog.json', JSON.stringify(catalog));
  return { json, audio };
}
