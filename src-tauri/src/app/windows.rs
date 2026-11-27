//! Cửa sổ chính, cửa sổ cảnh báo và cửa sổ YouTube phát nền.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, Window, WindowEvent};

use super::AppState;

const WARN_W: f64 = 460.0;
const WARN_H: f64 = 250.0;
const MARGIN: f64 = 14.0;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct YtMediaState {
    pub status: String,
    pub title: Option<String>,
    pub source: Option<String>,
    pub video_id: Option<String>,
    pub artwork: Option<String>,
}

#[derive(Default)]
struct YtThumbCache {
    video_id: String,
    data_url: Option<String>,
}

static YT_CACHE: Mutex<Option<YtThumbCache>> = Mutex::new(None);

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

pub fn youtube_control(app: &AppHandle, action: &str) -> Result<(), String> {
    let Some(w) = app.get_webview_window("youtube") else {
        return Ok(());
    };
    let js = match action {
        "toggle" => {
            "(() => { const v = document.querySelector('video'); if (v) { if (v.paused) v.play(); else v.pause(); return; } const b = document.querySelector('#play-pause-button, .ytp-play-button'); if (b) b.click(); })()"
        }
        "next" => {
            "(() => { const b = document.querySelector('.next-button, .ytp-next-button'); if (b) b.click(); })()"
        }
        "prev" => {
            "(() => { const b = document.querySelector('.previous-button, .ytp-prev-button'); if (b) b.click(); })()"
        }
        _ => return Ok(()),
    };
    w.eval(js).map_err(|e| e.to_string())
}

pub fn youtube_media(app: &AppHandle) -> YtMediaState {
    let Some(w) = app.get_webview_window("youtube") else {
        return YtMediaState {
            status: "closed".into(),
            title: None,
            source: None,
            video_id: None,
            artwork: None,
        };
    };

    let status = if w.is_visible().unwrap_or(false) {
        "visible"
    } else {
        "hidden"
    }
    .to_string();

    let url = w.url().ok();
    let host = url
        .as_ref()
        .and_then(|u| u.host_str())
        .unwrap_or("www.youtube.com");
    let source = if host == "music.youtube.com" {
        "YouTube Music"
    } else {
        "YouTube"
    }
    .to_string();

    let raw_title = w.title().ok().unwrap_or_default();
    let cleaned = raw_title
        .trim()
        .trim_end_matches(" - YouTube Music")
        .trim_end_matches(" - YouTube")
        .trim();
    let title = if cleaned.is_empty()
        || cleaned == "YouTube"
        || cleaned == "YouTube Music"
        || cleaned == "Sleepy | YouTube Audio"
    {
        None
    } else {
        Some(cleaned.to_string())
    };

    let video_id = url.as_ref().and_then(|u| {
        u.query_pairs()
            .find(|(k, _)| k == "v")
            .map(|(_, v)| v.into_owned())
            .filter(|id| !id.is_empty() && id.len() <= 20)
    });

    let artwork = video_id.as_deref().and_then(fetch_yt_thumbnail_cached);

    YtMediaState {
        status,
        title,
        source: Some(source),
        video_id,
        artwork,
    }
}

fn fetch_yt_thumbnail_cached(video_id: &str) -> Option<String> {
    {
        let guard = YT_CACHE.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(cache) = guard.as_ref() {
            if cache.video_id == video_id {
                return cache.data_url.clone();
            }
        }
    }

    // Ưu tiên maxresdefault (1280x720, không viền đen), sau đó sddefault rồi hqdefault.
    let candidates = [
        format!("https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg"),
        format!("https://i.ytimg.com/vi/{video_id}/sddefault.jpg"),
        format!("https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"),
    ];
    let mut data_url = None;
    for url in candidates {
        let output = std::process::Command::new("curl")
            .args(["-fsSL", "--max-time", "4", &url])
            .output()
            .ok();
        if let Some(o) = output.filter(|o| o.status.success() && o.stdout.len() > 2048) {
            data_url = Some(format!("data:image/jpeg;base64,{}", encode_base64(&o.stdout)));
            break;
        }
    }

    let mut guard = YT_CACHE.lock().unwrap_or_else(|e| e.into_inner());
    *guard = Some(YtThumbCache {
        video_id: video_id.to_string(),
        data_url: data_url.clone(),
    });
    data_url
}

fn encode_base64(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((triple >> 18) & 0x3f) as usize] as char);
        out.push(TABLE[((triple >> 12) & 0x3f) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((triple >> 6) & 0x3f) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(triple & 0x3f) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}
