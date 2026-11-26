// Validates every scenes/*.json against the rules in spec §6.
// Run: npm run validate   (also runs automatically before npm run build)
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateScenes } from '../src/scene.ts';

const dir = join(import.meta.dirname, '..', 'scenes');
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

const entries: { file: string; data: unknown }[] = [];
const errors: string[] = [];

for (const file of files) {
  try {
    entries.push({ file, data: JSON.parse(readFileSync(join(dir, file), 'utf8')) });
  } catch (e) {
    errors.push(`${file}: JSON 格式错误 — ${(e as Error).message}`);
  }
}

errors.push(...validateScenes(entries));

// The file name should match the id, so a scene is easy to find.
for (const { file, data } of entries) {
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id === 'string' && file !== `${id}.json`) {
    errors.push(`${file}: 文件名应为 ${id}.json`);
  }
}

if (errors.length > 0) {
  console.error(`场景校验失败（${errors.length} 个问题）：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`场景校验通过：${files.length} 个场景`);
