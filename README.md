<p align="center"><img src="src-tauri/icons/icon.png" width="96" alt="Sleepy icon"></p>

<h1 align="center">Sleepy</h1>

<p align="center">A beautiful shutdown timer for Ubuntu — shut down, sleep or lock your PC on your terms. Built with Rust and Tauri.</p>

---

Sleepy is a modern replacement for qShutdown. Pick what should happen, pick when, and let your
computer rest on its own. Beyond plain timers, Sleepy can wait until a **download finishes**, the
**CPU goes quiet**, **you step away**, or **an app closes**.

> The interface is in Vietnamese.

## Features

- **Six actions** — shut down, restart, suspend, hibernate, lock screen, log out. Actions your
  system doesn't allow are greyed out automatically (checked through logind).
- **Seven triggers** — after a duration · at a set time · when idle · when a download finishes
  (network below X KB/s for N minutes) · when the CPU is idle · when an app exits · when the battery runs low.
- **Heads-up popup** in the corner of the screen before anything happens: snooze 5/15 minutes,
  cancel, or run now, with a soft chime.
- **System tray** — the icon is a live countdown ring; the menu offers quick timers, presets,
  snooze and cancel.
- **Presets**, **weekly schedules** and a **history log**.
- **Two themes** — Night (starry sky, Milky Way, shooting stars) and Light (warm and flat).
- **Dry-run mode** (never really shuts down), a **pre-action command** (e.g. `playerctl pause`)
  and **launch at login**.

## Install

Grab the `.deb` or `.AppImage` from Releases (or the CI artifacts), then:

```bash
sudo apt install ./Sleepy_2.0.0_amd64.deb
# or
chmod +x Sleepy_2.0.0_amd64.AppImage && ./Sleepy_2.0.0_amd64.AppImage
```

Run it from your app menu or with `sleepy`.

## Build from source

```bash
# System libraries (Ubuntu 22.04+)
sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev
# Rust toolchain: https://rustup.rs

npm install          # only for the Tauri CLI
npm run dev          # run in development
npm run build        # produces .deb + .AppImage in src-tauri/target/release/bundle/
```

Run the checks:

```bash
cd src-tauri
cargo test
cargo clippy --all-targets -- -D warnings
cargo fmt --check
```

## Architecture

A layered Rust core (`domain` → `engine` → `app`) with pure, fully tested timer logic. The UI is
static HTML/CSS/JS talking to Rust over Tauri IPC. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
src-tauri/src/
├── domain/    actions, triggers, jobs, time formatting
├── engine/    timer engine + tests
├── sensors/   CPU, network, battery, idle time, processes
├── system/    systemd / logind power control
├── store/     JSON persistence
└── app/       IPC commands, tray, windows, background loop
ui/            HTML/CSS/JS interface
```

## Data

Settings, presets, schedules and history live in `~/.config/dev.giabao.sleepy/sleepy.json`
(override with the `SLEEPY_DATA` environment variable).

## License

MIT © Nguyen Tran Gia Bao. The bundled Be Vietnam Pro font is licensed under the SIL Open Font
License 1.1 (`ui/fonts/be-vietnam-pro/LICENSE`).
