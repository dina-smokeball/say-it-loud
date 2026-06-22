# Say It Loud

A tiny Mac tool that plays audio clips. Other apps and AI agents drop a clip in a
folder and ask it to play. A small floating window shows the recent clips with a
play/stop/replay control and a scrub bar. It never steals focus, and it keeps only
the newest 20 clips, deleting older ones automatically.

## Install

```bash
npm install
npm run build
npm link        # makes `say-it-loud` available in your terminal
```

## Use it

```bash
say-it-loud path            # prints the folder to drop clips in
say-it-loud play hello.m4a  # plays a clip (filename in the folder, or any path)
say-it-loud show            # opens the player window
say-it-loud help            # shows all commands (also --help, -h)
```

Run `say-it-loud help` (or `--help` / `-h`) any time to see the commands.
Supported audio formats: `.m4a`, `.mp3`, `.wav`, `.aac`, `.flac`, `.ogg`, `.opus`.

The window lives in the menu bar (the 🔊 near the clock). Click it to show the
window or quit. Closing the window just hides it; the tool keeps running in the
background.

## How an AI agent uses it

```bash
DIR=$(say-it-loud path)         # find the folder
# ... create $DIR/answer.m4a (text to speech, etc.) ...
say-it-loud play answer.m4a     # say it loud
```

## How it works

- The clips folder is `~/.say-it-loud/audio`.
- `say-it-loud` is a small CLI. `play` and `show` start the Electron app if it
  isn't already running and tell it what to do over a local port (127.0.0.1).
- The Electron app is a background utility: a floating window plus a menu-bar
  icon. It owns the folder, keeps the newest 20 clips, and streams the playing
  clip to the window with range support so the scrub bar can seek.
