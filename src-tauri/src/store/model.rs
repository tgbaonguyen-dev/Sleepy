use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::new_id;
use crate::domain::{Action, Job, Trigger};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Báo trước bao nhiêu phút với hẹn theo giờ (0 = không báo).
    pub warn_minutes: u64,
    /// Chờ thêm bao nhiêu giây sau khi điều kiện thoả.
    pub grace_seconds: u64,
    pub sound: bool,
    /// Chế độ thử: đến giờ chỉ thông báo, không tắt máy thật.
    pub dry_run: bool,
    pub close_to_tray: bool,
    pub autostart: bool,
    pub start_minimized: bool,
    /// Keep the display and session awake while a job is active.
    pub keep_awake: bool,
    /// `dark` | `light` | `system`.
    pub theme: String,
    /// Lệnh shell chạy ngay trước khi thực hiện.
    pub pre_command: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            warn_minutes: 2,
            grace_seconds: 60,
            sound: true,
            dry_run: false,
            close_to_tray: true,
            autostart: false,
            start_minimized: false,
            keep_awake: true,
            theme: "dark".into(),
            pre_command: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub action: Action,
    pub trigger: Trigger,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Schedule {
    pub id: String,
    /// `"HH:MM"`.
    pub time: String,
    /// 0 = Chủ nhật … 6 = Thứ bảy.
    pub days: Vec<u8>,
    pub action: Action,
    pub enabled: bool,
    /// Lần chạy gần nhất đã được lên lịch (để không lên lịch hai lần).
    #[serde(default)]
    pub last_armed: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub at: i64,
    pub action: Action,
    pub trigger: Trigger,
    pub source: String,
    /// `done` | `cancel` | `dry` | `error` | `pending`.
    pub result: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Data {
    pub version: u32,
    pub settings: Settings,
    pub presets: Vec<Preset>,
    pub schedules: Vec<Schedule>,
    pub history: Vec<HistoryEntry>,
    pub job: Option<Job>,
    /// Bản nháp của màn hẹn giờ — giao diện tự quản lý cấu trúc.
    pub draft: Value,
}

impl Default for Data {
    fn default() -> Self {
        let preset = |name: &str, action, trigger| Preset {
            id: new_id(),
            name: name.into(),
            action,
            trigger,
            icon: None,
        };
        Data {
            version: 2,
            settings: Settings::default(),
            presets: vec![
                preset(
                    "Tạm ngưng sau 30 phút",
                    Action::Suspend,
                    Trigger::Countdown { seconds: 1800 },
                ),
                preset(
                    "Tắt máy sau 2 giờ",
                    Action::Shutdown,
                    Trigger::Countdown { seconds: 7200 },
                ),
                preset(
                    "Tắt máy khi tải hoàn tất",
                    Action::Shutdown,
                    Trigger::Net {
                        kbps: 50.0,
                        minutes: 3,
                    },
                ),
                preset(
                    "Khoá sau 10 phút không hoạt động",
                    Action::Lock,
                    Trigger::Idle { minutes: 10 },
                ),
            ],
            schedules: vec![Schedule {
                id: new_id(),
                time: "23:30".into(),
                days: (0..7).collect(),
                action: Action::Shutdown,
                enabled: false,
                last_armed: 0,
            }],
            history: Vec::new(),
            job: None,
            draft: serde_json::json!({ "action": "shutdown", "trigger": { "type": "countdown", "seconds": 3600 } }),
        }
    }
}
