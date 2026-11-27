//! Xử lý các [`Event`] engine trả về.

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use super::{tray, windows, AppState};
use crate::domain::format::{hhmm, human};
use crate::domain::time::now_ms;
use crate::engine::Event;

pub fn handle(app: &AppHandle, events: Vec<Event>) {
    let mut changed = false;
    for event in events {
        match event {
            Event::Changed => changed = true,
            Event::Unwarn => windows::close_warning(app),
            Event::Warn(job) => {
                windows::open_warning(app);
                let left = job.remaining(now_ms()).unwrap_or(0);
                let when = if job.from_condition {
                    "Việc bạn chờ đã xong".to_string()
                } else {
                    format!("Bạn hẹn lúc {}", job.deadline.map(hhmm).unwrap_or_default())
                };
                notify(
                    app,
                    &format!("{} sau {}", job.action.label(), human(left)),
                    &format!("{when}. Mở cảnh báo để hoãn hoặc huỷ."),
                );
            }
            Event::Execute {
                job,
                dry_run,
                entry_id,
            } => {
                if dry_run {
                    notify(
                        app,
                        "Chế độ thử",
                        &format!("Đến giờ {} — máy không bị tắt thật.", job.action.verb()),
                    );
                }
                let app = app.clone();
                std::thread::spawn(move || {
                    let state = app.state::<AppState>();
                    let pre = state.lock().store.data.settings.pre_command.clone();
                    let result = if dry_run {
                        Ok(true)
                    } else {
                        state.power.perform(job.action, &pre).map(|_| false)
                    };
                    if let Err(e) = &result {
                        notify(&app, &format!("Không thể {}", job.action.verb()), e);
                    }
                    {
                        let mut core = state.lock();
                        let core = &mut *core;
                        core.engine.finish(&mut core.store, &entry_id, result);
                    }
                    broadcast(&app);
                });
            }
        }
    }
    if changed {
        broadcast(app);
    }
}

/// Gửi toàn bộ trạng thái cho mọi cửa sổ và cập nhật khay.
pub fn broadcast(app: &AppHandle) {
    let state = app.state::<AppState>().lock().full_state();
    app.emit("state", state).ok();
    tray::refresh(app, true);
}

pub fn notify(app: &AppHandle, title: &str, body: &str) {
    app.notification().builder().title(title).body(body).show().ok();
}
