use serde::{Deserialize, Serialize};

use super::{Action, Trigger};

/// Giai đoạn của một lần hẹn.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    /// Đang đếm lùi tới `deadline`.
    Countdown,
    /// Đang theo dõi cảm biến, chờ điều kiện thoả.
    Watching,
}

/// Lần hẹn đang chạy. Mọi mốc thời gian là mili-giây Unix.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub action: Action,
    pub trigger: Trigger,
    /// `manual`, `preset:<id>` hoặc `schedule:<id>`.
    pub source: String,
    pub started_at: i64,
    pub phase: Phase,
    pub deadline: Option<i64>,
    pub total_ms: Option<i64>,
    #[serde(default)]
    pub warned: bool,
    #[serde(default)]
    pub satisfied_since: Option<i64>,
    /// Đếm lùi này sinh ra từ một điều kiện đã thoả (không phải hẹn theo giờ).
    #[serde(default)]
    pub from_condition: bool,
    /// Thời gian điều kiện cần được giữ liên tục (ms).
    #[serde(default)]
    pub need: i64,
}

impl Job {
    pub fn remaining(&self, now: i64) -> Option<i64> {
        self.deadline.map(|d| (d - now).max(0))
    }
}
