//! Nghỉ — hẹn giờ tắt máy cho Ubuntu.

pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("không khởi động được Nghỉ");
}
