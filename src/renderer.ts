// The window's logic: show the recent clips and drive the player.

interface Clip {
  name: string;
  mtimeMs: number;
}

// Augments the global Window with the bridge that preload.ts exposes.
// This file is a plain browser script (no imports), so we merge directly.
interface Window {
  api: {
    listClips: () => Promise<Clip[]>;
    addClip: (filePath: string) => Promise<string | null>;
    getPathForFile: (file: File) => string;
    onClipsUpdate: (cb: (clips: Clip[]) => void) => void;
    onPlayFile: (cb: (name: string) => void) => void;
    ready: () => void;
  };
}

const HOST = '127.0.0.1';
const PORT = 48473;
const clipUrl = (name: string) => `http://${HOST}:${PORT}/clip/${encodeURIComponent(name)}`;

const audio = new Audio();
let current: string | null = null;
let clips: Clip[] = [];

const byId = (id: string) => document.getElementById(id)!;
const listEl = byId('list');
const nowEl = byId('now');
const seek = byId('seek') as HTMLInputElement;
const curEl = byId('cur');
const durEl = byId('dur');
const playPause = byId('playpause');
const speedEl = byId('speed') as HTMLSelectElement;

// Playback speed is remembered between sessions, so the next clip you play
// (from the CLI or the list) picks up the speed you last chose.
const SPEED_KEY = 'say-it-loud:speed';

function loadSpeed(): number {
  const saved = parseFloat(localStorage.getItem(SPEED_KEY) || '');
  return isFinite(saved) && saved > 0 ? saved : 1;
}

let speed = loadSpeed();

// Set defaultPlaybackRate too, so loading a new clip keeps the chosen speed
// instead of snapping back to 1×.
function applySpeed(): void {
  audio.defaultPlaybackRate = speed;
  audio.playbackRate = speed;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function play(name: string): void {
  current = name;
  audio.src = clipUrl(name);
  applySpeed();
  audio.play().catch(() => { /* user can press play */ });
  nowEl.textContent = name;
  renderList();
}

function renderList(): void {
  listEl.innerHTML = '';
  if (clips.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No clips yet';
    listEl.appendChild(empty);
    return;
  }
  for (const clip of clips) {
    const item = document.createElement('li');
    item.textContent = clip.name;
    if (clip.name === current) item.classList.add('active');
    item.addEventListener('click', () => play(clip.name));
    listEl.appendChild(item);
  }
}

// Controls
playPause.addEventListener('click', () => {
  if (!audio.src) return;
  if (audio.paused) audio.play();
  else audio.pause();
});
byId('stop').addEventListener('click', () => {
  audio.pause();
  audio.currentTime = 0;
});
byId('replay').addEventListener('click', () => {
  audio.currentTime = 0;
  audio.play();
});
byId('back5').addEventListener('click', () => {
  audio.currentTime = Math.max(0, audio.currentTime - 5);
});
byId('fwd5').addEventListener('click', () => {
  audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
});
seek.addEventListener('input', () => {
  audio.currentTime = parseFloat(seek.value);
});
speedEl.value = String(speed);
applySpeed();
speedEl.addEventListener('change', () => {
  speed = parseFloat(speedEl.value) || 1;
  localStorage.setItem(SPEED_KEY, String(speed));
  applySpeed();
});

// Keep the bar and times in step with the audio
audio.addEventListener('loadedmetadata', () => {
  seek.max = String(audio.duration || 0);
  durEl.textContent = formatTime(audio.duration);
});
audio.addEventListener('timeupdate', () => {
  seek.value = String(audio.currentTime);
  curEl.textContent = formatTime(audio.currentTime);
});
audio.addEventListener('play', () => (playPause.textContent = 'Pause'));
audio.addEventListener('pause', () => (playPause.textContent = 'Play'));
audio.addEventListener('ended', () => (playPause.textContent = 'Play'));

// Wire up to the main process
window.api.onClipsUpdate((updated) => {
  clips = updated;
  renderList();
});
window.api.onPlayFile((name) => play(name));
window.api.listClips().then((initial) => {
  clips = initial;
  renderList();
});
window.api.ready();

// Drag and drop audio files
let dragCounter = 0;

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  if (dragCounter === 1) {
    document.body.classList.add('drag-over');
  }
});

document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter === 0) {
    document.body.classList.remove('drag-over');
  }
});

document.addEventListener('dragover', (e) => {
  e.preventDefault();
});

document.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragCounter = 0;
  document.body.classList.remove('drag-over');

  if (!e.dataTransfer) return;
  const files = Array.from(e.dataTransfer.files);
  let firstPlay: string | null = null;

  for (const file of files) {
    const filePath = window.api.getPathForFile(file);
    if (filePath) {
      const name = await window.api.addClip(filePath);
      if (name && !firstPlay) {
        firstPlay = name;
      }
    }
  }

  if (firstPlay) {
    play(firstPlay);
  }
});
