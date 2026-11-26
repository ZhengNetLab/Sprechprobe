import { defineConfig } from 'vite';

// GitHub Pages serves the site at /Sprechprobe/; the dev server uses /.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Sprechprobe/' : '/',
}));
