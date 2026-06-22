#!/usr/bin/env node
// The command other apps and AI agents call from the terminal.
//
//   say-it-loud path           -> prints the folder to drop clips in
//   say-it-loud play <file>    -> plays a clip in the floating window
//   say-it-loud show           -> opens the window (e.g. to replay something)

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import { spawn } from 'child_process';
import { AUDIO_DIR, HOST, PORT } from './shared';
import { ensureBucket, pruneBucket } from './bucket';

function usage(): void {
  console.log(`say-it-loud — drop audio clips in a folder and play them

Usage:
  say-it-loud path            Print the folder where clips go
  say-it-loud play <file>     Play a clip (a filename in the folder, or any path)
  say-it-loud show            Open the player window
  say-it-loud help            Show this help (also: --help, -h)

Audio formats: .m4a, .mp3, .wav, .aac, .flac, .ogg, .opus
The folder keeps only the newest 20 clips; older ones are deleted automatically.`);
}

async function main(): Promise<void> {
  const command = process.argv[2];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    usage();
    return;
  }

  switch (command) {
    case 'path':
      console.log(ensureBucket());
      break;
    case 'play': {
      const file = process.argv[3];
      if (!file) {
        console.error('play needs a file, e.g. say-it-loud play hello.m4a');
        process.exit(1);
      }
      await play(file);
      break;
    }
    case 'show':
      await ensureApp();
      await get('/show');
      break;
    default:
      console.error(`unknown command: ${command}\n`);
      usage();
      process.exit(1);
  }
}

// Put the clip in the folder (copying it in if it lives elsewhere), then play it.
async function play(fileArg: string): Promise<void> {
  ensureBucket();
  const name = path.basename(fileArg);
  const inBucket = path.join(AUDIO_DIR, name);

  const givenAsPath = fileArg.includes(path.sep);
  if (givenAsPath && path.resolve(fileArg) !== inBucket) {
    if (!fs.existsSync(fileArg)) {
      console.error(`no such file: ${fileArg}`);
      process.exit(1);
    }
    fs.copyFileSync(fileArg, inBucket);
  }

  if (!fs.existsSync(inBucket)) {
    console.error(`no such clip in the folder: ${name}`);
    process.exit(1);
  }

  pruneBucket();
  await ensureApp();
  await post('/play', { file: name });
  console.log(`Playing ${name}`);
}

// Start the window app if it isn't already running, and wait until it answers.
async function ensureApp(): Promise<void> {
  if (await ping()) return;
  startApp();
  await waitForServer();
}

// The installed app, if it's there. We launch that so the Dock shows the real
// "Say It Loud" app; otherwise we fall back to running it from the project.
function installedAppPath(): string | null {
  const candidates = [
    '/Applications/Say It Loud.app',
    path.join(os.homedir(), 'Applications', 'Say It Loud.app'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function startApp(): void {
  const installed = installedAppPath();
  if (installed) {
    // `open` launches through macOS, so the app gets a clean environment and
    // shows up as the real app in the Dock.
    spawn('open', [installed], { detached: true, stdio: 'ignore' }).unref();
    return;
  }

  // Dev fallback: run straight from the project with the local Electron.
  // Some terminals (e.g. inside VS Code) set ELECTRON_RUN_AS_NODE=1, which would
  // make Electron boot as plain Node and never show the window. Strip it.
  const electronPath = require('electron') as unknown as string;
  const projectRoot = path.join(__dirname, '..');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  spawn(electronPath, [projectRoot], { detached: true, stdio: 'ignore', env }).unref();
}

async function waitForServer(timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await ping()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('the player window did not start in time');
}

function ping(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      { host: HOST, port: PORT, path: '/ping', method: 'GET', timeout: 500 },
      (res) => {
        res.resume();
        resolve(true);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

function post(pathname: string, body: object): Promise<void> {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: HOST,
        port: PORT,
        path: pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      },
      (res) => {
        res.resume();
        res.on('end', resolve);
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(pathname: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: HOST, port: PORT, path: pathname, method: 'GET' }, (res) => {
      res.resume();
      res.on('end', resolve);
    });
    req.on('error', reject);
    req.end();
  });
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
