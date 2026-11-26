// Validates every project and scene under projects/ (spec §6), plus the
// checks across scenes in scripts/lib/checks.ts. Errors fail; warnings are
// only printed.
// Run: npm run validate                   (also runs before npm run build)
//      npm run validate -- --with-drafts   also checks drafts/ against everything
import { join } from 'node:path';
import { loadDrafts, loadProjects } from './lib/projects.ts';
import { checkAll, collectScenes } from './lib/checks.ts';

const root = join(import.meta.dirname, '..');
const withDrafts = process.argv.includes('--with-drafts');

const { projects, errors } = loadProjects(root);
const { drafts, errors: draftErrors } = withDrafts ? loadDrafts(root) : { drafts: [], errors: [] };
errors.push(...draftErrors);
const checked = checkAll(collectScenes(projects, drafts));
errors.push(...checked.errors);

if (checked.warnings.length > 0) {
  console.warn(`警告（${checked.warnings.length} 条，不影响通过）：`);
  for (const w of checked.warnings) console.warn(`  - ${w}`);
}
if (errors.length > 0) {
  console.error(`校验失败（${errors.length} 个问题）：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
const total = projects.reduce((n, p) => n + p.scenes.length, 0);
console.log(`校验通过：${projects.length} 个项目，${total} 个场景${withDrafts ? `，${drafts.length} 个草稿` : ''}`);
for (const p of projects) console.log(`  ${p.id}  ${p.meta.title}（${p.scenes.length} 个场景）`);
