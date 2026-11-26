// Loads every scenes/*.json at build time. Scenes are validated by
// scripts/validate-scenes.ts before each build, so they are trusted here.
import type { Scene } from './scene.ts';

const modules = import.meta.glob<Scene>('../scenes/*.json', { eager: true, import: 'default' });

export const scenes: Scene[] = Object.values(modules).sort((a, b) => a.id.localeCompare(b.id));
