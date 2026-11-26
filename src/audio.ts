// Audio lookup for scene lines. audio/manifest.json is written by
// scripts/generate-audio.ts; for each scene id it lists one entry per line,
// in the same order as scene.lines.
import manifestJson from '../audio/manifest.json';

export interface LineAudio {
  file: string;
  /** Seconds, rounded to 0.1. */
  duration: number;
}

export type AudioManifest = Record<string, LineAudio[]>;

const manifest = manifestJson as AudioManifest;

// Vite fingerprints each mp3 and gives back its final URL.
const urls = import.meta.glob<string>('../audio/*.mp3', { eager: true, query: '?url', import: 'default' });

export function lineAudio(sceneId: string, lineIndex: number): (LineAudio & { url: string }) | undefined {
  const entry = manifest[sceneId]?.[lineIndex];
  const url = entry && urls[`../audio/${entry.file}`];
  return entry && url ? { ...entry, url } : undefined;
}
