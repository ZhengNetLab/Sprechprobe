// Content format the build publishes and the phone downloads.
//
//   content/catalog.json          list of all projects (Catalog)
//   content/projects/<id>.json    one project with its scenes and audio map
//   content/audio/<hash>.mp3      audio, shared by all projects
//
// `version` is a hash of the project's data: when it changes, sync downloads
// the project again. Audio files never change (their name is a content hash),
// so sync only fetches the ones the phone doesn't have yet.
import type { Scene } from './scene.ts';
import type { ManifestLine } from './audio.ts';

export interface CatalogEntry {
  id: string;
  title: string;
  description: string;
  version: string;
  sceneCount: number;
  /** Total size of the project's audio files, for "约 2.3 MB". */
  audioBytes: number;
}

export interface Catalog {
  projects: CatalogEntry[];
}

export interface ProjectData {
  id: string;
  title: string;
  description: string;
  version: string;
  scenes: Scene[];
  /** Per scene id: one entry per line, same order as scene.lines. */
  audio: Record<string, ManifestLine[]>;
}

/** Every audio file a project needs (both voice variants of my lines). */
export function audioFilesOf(project: ProjectData): string[] {
  const files = new Set<string>();
  for (const lines of Object.values(project.audio)) {
    for (const line of lines) {
      if ('file' in line) files.add((line as { file: string }).file);
      else for (const v of Object.values(line)) files.add(v.file);
    }
  }
  return [...files];
}
