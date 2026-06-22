// Reading and tidying the clips folder. This is the only place that touches it.

import * as fs from 'fs';
import * as path from 'path';
import { AUDIO_DIR, MAX_FILES, AUDIO_EXTENSIONS } from './shared';

export interface Clip {
  name: string;
  mtimeMs: number;
}

// Make sure the folder exists and hand back its path.
export function ensureBucket(): string {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  return AUDIO_DIR;
}

// All audio clips in the folder, newest first.
export function listClips(): Clip[] {
  ensureBucket();
  const clips: Clip[] = [];
  for (const entry of fs.readdirSync(AUDIO_DIR, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!AUDIO_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) continue;
    const stat = fs.statSync(path.join(AUDIO_DIR, entry.name));
    clips.push({ name: entry.name, mtimeMs: stat.mtimeMs });
  }
  clips.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return clips;
}

// Keep only the newest MAX_FILES clips; delete the rest.
export function pruneBucket(): void {
  const extra = listClips().slice(MAX_FILES);
  for (const clip of extra) {
    try {
      fs.unlinkSync(path.join(AUDIO_DIR, clip.name));
    } catch {
      // If something else already removed it, that's fine.
    }
  }
}
