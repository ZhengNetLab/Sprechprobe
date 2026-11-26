// Writes docs/phrase-index.md: every scene with its focus_zh and all my lines,
// to check new scenes against before writing them (STYLE.md).
// Generated file, not committed.
// Run: npm run index                    projects/ only
//      npm run index -- --with-drafts   also drafts/
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Scene } from '../src/scene.ts';
import { loadDrafts, loadProjects } from './lib/projects.ts';

const root = join(import.meta.dirname, '..');
const withDrafts = process.argv.includes('--with-drafts');

const { projects, errors } = loadProjects(root);
const { drafts, errors: draftErrors } = withDrafts ? loadDrafts(root) : { drafts: [], errors: [] };
const problems = errors.length + draftErrors.length;
if (problems > 0) console.warn(`有 ${problems} 个问题，出问题的文件不在索引里（npm run validate 查看详情）`);

function sceneBlock(scene: Scene, draft: boolean): string[] {
  const out = [`### ${scene.id}${draft ? '（草稿）' : ''}`, '', `${scene.title} — ${scene.focus_zh}`, ''];
  for (const l of scene.lines) if (l.role === 'me') out.push(`- ${l.de}`);
  out.push('');
  return out;
}

const projectIds = [...new Set([...projects.map((p) => p.id), ...drafts.map((d) => d.project)])];
const out = [
  '# 句库索引',
  '',
  `> 由 \`npm run index${withDrafts ? ' -- --with-drafts' : ''}\` 生成，勿手改。写新场景前先查这里，避免和已有的台词重复。`,
  '',
];
let sceneCount = 0;
let myCount = 0;
for (const id of projectIds) {
  const project = projects.find((p) => p.id === id);
  const scenes = project?.scenes ?? [];
  const own = drafts.filter((d) => d.project === id).map((d) => d.scene);
  out.push(`## ${id}${project ? ` · ${project.meta.title}` : ''}`, '');
  for (const s of scenes) out.push(...sceneBlock(s, false));
  for (const s of own) out.push(...sceneBlock(s, true));
  for (const s of [...scenes, ...own]) {
    sceneCount++;
    myCount += s.lines.filter((l) => l.role === 'me').length;
  }
}

mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs', 'phrase-index.md'), out.join('\n'));
console.log(`已写入 docs/phrase-index.md：${sceneCount} 个场景，${myCount} 句我的台词`);
