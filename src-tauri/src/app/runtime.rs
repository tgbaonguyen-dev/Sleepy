//! Vòng lặp nền chạy mỗi giây, kể cả khi cửa sổ đã ẩn xuống khay.

use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use super::{dispatch, tray, AppState};
use crate::domain::time::now_ms;

pub fn spawn(app: AppHandle) {
    std::thread::Builder::new()
        .name("nghi-tick".into())
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
            app.emit("tick", snapshot).ok();
            dispatch::handle(&app, events);
            tray::refresh(&app, false);
        })
        .expect("không tạo được luồng nền");
}
