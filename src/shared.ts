// Settings shared by the CLI, the Electron main process and the window.

import * as os from 'os';
import * as path from 'path';

// Where clips live. ~/.say-it-loud/audio is the "bucket" other apps drop files in.
export const ROOT_DIR = path.join(os.homedir(), '.say-it-loud');
export const AUDIO_DIR = path.join(ROOT_DIR, 'audio');

// We only ever keep the newest few clips; older ones are deleted.
export const MAX_FILES = 20;

// The running app listens here so the CLI can tell it to play.
export const HOST = '127.0.0.1';
export const PORT = 48473;

// File types we treat as audio. These are the ones the window's player can
// actually decode; formats like AIFF/CAF are left out because it can't play them.
export const AUDIO_EXTENSIONS = ['.m4a', '.mp3', '.wav', '.aac', '.flac', '.ogg', '.opus'];

// Content types used when streaming a clip to the window.
export const MIME_TYPES: Record<string, string> = {
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
};
