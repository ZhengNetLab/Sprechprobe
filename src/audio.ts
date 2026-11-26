// Audio lookup for scene lines. audio/manifest.json is written by
// scripts/generate-audio.ts; for each scene id it lists one entry per line,
// in the same order as scene.lines. My lines have one entry per voice
// variant (male / female), other lines a single entry.
import manifestJson from '../audio/manifest.json';

export type MyVoice = 'male' | 'female';

export interface LineAudio {
  file: string;
  /** Seconds, rounded to 0.1. */
  duration: number;
}

export type ManifestLine = LineAudio | Record<MyVoice, LineAudio>;
export type AudioManifest = Record<string, ManifestLine[]>;

const manifest = manifestJson as AudioManifest;

// Vite fingerprints each mp3 and gives back its final URL.
const urls = import.meta.glob<string>('../audio/*.mp3', { eager: true, query: '?url', import: 'default' });

/** The audio for one line; `myVoice` picks the variant for my lines. */
export function lineAudio(
  sceneId: string,
  lineIndex: number,
  myVoice: MyVoice,
): (LineAudio & { url: string }) | undefined {
  const line = manifest[sceneId]?.[lineIndex];
  const entry = line && ('file' in line ? (line as LineAudio) : line[myVoice]);
  const url = entry && urls[`../audio/${entry.file}`];
  return entry && url ? { ...entry, url } : undefined;
}
