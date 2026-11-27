//! Biểu tượng và menu ở khay hệ thống.

mod ring;

use std::sync::Mutex;

use tauri::image::Image;
use tauri::menu::{IsMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Wry};

use super::{dispatch, show_main, AppState};
use crate::domain::format::{hhmm, human};
use crate::domain::time::now_ms;
use crate::domain::{Action, Phase, Trigger};

const TRAY_ID: &str = "main";
const IDLE_ICON: &[u8] = include_bytes!("../../../icons/tray@2x.png");

/// Nhớ lần vẽ trước để chỉ cập nhật khi có gì thay đổi.
#[derive(Default)]
struct Last {
    menu_key: String,
    icon_key: String,
}

static LAST: Mutex<Option<Last>> = Mutex::new(None);

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(Image::from_bytes(IDLE_ICON)?)
        .tooltip("Sleepy")
        .menu(&build_menu(app, "Không có hẹn giờ", false, false)?)
        .on_menu_event(on_menu)
        .build(app)?;
    Ok(())
}

/// Cập nhật icon (vòng đếm ngược) và menu. `force` bỏ qua bộ nhớ đệm.
pub fn refresh(app: &AppHandle, force: bool) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let (status, has_job, can_postpone, icon) = {
        let state = app.state::<AppState>();
        let core = state.lock();
        let now = now_ms();
        match core.engine.job() {
            None => ("Không có hẹn giờ".to_string(), false, false, IconState::Idle),
            Some(j) => {
                let label = j.action.label();
                match (j.phase, j.deadline) {
                    (Phase::Countdown, Some(d)) => {
                        let left = (d - now).max(0);
                        let frac = j
                            .total_ms
                            .filter(|t| *t > 0)
                            .map(|t| left as f64 / t as f64)
                            .unwrap_or(0.0);
                        let icon = IconState::Counting {
                            steps: (frac.clamp(0.0, 1.0) * 60.0).ceil() as u8,
                            urgent_blink: left <= 60_000 && (left / 1000) % 2 == 0,
                        };
                        (
                            format!("{label} lúc {} · còn {}", hhmm(d), human(left)),
                            true,
                            true,
                            icon,
                        )
                    }
                    _ => (
                        format!("{label} {}", j.trigger.describe()),
                        true,
                        false,
                        IconState::Watching,
                    ),
                }
            }
        }
    };

    let mut guard = LAST.lock().unwrap_or_else(|e| e.into_inner());
    let last = guard.get_or_insert_with(Last::default);
    let icon_key = format!("{icon:?}");
    if force || icon_key != last.icon_key {
        let img = match icon {
            IconState::Idle => Image::from_bytes(IDLE_ICON).ok(),
            IconState::Watching => Some(ring::draw(None, false)),
            IconState::Counting { steps, urgent_blink } => {
                Some(ring::draw(Some(steps as f64 / 60.0), urgent_blink))
            }
        };
        tray.set_icon(img).ok();
        last.icon_key = icon_key;
    }
    let menu_key = format!("{status}|{has_job}|{}", preset_key(app));
    if force || menu_key != last.menu_key {
        if let Ok(menu) = build_menu(app, &status, has_job, can_postpone) {
            tray.set_menu(Some(menu)).ok();
        }
        tray.set_tooltip(Some(format!("Sleepy — {status}"))).ok();
        last.menu_key = menu_key;
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum IconState {
    Idle,
    Watching,
    Counting { steps: u8, urgent_blink: bool },
}

fn preset_key(app: &AppHandle) -> String {
    let state = app.state::<AppState>();
    let core = state.lock();
    core.store
        .data
        .presets
        .iter()
        .map(|p| format!("{}{}", p.id, p.name))
        .collect()
}

fn build_menu(app: &AppHandle, status: &str, has_job: bool, can_postpone: bool) -> tauri::Result<Menu<Wry>> {
    let item = |id: &str, text: &str, enabled: bool| MenuItem::with_id(app, id, text, enabled, None::<&str>);
    let quick = |action: Action, minutes: &[u64]| -> tauri::Result<Submenu<Wry>> {
        let items = minutes
            .iter()
            .map(|m| {
                item(
                    &format!("quick:{}:{}", action.key(), m * 60),
                    &human(*m as i64 * 60_000),
                    true,
                )
            })
            .collect::<tauri::Result<Vec<_>>>()?;
        let refs: Vec<&dyn IsMenuItem<Wry>> = items.iter().map(|i| i as &dyn IsMenuItem<Wry>).collect();
        Submenu::with_items(app, format!("{} sau", action.label()), true, &refs)
    };

    let status_item = item("status", status, false)?;
    let open = item("open", "Mở Sleepy", true)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = item("quit", "Thoát", true)?;

    let mut owned: Vec<Box<dyn IsMenuItem<Wry>>> =
        vec![Box::new(status_item), Box::new(sep1), Box::new(open)];
    if has_job {
        owned.push(Box::new(item("postpone:15", "Hoãn thêm 15 phút", can_postpone)?));
        owned.push(Box::new(item("cancel", "Huỷ hẹn giờ", true)?));
    } else {
        owned.push(Box::new(quick(Action::Shutdown, &[15, 30, 60, 120])?));
        owned.push(Box::new(quick(Action::Suspend, &[15, 30, 60])?));
        let presets: Vec<(String, String)> = {
            let state = app.state::<AppState>();
            let core = state.lock();
            core.store
                .data
                .presets
                .iter()
                .map(|p| (p.id.clone(), p.name.clone()))
                .collect()
        };
        let preset_items = if presets.is_empty() {
            vec![item("none", "Chưa có preset", false)?]
        } else {
            presets
                .iter()
                .map(|(id, name)| item(&format!("preset:{id}"), name, true))
                .collect::<tauri::Result<_>>()?
        };
        let refs: Vec<&dyn IsMenuItem<Wry>> =
            preset_items.iter().map(|i| i as &dyn IsMenuItem<Wry>).collect();
        owned.push(Box::new(Submenu::with_items(app, "Preset", true, &refs)?));
    }
    owned.push(Box::new(sep2));
    owned.push(Box::new(quit));
    let refs: Vec<&dyn IsMenuItem<Wry>> = owned.iter().map(|b| b.as_ref()).collect();
    Menu::with_items(app, &refs)
}

fn on_menu(app: &AppHandle, event: MenuEvent) {
    let id = event.id().as_ref().to_string();
    match id.as_str() {
        "open" => return show_main(app),
        "quit" => return app.exit(0),
        _ => {}
    }
    let state = app.state::<AppState>();
    let now = now_ms();
    let events = {
        let mut core = state.lock();
        let core = &mut *core;
        match id.split(':').collect::<Vec<_>>().as_slice() {
            ["cancel"] => core.engine.cancel(&mut core.store, "Huỷ từ khay"),
            ["postpone", m] => core
                .engine
                .postpone(&mut core.store, m.parse().unwrap_or(15), now),
            ["quick", action, secs] => {
                let action: Action = match serde_json::from_value(serde_json::json!(action)) {
                    Ok(a) => a,
                    Err(_) => return,
                };
                let trigger = Trigger::Countdown {
                    seconds: secs.parse().unwrap_or(900),
                };
                core.engine
                    .start(&mut core.store, action, trigger, "tray", now, &core.sensors)
                    .unwrap_or_default()
            }
            ["preset", pid] => {
                let Some(p) = core.store.data.presets.iter().find(|p| p.id == *pid).cloned() else {
                    return;
                };
                let source = format!("preset:{}", p.id);
                match core
                    .engine
                    .start(&mut core.store, p.action, p.trigger, &source, now, &core.sensors)
                {
                    Ok(ev) => ev,
                    Err(e) => {
                        dispatch::notify(app, "Không thể bắt đầu", &e);
                        vec![]
                    }
                }
            }
            _ => vec![],
        }
    };
    dispatch::handle(app, events);
}
