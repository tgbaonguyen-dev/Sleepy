//! Cửa sổ chính, cửa sổ cảnh báo và cửa sổ YouTube phát nền.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::webview::WebviewBuilder;
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, Webview, WebviewUrl, WebviewWindowBuilder, Window,
    WindowEvent,
};

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
    pub video_only: bool,
}

#[derive(Default)]
struct YtMetaCache {
    video_id: String,
    title: Option<String>,
    data_url: Option<String>,
}

static YT_CACHE: Mutex<Option<YtMetaCache>> = Mutex::new(None);
static YT_VIDEO_ONLY: AtomicBool = AtomicBool::new(false);
static YT_VISIBLE: AtomicBool = AtomicBool::new(false);

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

#[cfg(target_os = "linux")]
fn position_youtube_overlay(app: &AppHandle, wv: &Webview, x: f64, y: f64, w: f64, h: f64, visible: bool) {
    use gtk::prelude::*;
    let Some(main_win) = app.get_window("main") else {
        return;
    };
    let (mx, my, mw, mh) = (
        x.max(0.0).round() as i32,
        y.max(0.0).round() as i32,
        w.max(60.0).round() as i32,
        h.max(60.0).round() as i32,
    );
    let _ = wv.with_webview(move |pw| {
        let Ok(gtk_win) = main_win.gtk_window() else {
            return;
        };
        let yt_widget: gtk::Widget = pw.inner().upcast();
        let already_in_overlay = yt_widget
            .parent()
            .is_some_and(|p| p.dynamic_cast::<gtk::Overlay>().is_ok());
        if !already_in_overlay {
            if let Some(parent) = yt_widget
                .parent()
                .and_then(|p| p.dynamic_cast::<gtk::Container>().ok())
            {
                parent.remove(&yt_widget);
            }
            let overlay = if let Some(ov) = gtk_win.child().and_then(|c| c.downcast::<gtk::Overlay>().ok()) {
                ov
            } else {
                let ov = gtk::Overlay::new();
                if let Some(child) = gtk_win.child() {
                    gtk_win.remove(&child);
                    ov.add(&child);
                }
                gtk_win.add(&ov);
                ov.show();
                ov
            };
            overlay.add_overlay(&yt_widget);
        }
        yt_widget.set_halign(gtk::Align::Start);
        yt_widget.set_valign(gtk::Align::Start);
        yt_widget.set_hexpand(false);
        yt_widget.set_vexpand(false);
        yt_widget.set_margin_start(mx);
        yt_widget.set_margin_top(my);
        if visible {
            yt_widget.set_size_request(mw, mh);
            yt_widget.show();
        } else {
            yt_widget.hide();
            yt_widget.set_size_request(0, 0);
        }
    });
}

#[cfg(not(target_os = "linux"))]
fn position_youtube_overlay(_app: &AppHandle, wv: &Webview, x: f64, y: f64, w: f64, h: f64, visible: bool) {
    if visible && w >= 60.0 && h >= 60.0 {
        wv.set_bounds(tauri::Rect {
            position: LogicalPosition::new(x.max(0.0), y.max(0.0)).into(),
            size: LogicalSize::new(w, h).into(),
        })
        .ok();
        wv.show().ok();
    } else {
        wv.hide().ok();
    }
}

pub fn open_youtube(
    app: &AppHandle,
    raw_url: &str,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<String, String> {
    let parsed = tauri::Url::parse(raw_url).map_err(|e| format!("URL không hợp lệ: {e}"))?;
    let host = parsed.host_str().unwrap_or("");
    if !matches!(host, "music.youtube.com" | "www.youtube.com") {
        return Err("Chỉ hỗ trợ YouTube và YouTube Music".into());
    }

    if let Some(wv) = app.get_webview("youtube") {
        let current_host = wv.url().ok().and_then(|u| u.host_str().map(|s| s.to_string()));
        if current_host.as_deref() != Some(host) {
            wv.navigate(parsed).map_err(|e| e.to_string())?;
        }
        position_youtube_overlay(app, &wv, x, y, w, h, true);
        YT_VISIBLE.store(true, Ordering::Relaxed);
        apply_video_only_script(&wv, YT_VIDEO_ONLY.load(Ordering::Relaxed));
        return Ok("visible".into());
    }

    let main_win = app
        .get_window("main")
        .ok_or_else(|| "Không tìm thấy cửa sổ chính".to_string())?;
    let pos = LogicalPosition::new(x.max(0.0), y.max(0.0));
    let size = LogicalSize::new(w.max(200.0), h.max(120.0));
    let builder = WebviewBuilder::new("youtube", WebviewUrl::External(parsed));
    let wv = main_win
        .add_child(builder, pos, size)
        .map_err(|e| format!("Không nhúng được khung YouTube: {e}"))?;
    YT_VISIBLE.store(true, Ordering::Relaxed);
    YT_VIDEO_ONLY.store(true, Ordering::Relaxed);
    position_youtube_overlay(app, &wv, x, y, w, h, true);
    apply_video_only_script(&wv, true);
    Ok("visible".into())
}

pub fn set_youtube_bounds(app: &AppHandle, x: f64, y: f64, w: f64, h: f64, visible: bool) -> String {
    let Some(wv) = app.get_webview("youtube") else {
        YT_VISIBLE.store(false, Ordering::Relaxed);
        return "closed".into();
    };
    let show = visible && w >= 60.0 && h >= 60.0;
    position_youtube_overlay(app, &wv, x, y, w, h, show);
    YT_VISIBLE.store(show, Ordering::Relaxed);
    if show {
        "visible".into()
    } else {
        "hidden".into()
    }
}

pub fn hide_youtube(app: &AppHandle) -> String {
    if let Some(wv) = app.get_webview("youtube") {
        position_youtube_overlay(app, &wv, 0.0, 0.0, 0.0, 0.0, false);
        YT_VISIBLE.store(false, Ordering::Relaxed);
        return "hidden".into();
    }
    YT_VISIBLE.store(false, Ordering::Relaxed);
    "closed".into()
}

pub fn close_youtube(app: &AppHandle) -> String {
    YT_VIDEO_ONLY.store(false, Ordering::Relaxed);
    YT_VISIBLE.store(false, Ordering::Relaxed);
    if let Some(wv) = app.get_webview("youtube") {
        wv.close().ok();
    }
    "closed".into()
}

fn apply_video_only_script(wv: &Webview, enabled: bool) {
    let js = if enabled {
        r#"(() => {
  const CSS = `
    html.sleepy-vo, html.sleepy-vo body { overflow: hidden !important; background: #000 !important; margin: 0 !important; padding: 0 !important; }
    html.sleepy-vo #masthead-container, html.sleepy-vo #secondary, html.sleepy-vo #below,
    html.sleepy-vo #related, html.sleepy-vo #comments, html.sleepy-vo #guide,
    html.sleepy-vo tp-yt-app-drawer, html.sleepy-vo ytd-mini-guide-renderer,
    html.sleepy-vo #chat, html.sleepy-vo #panels, html.sleepy-vo ytd-merch-shelf-renderer,
    html.sleepy-vo ytmusic-nav-bar, html.sleepy-vo #nav-bar-background,
    html.sleepy-vo #side-panel, html.sleepy-vo ytmusic-player-bar, html.sleepy-vo #mini-guide { display: none !important; }
    html.sleepy-vo ytd-watch-flexy, html.sleepy-vo #columns, html.sleepy-vo #primary,
    html.sleepy-vo #primary-inner, html.sleepy-vo #player, html.sleepy-vo #player-container-outer,
    html.sleepy-vo #player-container-inner, html.sleepy-vo #player-container,
    html.sleepy-vo ytd-player, html.sleepy-vo #container.ytd-player { contain: none !important; transform: none !important; overflow: visible !important; }
    html.sleepy-vo #movie_player, html.sleepy-vo #song-video {
      position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
      max-width: 100vw !important; max-height: 100vh !important; z-index: 2147483647 !important; background: #000 !important;
    }
    html.sleepy-vo #movie_player video, html.sleepy-vo #song-video video {
      width: 100% !important; height: 100% !important; left: 0 !important; top: 0 !important; object-fit: contain !important;
    }
  `;
  let el = document.getElementById('sleepy-video-only');
  if (!el) { el = document.createElement('style'); el.id = 'sleepy-video-only'; document.head.appendChild(el); }
  el.textContent = CSS;
  const sync = () => {
    const isWatch = location.pathname.startsWith('/watch') || location.hostname === 'music.youtube.com';
    const hasPlayer = isWatch && !!document.querySelector('#movie_player video, #song-video video');
    document.documentElement.classList.toggle('sleepy-vo', hasPlayer);
    window.dispatchEvent(new Event('resize'));
  };
  if (!window.__sleepyVoBound) {
    window.__sleepyVoBound = true;
    window.addEventListener('yt-navigate-finish', () => { if (document.getElementById('sleepy-video-only')) setTimeout(sync, 180); });
  }
  sync();
})()"#
    } else {
        r#"(() => {
  const el = document.getElementById('sleepy-video-only');
  if (el) el.remove();
  document.documentElement.classList.remove('sleepy-vo');
  window.dispatchEvent(new Event('resize'));
})()"#
    };
    wv.eval(js).ok();
}

pub fn set_youtube_video_only(app: &AppHandle, enabled: bool) -> Result<bool, String> {
    YT_VIDEO_ONLY.store(enabled, Ordering::Relaxed);
    if let Some(wv) = app.get_webview("youtube") {
        apply_video_only_script(&wv, enabled);
    }
    Ok(enabled)
}

pub fn youtube_status(app: &AppHandle) -> String {
    match app.get_webview("youtube") {
        Some(_) if YT_VISIBLE.load(Ordering::Relaxed) => "visible".into(),
        Some(_) => "hidden".into(),
        None => "closed".into(),
    }
}

pub fn youtube_control(app: &AppHandle, action: &str) -> Result<(), String> {
    let Some(wv) = app.get_webview("youtube") else {
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
    wv.eval(js).map_err(|e| e.to_string())
}

pub fn youtube_media(app: &AppHandle) -> YtMediaState {
    let video_only = YT_VIDEO_ONLY.load(Ordering::Relaxed);
    let Some(wv) = app.get_webview("youtube") else {
        return YtMediaState {
            status: "closed".into(),
            title: None,
            source: None,
            video_id: None,
            artwork: None,
            video_only: false,
        };
    };

    let status = if YT_VISIBLE.load(Ordering::Relaxed) {
        "visible"
    } else {
        "hidden"
    }
    .to_string();

    let url = wv.url().ok();
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

    let video_id = url.as_ref().and_then(|u| {
        u.query_pairs()
            .find(|(k, _)| k == "v")
            .map(|(_, v)| v.into_owned())
            .filter(|id| !id.is_empty() && id.len() <= 20)
    });

    let (title, artwork) = match video_id.as_deref() {
        Some(id) => fetch_yt_meta_cached(id),
        None => (None, None),
    };

    if video_only && video_id.is_some() {
        apply_video_only_script(&wv, true);
    }

    YtMediaState {
        status,
        title,
        source: Some(source),
        video_id,
        artwork,
        video_only,
    }
}

fn fetch_yt_meta_cached(video_id: &str) -> (Option<String>, Option<String>) {
    {
        let guard = YT_CACHE.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(cache) = guard.as_ref() {
            if cache.video_id == video_id {
                return (cache.title.clone(), cache.data_url.clone());
            }
        }
    }

    // Lấy tên bài hát qua YouTube oEmbed (nhanh, sạch, không phụ thuộc DOM).
    let oembed_url =
        format!("https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json");
    let title = std::process::Command::new("curl")
        .args(["-fsSL", "--max-time", "3", &oembed_url])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| serde_json::from_slice::<serde_json::Value>(&o.stdout).ok())
        .and_then(|v| v.get("title").and_then(|t| t.as_str()).map(|s| s.to_string()));

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
    *guard = Some(YtMetaCache {
        video_id: video_id.to_string(),
        title: title.clone(),
        data_url: data_url.clone(),
    });
    (title, data_url)
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
