// Validates every project and scene under projects/ (spec §6).
// Run: npm run validate   (also runs automatically before npm run build)
import { join } from 'node:path';
import { loadProjects } from './lib/projects.ts';

const { projects, errors } = loadProjects(join(import.meta.dirname, '..'));

if (errors.length > 0) {
  console.error(`校验失败（${errors.length} 个问题）：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
const total = projects.reduce((n, p) => n + p.scenes.length, 0);
console.log(`校验通过：${projects.length} 个项目，${total} 个场景`);
for (const p of projects) console.log(`  ${p.id}  ${p.meta.title}（${p.scenes.length} 个场景）`);
