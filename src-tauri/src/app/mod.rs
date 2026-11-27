//! Tầng ứng dụng: nối engine với Tauri (lệnh IPC, sự kiện, khay, cửa sổ, thông báo).

mod autostart;
mod state;
mod windows;

pub use state::AppState;
pub use windows::{on_window_event, show_main};
