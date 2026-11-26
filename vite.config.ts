import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig } from 'vite';
import type { Plugin, ResolvedConfig } from 'vite';
import { buildContent } from './scripts/lib/content.ts';

/** All files under dir, as paths relative to it with forward slashes. */
function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split('\\').join('/'));
}

/**
 * Publishes projects/ + audio/ under content/ (catalog, one file per project,
 * audio). On build the files go into dist/content/; the dev server builds
 * them on each request so edits show up after a reload.
 */
function content(): Plugin {
  let root = process.cwd();
  return {
    name: 'sprechprobe-content',
    configResolved(config) {
      root = config.root;
    },
    generateBundle() {
      const built = buildContent(root);
      for (const [path, text] of built.json) {
        this.emitFile({ type: 'asset', fileName: `content/${path}`, source: text });
      }
      for (const file of built.audio) {
        this.emitFile({ type: 'asset', fileName: `content/audio/${file}`, source: readFileSync(join(root, 'audio', file)) });
      }
    },
    configureServer(server) {
      server.middlewares.use('/content/', (req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0].replace(/^\//, ''));
        try {
          if (path.startsWith('audio/') && /^audio\/[0-9a-f]+\.mp3$/.test(path)) {
            res.setHeader('Content-Type', 'audio/mpeg');
            res.end(readFileSync(join(root, path)));
            return;
          }
          const text = buildContent(root).json.get(path);
          if (text === undefined) return next();
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(text);
        } catch (e) {
          res.statusCode = 500;
          res.end(String(e));
        }
      });
    },
  };
}

/**
 * Writes dist/sw.js from src/sw/sw.js after the build, filling in the app
 * files to cache for offline use (not content/: the app downloads projects
 * itself) and a version hash of their contents.
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
      const files = listFiles(outDir).filter((f) => f !== 'sw.js' && !f.startsWith('content/'));
      const template = readFileSync(join(config.root, 'src', 'sw', 'sw.js'), 'utf8');
      // The version covers every app file and the worker's own code.
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
      config.logger.info(`sw.js: ${precache.length} app files, ${(bytes / 1024).toFixed(0)} kB, version ${version}`);
    },
  };
}

// GitHub Pages serves the site at /Sprechprobe/; `vite preview` mirrors that.
// The dev server uses /.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/Sprechprobe/' : '/',
  plugins: [content(), serviceWorker()],
}));
