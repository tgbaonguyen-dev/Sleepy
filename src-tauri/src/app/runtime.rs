//! Vòng lặp nền chạy mỗi giây, kể cả khi cửa sổ đã ẩn xuống khay.

use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use super::{dispatch, sync_keep_awake, tray, AppState};
use crate::audio::AudioCmd;
use crate::domain::time::now_ms;

pub fn spawn(app: AppHandle) {
    std::thread::Builder::new()
        .name("sleepy-tick".into())
        .spawn(move || loop {
            std::thread::sleep(Duration::from_secs(1));
            let (events, snapshot) = {
                let state = app.state::<AppState>();
                let mut core = state.lock();
                let core = &mut *core;
                let now = now_ms();
                let events = core.engine.tick(&mut core.store, &mut core.sensors, now);
                (events, core.engine.snapshot(&core.store, now))
            };
            let remaining_ms = snapshot.job.as_ref().and_then(|j| j.remaining);
            let active = snapshot.job.is_some();
            app.state::<AppState>()
                .audio
                .send(AudioCmd::SyncTimer { remaining_ms, active });
            app.emit("tick", snapshot).ok();
            dispatch::handle(&app, events);
            if let Err(error) = sync_keep_awake(&app) {
                eprintln!("Không đồng bộ được chế độ giữ màn hình sáng: {error}");
            }
            tray::refresh(&app, false);
        })
        .expect("không tạo được luồng nền");
}
