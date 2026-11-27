//! Cửa sổ chính và cửa sổ cảnh báo.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, Window, WindowEvent};

use super::AppState;

const WARN_W: f64 = 460.0;
const WARN_H: f64 = 250.0;
const MARGIN: f64 = 14.0;

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        w.unminimize().ok();
        w.show().ok();
        w.set_focus().ok();
    }
}

/// Đóng cửa sổ chính thì ẩn xuống khay (nếu người dùng bật), hẹn giờ vẫn chạy.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != "main" {
        return;
    }
    if let WindowEvent::CloseRequested { api, .. } = event {
        let to_tray = window
            .app_handle()
            .state::<AppState>()
            .lock()
            .store
            .data
            .settings
            .close_to_tray;
        if to_tray {
            api.prevent_close();
            window.hide().ok();
        }
    }
}

/// Cửa sổ nhỏ luôn nổi ở góc trên bên phải màn hình chính.
pub fn open_warning(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("warning") {
        w.show().ok();
        return;
    }
    let mut builder = WebviewWindowBuilder::new(app, "warning", WebviewUrl::App("warning.html".into()))
        .title("Sleepy | Cảnh báo hẹn giờ")
        .inner_size(WARN_W, WARN_H)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false);
    if let Ok(Some(m)) = app.primary_monitor() {
        let scale = m.scale_factor();
        let (pos, size) = (m.position(), m.size());
        let x = pos.x as f64 / scale + size.width as f64 / scale - WARN_W - MARGIN;
        let y = pos.y as f64 / scale + MARGIN + 28.0;
        builder = builder.position(x, y);
    }
    if let Ok(w) = builder.build() {
        w.show().ok();
    }
}

pub fn close_warning(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("warning") {
        w.close().ok();
    }
}
