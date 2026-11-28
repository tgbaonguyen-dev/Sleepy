<p align="center"><img src="src-tauri/icons/icon.png" width="96" alt=""></p>

<h1 align="center">Sleepy</h1>

<p align="center">A shutdown, sleep and lock-screen timer for Ubuntu, with a built-in sleep-sound mixer. Lightweight and written in Rust (Tauri 2).</p>

---

Pick what should happen and when, then let the machine wind down on its own. Besides plain timers,
Sleepy can wait until a **download finishes**, the **machine goes idle**, **you step away**, an **app closes**
or the **battery runs low**.

## Features

- **6 actions:** shut down, restart, suspend, hibernate, lock screen, log out. Actions the system
  does not allow are disabled, with the reason shown.
- **7 trigger types:** after a duration · at a time · no mouse/keyboard activity · network traffic drops
  (download finished) · CPU goes idle · an app exits · battery below a level.
- **Advance warning** in a small corner window: postpone +5/+15 minutes, cancel, or press and hold to
  run it now; with a soft chime.
- **Safe by design:** "do it now" needs a press-and-hold (or a confirmation from the keyboard),
  deletes can be undone, and a dry-run mode shows what would happen without doing it.
- **Sleep sounds:** mix rain, nature, noise and more, play a Lo-Fi playlist or your own files, sync a
  YouTube player, and fade out over the last minutes of the timer.
- **System tray:** the icon is a countdown ring; the menu has quick timers, presets, postpone and cancel.
- **Presets**, **weekly repeating schedules** and a **history log** with result filters.
- **Keyboard first:** `Ctrl+K` command palette, `Ctrl+1…6` to switch views, `Ctrl+Enter` to start,
  `Ctrl+.` to cancel, `Ctrl+Z` to undo, `?` for all shortcuts.
- **Pre-run command** (e.g. `playerctl pause`), **keep the system awake** while a timer runs, and
  **start with the system**.
- A single dark theme with an animated night sky.

## Install

Download the `.deb` or `.AppImage` from Releases, then:

```bash
sudo apt install ./Sleepy_2.0.0_amd64.deb
# or
chmod +x Sleepy_2.0.0_amd64.AppImage && ./Sleepy_2.0.0_amd64.AppImage
```

Sleepy targets Ubuntu / GNOME on Linux (systemd + logind, PipeWire or PulseAudio).

## Build from source

```bash
# System libraries (Ubuntu 22.04+)
sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev
# Rust: https://rustup.rs

npm install          # only to get the Tauri CLI
npm run dev          # run in development
npm run build        # .deb + .AppImage in src-tauri/target/release/bundle/
```

UI checks run headless with Playwright against a mocked IPC layer:

```bash
node tools/preview/check-layout.js   # every view × window size: no overflow, clipping or console errors
node tools/preview/check-dial.js     # dial dragging and keyboard control
node tools/preview/check-undo.js     # undo stack
```

## Architecture

The Rust core is split into clear layers (`domain` → `engine` → `app`); the timer logic is pure and tested.
Details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The UI design system and audit live in
[docs/ui-ux-audit.md](docs/ui-ux-audit.md).

```
src-tauri/src/
├── domain/    Action, Trigger, Job, time formatting
├── engine/    timer engine + tests
├── sensors/   CPU, network, battery, idle time, processes
├── system/    systemd / logind, keep-awake
├── audio/     sound catalog, decoder, mixer
├── store/     JSON persistence
└── app/       IPC commands, tray, windows, background loop
ui/            HTML/CSS/JS interface (no build step)
tools/preview/ Playwright screenshots and UI checks
```

## Sound and image credits

- **Ambient sounds & binaural beats (32 files):** from the open-source project [remvze/moodist](https://github.com/remvze/moodist).
- **Lo-Fi music (23 tracks):** from [btahir/open-lofi](https://github.com/btahir/open-lofi), released under **CC0 1.0 Universal (Public Domain)**.
- **Brown / pink / white noise:** synthesized in Rust in `src-tauri/src/audio/decoder.rs`.
- **Sound card artwork:** from [riccardobertolini/lofi-music](https://github.com/riccardobertolini/lofi-music).

The full file list is in [ui/sounds/CREDITS.md](ui/sounds/CREDITS.md).

## License

MIT © Nguyen Tran Gia Bao. The Be Vietnam Pro font is licensed under the SIL OFL 1.1 (`ui/fonts/be-vietnam-pro/LICENSE`).
