//! Lệnh IPC mà giao diện gọi qua `window.__TAURI__.core.invoke`.

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, State, WebviewWindow};

use super::state::FullState;
use super::{autostart, dispatch, sync_keep_awake, AppState};
use crate::audio::AudioCmd;
use crate::domain::time::now_ms;
use crate::domain::{Action, Trigger};
use crate::sensors::SensorSource;
use crate::store::{new_id, MixPreset, Preset, Schedule, Settings};

#[derive(Serialize)]
pub struct StartResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tauri::command]
pub fn state_get(state: State<'_, AppState>) -> FullState {
    state.lock().full_state()
}

#[tauri::command]
pub fn job_start(
    app: AppHandle,
    state: State<'_, AppState>,
    action: Action,
    trigger: Trigger,
    source: Option<String>,
) -> StartResult {
    let result = {
        let mut core = state.lock();
        let core = &mut *core;
        let source = source.unwrap_or_else(|| "manual".into());
        let r = core.engine.start(
            &mut core.store,
            action,
            trigger.clone(),
            &source,
            now_ms(),
            &core.sensors,
        );
        if r.is_ok() {
            core.store.data.draft = serde_json::json!({ "action": action, "trigger": trigger });
            core.store.save().ok();
        }
        r
    };
    match result {
        Ok(events) => {
            dispatch::handle(&app, events);
            let warning = sync_keep_awake(&app).err();
            StartResult {
                ok: true,
                error: warning,
            }
        }
        Err(e) => StartResult {
            ok: false,
            error: Some(e),
        },
    }
}

#[tauri::command]
pub fn job_cancel(app: AppHandle, state: State<'_, AppState>) {
    let events = {
        let mut core = state.lock();
        let core = &mut *core;
        core.engine.cancel(&mut core.store, "Đã huỷ")
    };
    dispatch::handle(&app, events);
    if let Err(error) = sync_keep_awake(&app) {
        eprintln!("Không đồng bộ được chế độ giữ màn hình sáng sau khi huỷ hẹn: {error}");
    }
}

#[tauri::command]
pub fn job_postpone(app: AppHandle, state: State<'_, AppState>, minutes: i64) {
    let events = {
        let mut core = state.lock();
        let core = &mut *core;
        core.engine.postpone(&mut core.store, minutes, now_ms())
    };
    dispatch::handle(&app, events);
    if let Err(error) = sync_keep_awake(&app) {
        eprintln!("Không đồng bộ được chế độ giữ màn hình sáng sau khi chạy ngay: {error}");
    }
}

#[tauri::command]
pub fn job_now(app: AppHandle, state: State<'_, AppState>) {
    let events = {
        let mut core = state.lock();
        let core = &mut *core;
        core.engine.execute_now(&mut core.store)
    };
    dispatch::handle(&app, events);
}

#[tauri::command]
pub fn draft_set(state: State<'_, AppState>, draft: Value) {
    let mut core = state.lock();
    core.store.data.draft = draft;
    core.store.save().ok();
}

/// Gộp một phần cài đặt (chỉ các khoá được gửi lên) vào cài đặt hiện tại.
#[tauri::command]
pub fn settings_set(app: AppHandle, state: State<'_, AppState>, patch: Value) -> Result<(), String> {
    let sync_awake = patch.get("keepAwake").is_some();
    let previous = state.lock().store.data.settings.clone();
    {
        let mut core = state.lock();
        let mut merged = serde_json::to_value(&core.store.data.settings).map_err(|e| e.to_string())?;
        if let (Some(dst), Some(src)) = (merged.as_object_mut(), patch.as_object()) {
            for (k, v) in src {
                dst.insert(k.clone(), v.clone());
            }
        }
        let settings: Settings = serde_json::from_value(merged).map_err(|e| e.to_string())?;
        if patch.get("autostart").is_some() {
            autostart::set(settings.autostart).map_err(|e| e.to_string())?;
        }
        core.store.data.settings = settings;
        core.store.save().map_err(|e| e.to_string())?;
    }
    if sync_awake {
        if let Err(error) = sync_keep_awake(&app) {
            let mut core = state.lock();
            core.store.data.settings = previous;
            core.store.save().map_err(|save_error| {
                format!("{error}. Đồng thời không thể khôi phục cài đặt: {save_error}")
            })?;
            return Err(error);
        }
    }
    dispatch::broadcast(&app);
    Ok(())
}

#[tauri::command]
pub fn presets_set(app: AppHandle, state: State<'_, AppState>, list: Vec<Preset>) {
    {
        let mut core = state.lock();
        core.store.data.presets = list;
        core.store.save().ok();
    }
    dispatch::broadcast(&app);
}

#[tauri::command]
pub fn schedules_set(app: AppHandle, state: State<'_, AppState>, list: Vec<Schedule>) {
    {
        let mut core = state.lock();
        core.store.data.schedules = list;
        core.store.save().ok();
    }
    dispatch::broadcast(&app);
}

#[tauri::command]
pub fn history_clear(app: AppHandle, state: State<'_, AppState>) {
    {
        let mut core = state.lock();
        core.store.data.history.clear();
        core.store.save().ok();
    }
    dispatch::broadcast(&app);
}

#[tauri::command]
pub fn proc_list(state: State<'_, AppState>) -> Vec<String> {
    state.lock().sensors.process_names()
}

#[tauri::command]
pub fn proc_check(state: State<'_, AppState>, name: String) -> bool {
    state.lock().sensors.is_running(&name)
}

/// Nút thu nhỏ / phóng to / đóng trên thanh tiêu đề tự vẽ.
#[tauri::command]
pub fn win_action(window: WebviewWindow, action: String) {
    match action.as_str() {
        "min" => window.minimize().ok(),
        "max" => {
            if window.is_maximized().unwrap_or(false) {
                window.unmaximize().ok()
            } else {
                window.maximize().ok()
            }
        }
        "close" => window.close().ok(),
        _ => None,
    };
}

#[tauri::command]
pub fn audio_state(state: State<'_, AppState>) -> crate::audio::AudioStateSnapshot {
    state.audio.snapshot()
}

#[tauri::command]
pub fn audio_toggle_play(state: State<'_, AppState>) {
    state.audio.send(crate::audio::AudioCmd::TogglePlay);
}

#[tauri::command]
pub fn audio_toggle_channel(state: State<'_, AppState>, id: String) {
    state.audio.send(crate::audio::AudioCmd::ToggleChannel(id));
}

#[tauri::command]
pub fn audio_set_volume(state: State<'_, AppState>, id: String, volume: f32) {
    state.audio.send(crate::audio::AudioCmd::SetVolume(id, volume));
}

#[tauri::command]
pub fn audio_set_master(state: State<'_, AppState>, volume: f32) {
    state.audio.send(crate::audio::AudioCmd::SetMaster(volume));
}

#[tauri::command]
pub fn audio_set_fade(state: State<'_, AppState>, minutes: u32) {
    state.audio.send(crate::audio::AudioCmd::SetFadeMinutes(minutes));
}

#[tauri::command]
pub fn audio_apply_preset(state: State<'_, AppState>, id: String) {
    state.audio.send(crate::audio::AudioCmd::ApplyPreset(id));
}

#[tauri::command]
pub fn audio_skip_lofi(state: State<'_, AppState>) {
    state.audio.send(AudioCmd::SkipLofi);
}

#[tauri::command]
pub fn audio_prev_lofi(state: State<'_, AppState>) {
    state.audio.send(AudioCmd::PrevLofi);
}

#[tauri::command]
pub fn audio_select_lofi(state: State<'_, AppState>, id: String) {
    state.audio.send(AudioCmd::SelectLofiTrack(id));
}

#[tauri::command]
pub fn audio_seek_lofi(state: State<'_, AppState>, ratio: f32) {
    state.audio.send(AudioCmd::SeekLofi(ratio));
}

#[tauri::command]
pub fn audio_cycle_lofi_loop(state: State<'_, AppState>) {
    state.audio.send(AudioCmd::CycleLofiLoop);
}

#[tauri::command]
pub fn audio_set_pan(state: State<'_, AppState>, id: String, pan: f32) {
    state.audio.send(AudioCmd::SetPan(id, pan));
}

#[tauri::command]
pub fn audio_toggle_swell(state: State<'_, AppState>, id: String) {
    state.audio.send(AudioCmd::ToggleSwell(id));
}

#[tauri::command]
pub fn audio_shuffle_mix(state: State<'_, AppState>) {
    state.audio.send(AudioCmd::ShuffleMix);
}

#[tauri::command]
pub fn audio_clear_all(state: State<'_, AppState>) {
    state.audio.send(AudioCmd::ClearAll);
}

#[tauri::command]
pub fn audio_apply_custom_mix(state: State<'_, AppState>, id: String) {
    let mix = {
        let core = state.lock();
        core.store.data.mix_presets.iter().find(|m| m.id == id).cloned()
    };
    if let Some(m) = mix {
        state.audio.send(AudioCmd::ApplyCustomMix {
            id: m.id,
            channels: m.channels,
        });
    }
}

#[tauri::command]
pub fn audio_save_mix(app: AppHandle, state: State<'_, AppState>, name: String) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Tên bộ mix không được để trống".into());
    }
    let snap = state.audio.snapshot();
    let channels: Vec<(String, f32)> = snap
        .channels
        .iter()
        .filter(|c| c.active)
        .map(|c| (c.id.clone(), c.volume))
        .collect();
    if channels.is_empty() {
        return Err("Hãy bật ít nhất một âm thanh trước khi lưu".into());
    }
    let id = new_id();
    {
        let mut core = state.lock();
        core.store.data.mix_presets.push(MixPreset {
            id: id.clone(),
            name: trimmed.to_string(),
            channels: channels.clone(),
        });
        core.store.save().map_err(|e| e.to_string())?;
    }
    state.audio.send(AudioCmd::ApplyCustomMix { id, channels });
    dispatch::broadcast(&app);
    super::tray::refresh(&app, true);
    Ok(())
}

#[tauri::command]
pub fn audio_delete_mix(app: AppHandle, state: State<'_, AppState>, id: String) {
    {
        let mut core = state.lock();
        core.store.data.mix_presets.retain(|m| m.id != id);
        core.store.save().ok();
    }
    dispatch::broadcast(&app);
    super::tray::refresh(&app, true);
}

fn default_music_dir() -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/home".into());
    let music = std::path::PathBuf::from(&home).join("Music");
    if music.is_dir() {
        format!("{}/", music.display())
    } else {
        format!("{home}/")
    }
}

fn persist_and_add_tracks(state: &State<'_, AppState>, paths: Vec<std::path::PathBuf>) -> usize {
    if paths.is_empty() {
        return 0;
    }
    let mut added_count = 0;
    {
        let mut core = state.lock();
        let existing: std::collections::HashSet<String> =
            core.store.data.custom_tracks.iter().cloned().collect();
        for p in &paths {
            let s = p.to_string_lossy().to_string();
            if !existing.contains(&s) {
                core.store.data.custom_tracks.push(s);
                added_count += 1;
            }
        }
        if added_count > 0 {
            core.store.save().ok();
        }
    }
    state.audio.send(AudioCmd::AddCustomFiles(paths));
    added_count
}

#[tauri::command]
pub fn audio_pick_folder(state: State<'_, AppState>) -> Result<usize, String> {
    let initial = default_music_dir();
    let output = std::process::Command::new("zenity")
        .args([
            "--file-selection",
            "--directory",
            &format!("--filename={initial}"),
            "--title=Chọn thư mục nhạc",
        ])
        .output()
        .map_err(|e| format!("Không mở được hộp thoại chọn thư mục (cần zenity): {e}"))?;
    if !output.status.success() {
        return Ok(0);
    }
    let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if raw.is_empty() {
        return Ok(0);
    }
    let entries = std::fs::read_dir(&raw).map_err(|e| format!("Không đọc được thư mục {raw}: {e}"))?;
    let mut files: Vec<std::path::PathBuf> = entries
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.is_file()
                && p.extension()
                    .and_then(|e| e.to_str())
                    .is_some_and(|ext| matches!(ext.to_ascii_lowercase().as_str(), "mp3" | "ogg" | "wav"))
        })
        .collect();
    files.sort();
    Ok(persist_and_add_tracks(&state, files))
}

#[tauri::command]
pub fn audio_pick_files(state: State<'_, AppState>) -> Result<usize, String> {
    let initial = default_music_dir();
    let output = std::process::Command::new("zenity")
        .args([
            "--file-selection",
            "--multiple",
            "--separator=\n",
            &format!("--filename={initial}"),
            "--file-filter=Âm thanh | *.mp3 *.ogg *.wav",
            "--title=Chọn tệp nhạc của bạn",
        ])
        .output()
        .map_err(|e| format!("Không mở được hộp thoại chọn tệp (cần zenity): {e}"))?;
    if !output.status.success() {
        return Ok(0);
    }
    let files: Vec<std::path::PathBuf> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(std::path::PathBuf::from)
        .collect();
    Ok(persist_and_add_tracks(&state, files))
}

#[tauri::command]
pub fn audio_remove_custom_track(state: State<'_, AppState>, id: String) {
    if let Some(path) = id.strip_prefix("custom:") {
        let mut core = state.lock();
        core.store.data.custom_tracks.retain(|p| p != path);
        core.store.save().ok();
    }
    state.audio.send(AudioCmd::RemoveCustomTrack(id));
}

#[tauri::command]
pub fn yt_open(app: AppHandle, mode: String) -> Result<String, String> {
    let url = if mode == "music" {
        "https://music.youtube.com"
    } else {
        "https://www.youtube.com"
    };
    let status = super::windows::open_youtube(&app, url)?;
    app.emit("yt-media", super::windows::youtube_media(&app)).ok();
    Ok(status)
}

#[tauri::command]
pub fn yt_hide(app: AppHandle) -> String {
    let status = super::windows::hide_youtube(&app);
    app.emit("yt-media", super::windows::youtube_media(&app)).ok();
    status
}

#[tauri::command]
pub fn yt_close(app: AppHandle) -> String {
    let status = super::windows::close_youtube(&app);
    app.emit("yt-media", super::windows::youtube_media(&app)).ok();
    status
}

#[tauri::command]
pub fn yt_status(app: AppHandle) -> String {
    super::windows::youtube_status(&app)
}

#[tauri::command]
pub fn yt_media(app: AppHandle) -> super::windows::YtMediaState {
    super::windows::youtube_media(&app)
}

#[tauri::command]
pub fn yt_control(app: AppHandle, action: String) -> Result<(), String> {
    super::windows::youtube_control(&app, &action)
}

#[tauri::command]
pub fn yt_set_video_only(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let out = super::windows::set_youtube_video_only(&app, enabled)?;
    app.emit("yt-media", super::windows::youtube_media(&app)).ok();
    Ok(out)
}
