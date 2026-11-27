//! Sleepy — hẹn giờ tắt máy, ngủ, khoá màn hình cho Ubuntu.
//!
//! Kiến trúc:
//! - [`domain`]  kiểu dữ liệu và định dạng thời gian, không phụ thuộc gì.
//! - [`engine`]  logic hẹn giờ thuần, kiểm thử được.
//! - [`sensors`] đọc CPU, mạng, pin, thời gian rảnh, tiến trình.
//! - [`system`]  tắt máy, ngủ, khoá… qua systemd/logind.
//! - [`store`]   lưu dữ liệu ra JSON.
//! - `app`       nối tất cả với Tauri: lệnh IPC, khay, cửa sổ, vòng lặp nền.

mod app;
pub mod domain;
pub mod engine;
pub mod sensors;
pub mod store;
pub mod system;

pub fn run() {
    use app::commands::*;
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            app::show_main(app)
        }))
        .plugin(tauri_plugin_notification::init())
        .setup(|app| app::setup(app))
        .on_window_event(app::on_window_event)
        .invoke_handler(tauri::generate_handler![
            state_get,
            job_start,
            job_cancel,
            job_postpone,
            job_now,
            draft_set,
            settings_set,
            presets_set,
            schedules_set,
            history_clear,
            proc_list,
            proc_check,
            win_action,
        ])
        .run(tauri::generate_context!())
        .expect("không khởi động được Sleepy");
}
