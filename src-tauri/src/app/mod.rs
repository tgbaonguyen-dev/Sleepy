//! Tầng ứng dụng: nối engine với Tauri (lệnh IPC, sự kiện, khay, cửa sổ, thông báo).

mod autostart;
pub mod commands;
mod dispatch;
mod runtime;
mod state;
mod tray;
mod windows;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::Manager;

use crate::audio::AudioController;
use crate::domain::time::now_ms;
use crate::engine::Engine;
use crate::sensors::PlatformSensors;
use crate::store::Store;
use crate::system::{KeepAwake, PlatformPower, PowerControl};

pub use state::AppState;
use state::Core;
pub use windows::{on_window_event, show_main};

/// Khởi tạo khi Tauri đã sẵn sàng: đọc dữ liệu, dựng khay, mở cửa sổ, chạy vòng lặp nền.
pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let dir = match std::env::var_os("SLEEPY_DATA") {
        Some(d) => PathBuf::from(d),
        None => app.path().app_config_dir()?,
    };
    let mut store = Store::open(&dir)?;
    let engine = Engine::restore(&mut store, now_ms());
    let power: Arc<dyn PowerControl> = Arc::new(PlatformPower);
    let caps = power.capabilities();
    let hidden = std::env::args().any(|a| a == "--hidden") || store.data.settings.start_minimized;
    let warn_pending = engine
        .job()
        .and_then(|j| j.remaining(now_ms()))
        .is_some_and(|r| r <= store.data.settings.warn_minutes as i64 * 60_000);
    let keep_awake = store.data.settings.keep_awake && engine.job().is_some();
    let mut awake = KeepAwake::new();
    awake.set(keep_awake)?;

    let custom_tracks: Vec<PathBuf> = store.data.custom_tracks.iter().map(PathBuf::from).collect();
    let audio = AudioController::start(app.handle().clone(), custom_tracks);

    app.manage(AppState {
        core: Mutex::new(Core {
            store,
            engine,
            sensors: PlatformSensors::new(),
            caps,
        }),
        power,
        awake: Mutex::new(awake),
        audio,
    });

    let handle = app.handle().clone();
    tray::create(&handle)?;
    if !hidden {
        show_main(&handle);
    }
    if warn_pending {
        windows::open_warning(&handle);
    }
    runtime::spawn(handle);
    Ok(())
}

pub fn sync_keep_awake(app: &tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let enabled = {
        let core = state.lock();
        core.store.data.settings.keep_awake && core.engine.job().is_some()
    };
    let result = state
        .awake
        .lock()
        .map_err(|error| format!("Không khoá được trạng thái giữ màn hình sáng: {error}"))?
        .set(enabled);
    result
}
