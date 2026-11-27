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
/// Cửa sổ YouTube khi bấm đóng cũng ẩn để giữ tiếng chạy nền.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    let label = window.label();
    if let WindowEvent::CloseRequested { api, .. } = event {
        if label == "youtube" {
            api.prevent_close();
            window.hide().ok();
            return;
        }
        if label != "main" {
            return;
        }
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

pub fn open_youtube(app: &AppHandle, raw_url: &str) -> Result<String, String> {
    let parsed = tauri::Url::parse(raw_url).map_err(|e| format!("URL không hợp lệ: {e}"))?;
    let host = parsed.host_str().unwrap_or("");
    if !matches!(host, "music.youtube.com" | "www.youtube.com") {
        return Err("Chỉ hỗ trợ YouTube và YouTube Music".into());
    }

    if let Some(w) = app.get_webview_window("youtube") {
        let current_host = w.url().ok().and_then(|u| u.host_str().map(|s| s.to_string()));
        if current_host.as_deref() != Some(host) {
            w.navigate(parsed).map_err(|e| e.to_string())?;
        }
        w.unminimize().ok();
        w.show().ok();
        w.set_focus().ok();
        return Ok("visible".into());
    }

    WebviewWindowBuilder::new(app, "youtube", WebviewUrl::External(parsed))
        .title("Sleepy | YouTube Audio")
        .inner_size(980.0, 680.0)
        .decorations(true)
        .center()
        .build()
        .map_err(|e| format!("Không mở được cửa sổ YouTube: {e}"))?;
    Ok("visible".into())
}

pub fn hide_youtube(app: &AppHandle) -> String {
    if let Some(w) = app.get_webview_window("youtube") {
        w.hide().ok();
        return "hidden".into();
    }
    "closed".into()
}

pub fn close_youtube(app: &AppHandle) -> String {
    if let Some(w) = app.get_webview_window("youtube") {
        w.destroy().ok();
    }
    "closed".into()
}

pub fn youtube_status(app: &AppHandle) -> String {
    match app.get_webview_window("youtube") {
        Some(w) if w.is_visible().unwrap_or(false) => "visible".into(),
        Some(_) => "hidden".into(),
        None => "closed".into(),
    }
}
