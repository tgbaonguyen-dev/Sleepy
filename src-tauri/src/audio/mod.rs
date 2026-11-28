//! Hệ thống phát và trộn âm thanh nền bằng Rust (không phụ thuộc Web Audio).

pub mod catalog;
pub mod decoder;
pub mod mixer;

use std::path::{Path, PathBuf};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Manager};

use mixer::MixerEngine;
pub use mixer::{AudioCmd, AudioStateSnapshot};

pub struct AudioController {
    tx: Sender<AudioCmd>,
    snapshot: Arc<Mutex<AudioStateSnapshot>>,
}

impl AudioController {
    pub fn start(app: AppHandle, custom_tracks: Vec<PathBuf>) -> Self {
        let sounds_dir = resolve_sounds_dir(&app);
        let emit_app = app.clone();
        let on_change = Arc::new(move |snap: AudioStateSnapshot| {
            emit_app.emit("audio", snap).ok();
        });
        let (tx, snapshot) = MixerEngine::spawn(sounds_dir, custom_tracks, on_change);
        Self { tx, snapshot }
    }

    pub fn snapshot(&self) -> AudioStateSnapshot {
        self.snapshot.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn send(&self, cmd: AudioCmd) {
        let _ = self.tx.send(cmd);
    }
}

impl Drop for AudioController {
    fn drop(&mut self) {
        let _ = self.tx.send(AudioCmd::Shutdown);
    }
}

/// Finds the bundled `sounds/` folder.
///
/// Installed builds ship the files as Tauri resources (`bundle.resources` copies
/// `src-tauri/sounds/` to `sounds/`, keeping subfolders such as `lofi/`): `/usr/lib/Sleepy/sounds` for the .deb, inside
/// the AppImage mount, and next to `Sleepy.exe` for the Windows installer. The
/// source-tree path is only a fallback for debug builds, so a release binary never
/// points at the machine it was compiled on.
fn resolve_sounds_dir(app: &AppHandle) -> PathBuf {
    let mut candidates = Vec::new();
    if let Ok(res_dir) = app.path().resource_dir() {
        candidates.push(res_dir.join("sounds"));
    }
    if let Some(exe_dir) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
    {
        candidates.push(exe_dir.join("sounds"));
    }
    if cfg!(debug_assertions) {
        candidates.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("sounds"));
        candidates.push(PathBuf::from("src-tauri").join("sounds"));
    }

    let first = candidates
        .first()
        .cloned()
        .unwrap_or_else(|| PathBuf::from("sounds"));
    candidates.into_iter().find(|p| p.is_dir()).unwrap_or_else(|| {
        eprintln!(
            "sleepy: bundled sounds folder not found, expected {}",
            first.display()
        );
        first
    })
}
