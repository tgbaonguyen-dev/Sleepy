//! Nghỉ — hẹn giờ tắt máy, ngủ, khoá màn hình cho Ubuntu.

pub mod domain;
pub mod store;

pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("không khởi động được Nghỉ");
}
