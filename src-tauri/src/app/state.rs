use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, MutexGuard};

use serde::Serialize;
use serde_json::Value;

use crate::audio::AudioController;
use crate::domain::time::now_ms;
use crate::engine::{Engine, Snapshot};
use crate::sensors::{LinuxSensors, SensorSource};
use crate::store::{HistoryEntry, MixPreset, Preset, Schedule, Settings, Store};
use crate::system::{KeepAwake, PowerControl};

/// Toàn bộ trạng thái có thể thay đổi, bảo vệ bởi một mutex.
pub struct Core {
    pub store: Store,
    pub engine: Engine,
    pub sensors: LinuxSensors,
    pub caps: BTreeMap<String, String>,
}

pub struct AppState {
    pub core: Mutex<Core>,
    pub power: Arc<dyn PowerControl>,
    pub awake: Mutex<KeepAwake>,
    pub audio: AudioController,
}

impl AppState {
    pub fn lock(&self) -> MutexGuard<'_, Core> {
        self.core.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// Mọi thứ giao diện cần để vẽ lại từ đầu.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FullState {
    pub settings: Settings,
    pub presets: Vec<Preset>,
    pub schedules: Vec<Schedule>,
    pub history: Vec<HistoryEntry>,
    pub mix_presets: Vec<MixPreset>,
    pub draft: Value,
    pub caps: BTreeMap<String, String>,
    pub has_battery: bool,
    pub user: String,
    #[serde(flatten)]
    pub snapshot: Snapshot,
}

impl Core {
    pub fn full_state(&self) -> FullState {
        let d = &self.store.data;
        FullState {
            settings: d.settings.clone(),
            presets: d.presets.clone(),
            schedules: d.schedules.clone(),
            history: d.history.clone(),
            mix_presets: d.mix_presets.clone(),
            draft: d.draft.clone(),
            caps: self.caps.clone(),
            has_battery: self.sensors.battery().is_some(),
            user: std::env::var("USER").unwrap_or_default(),
            snapshot: self.engine.snapshot(&self.store, now_ms()),
        }
    }
}
