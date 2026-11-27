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
pub mod audio;
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
            audio_state,
            audio_toggle_play,
            audio_toggle_channel,
            audio_set_volume,
            audio_set_master,
            audio_set_fade,
            audio_apply_preset,
            audio_skip_lofi,
            audio_prev_lofi,
            audio_select_lofi,
            audio_seek_lofi,
            audio_set_pan,
            audio_toggle_swell,
            audio_shuffle_mix,
            audio_clear_all,
            audio_apply_custom_mix,
            audio_save_mix,
            audio_delete_mix,
            audio_pick_folder,
            audio_pick_files,
            audio_remove_custom_track,
            yt_open,
            yt_hide,
            yt_close,
            yt_status,
        ])
        .run(tauri::generate_context!())
        .expect("không khởi động được Sleepy");
}
