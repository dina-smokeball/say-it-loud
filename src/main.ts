// The Electron main process: a background utility that owns the folder,
// keeps a small floating window, and lets the CLI tell it what to play.

import { app, BrowserWindow, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { AUDIO_DIR, HOST, PORT, MIME_TYPES, AUDIO_EXTENSIONS } from './shared';
import { ensureBucket, listClips, pruneBucket } from './bucket';

let win: BrowserWindow | null = null;
let isQuitting = false;

// Only one copy of the app should run.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setName('Say It Loud');
  app.whenReady().then(start);
}

function start(): void {
  ensureBucket();
  pruneBucket();
  createWindow();
  startServer();
  watchBucket();

  // Standard Mac behaviour: clicking the Dock icon reopens the window.
  app.on('activate', () => showWindow(true));
  // Our close handler only hides the window, so let Cmd-Q really quit.
  app.on('before-quit', () => {
    isQuitting = true;
  });
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 360,
    height: 520,
    show: false,
    fullscreenable: false,
    resizable: true,
    title: 'Say It Loud',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer.html'));

  // Standard Mac behaviour: closing the window keeps the app alive in the Dock;
  // it only really quits on Cmd-Q.
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win?.hide();
    }
  });
}

// Show the window. When focus is false it appears without stealing your focus.
function showWindow(focus: boolean): void {
  if (!win || win.isDestroyed()) createWindow();
  if (focus) win!.show();
  else win!.showInactive();
}

// --- talking to the window ------------------------------------------------

let rendererReady = false;
let pendingPlay: string | null = null;

ipcMain.handle('clips:list', () => listClips());

ipcMain.handle('clip:add', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;

    const ext = path.extname(filePath).toLowerCase();
    if (!AUDIO_EXTENSIONS.includes(ext)) {
      return null;
    }

    ensureBucket();
    const destName = path.basename(filePath);
    const destPath = path.join(AUDIO_DIR, destName);
    
    fs.copyFileSync(filePath, destPath);
    pruneBucket();
    sendClips();
    
    return destName;
  } catch (err) {
    console.error('Error adding clip via drag and drop:', err);
    return null;
  }
});

ipcMain.on('renderer:ready', () => {
  rendererReady = true;
  sendClips();
  if (pendingPlay) {
    win?.webContents.send('play:file', pendingPlay);
    pendingPlay = null;
  }
});

function sendClips(): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send('clips:update', listClips());
  }
}

// Tell the window to play a clip, or remember it until the window is ready.
function requestPlay(name: string): void {
  if (rendererReady && win && !win.isDestroyed()) {
    win.webContents.send('play:file', name);
  } else {
    pendingPlay = name;
  }
}

// Re-tidy and refresh the list whenever the folder changes.
function watchBucket(): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  fs.watch(AUDIO_DIR, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      pruneBucket();
      sendClips();
    }, 200);
  });
}

// --- local server the CLI talks to ---------------------------------------

function startServer(): void {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

    if (req.method === 'GET' && url.pathname === '/ping') {
      res.writeHead(200);
      res.end('ok');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/show') {
      showWindow(true);
      res.writeHead(200);
      res.end('ok');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/quit') {
      res.writeHead(200);
      res.end('ok');
      isQuitting = true;
      app.quit();
      return;
    }

    if (req.method === 'POST' && url.pathname === '/play') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const { file } = JSON.parse(body || '{}');
          if (file) {
            pruneBucket();
            sendClips();
            showWindow(false);
            requestPlay(path.basename(String(file)));
          }
          res.writeHead(200);
          res.end('ok');
        } catch {
          res.writeHead(400);
          res.end('bad request');
        }
      });
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/clip/')) {
      serveClip(decodeURIComponent(url.pathname.slice('/clip/'.length)), req, res);
      return;
    }

    res.writeHead(404);
    res.end('not found');
  });

  server.listen(PORT, HOST);
}

// Stream a clip to the window, honouring Range requests so the scrub bar works.
function serveClip(name: string, req: http.IncomingMessage, res: http.ServerResponse): void {
  const safeName = path.basename(name); // never escape the folder
  const file = path.join(AUDIO_DIR, safeName);
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    res.end();
    return;
  }

  const stat = fs.statSync(file);
  const type = MIME_TYPES[path.extname(safeName).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range;

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    let start = match && match[1] ? parseInt(match[1], 10) : 0;
    let end = match && match[2] ? parseInt(match[2], 10) : stat.size - 1;
    if (isNaN(start)) start = 0;
    if (isNaN(end) || end >= stat.size) end = stat.size - 1;
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': type,
    });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Content-Type': type,
    });
    fs.createReadStream(file).pipe(res);
  }
}
