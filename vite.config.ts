import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig } from 'vite';
import type { Plugin, ResolvedConfig } from 'vite';

/** All files under dir, as paths relative to it with forward slashes. */
function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split('\\').join('/'));
}

/**
 * Writes dist/sw.js from src/sw/sw.js after the build, filling in the list of
 * files to cache for offline use and a version hash of their contents.
 */
function serviceWorker(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'sprechprobe-service-worker',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      const outDir = config.build.outDir;
      const files = listFiles(outDir).filter((f) => f !== 'sw.js');
      const template = readFileSync(join(config.root, 'src', 'sw', 'sw.js'), 'utf8');
      // The version covers every file and the worker's own code.
      const hash = createHash('sha256').update(template);
      for (const f of files.sort()) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      // './' is the page itself (index.html), used for every navigation.
      const precache = ['./', ...files];
      const source = template
        .replace("const VERSION = '__VERSION__';", `const VERSION = ${JSON.stringify(version)};`)
        .replace('const FILES = __FILES__;', `const FILES = ${JSON.stringify(precache)};`);
      if (source.includes("'__VERSION__'") || source.includes('= __FILES__')) {
        throw new Error('sw.js template placeholders not found');
      }
      writeFileSync(join(outDir, 'sw.js'), source);
      const bytes = files.reduce((n, f) => n + readFileSync(join(outDir, f)).length, 0);
      config.logger.info(`sw.js: ${precache.length} files, ${(bytes / 1024).toFixed(0)} kB, version ${version}`);
    },
  };
}

// GitHub Pages serves the site at /Sprechprobe/; `vite preview` mirrors that.
// The dev server uses /.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/Sprechprobe/' : '/',
  plugins: [serviceWorker()],
}));
