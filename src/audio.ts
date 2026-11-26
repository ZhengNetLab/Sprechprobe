// Audio lookup for scene lines. audio/manifest.json (written by
// scripts/generate-audio.ts) lists, per scene id, one entry per line in the
// same order as scene.lines; the build copies each project's part of it into
// that project's data file. My lines have one entry per voice variant
// (male / female), other lines a single entry.
import type { ProjectData } from './project.ts';

export type MyVoice = 'male' | 'female';

export interface LineAudio {
  file: string;
  /** Seconds, rounded to 0.1. */
  duration: number;
}

export type ManifestLine = LineAudio | Record<MyVoice, LineAudio>;
export type AudioManifest = Record<string, ManifestLine[]>;

/** URL of an audio file. Offline, the service worker answers it from the phone's copy. */
export function audioUrl(file: string): string {
  return `${import.meta.env.BASE_URL}content/audio/${file}`;
}

/** The audio for one line; `myVoice` picks the variant for my lines. */
export function lineAudio(
  project: ProjectData,
  sceneId: string,
  lineIndex: number,
  myVoice: MyVoice,
): (LineAudio & { url: string }) | undefined {
  const line = project.audio[sceneId]?.[lineIndex];
  if (!line) return undefined;
  const entry = 'file' in line ? (line as LineAudio) : line[myVoice];
  return entry ? { ...entry, url: audioUrl(entry.file) } : undefined;
}
