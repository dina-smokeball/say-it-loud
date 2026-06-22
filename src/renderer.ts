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

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function play(name: string): void {
  current = name;
  audio.src = clipUrl(name);
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
