//! Lệnh IPC mà giao diện gọi qua `window.__TAURI__.core.invoke`.

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State, WebviewWindow};

use super::state::FullState;
use super::{autostart, dispatch, AppState};
use crate::domain::time::now_ms;
use crate::domain::{Action, Trigger};
use crate::sensors::SensorSource;
use crate::store::{Preset, Schedule, Settings};

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
            StartResult {
                ok: true,
                error: None,
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
}

#[tauri::command]
pub fn job_postpone(app: AppHandle, state: State<'_, AppState>, minutes: i64) {
    let events = {
        let mut core = state.lock();
        let core = &mut *core;
        core.engine.postpone(&mut core.store, minutes, now_ms())
    };
    dispatch::handle(&app, events);
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
