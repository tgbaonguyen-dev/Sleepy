//! Thực hiện hành động thật trên hệ điều hành.

mod awake;
mod linux;

use std::collections::BTreeMap;

use crate::domain::Action;

pub use awake::KeepAwake;
pub use linux::Systemd;

/// Điều khiển nguồn — tách thành trait để engine và test không phụ thuộc hệ thống thật.
pub trait PowerControl: Send + Sync {
    /// `yes` | `no` | `challenge` | `na` | `unknown` cho từng hành động (theo logind).
    fn capabilities(&self) -> BTreeMap<String, String>;
    /// Chạy `pre_command` (nếu có) rồi thực hiện hành động.
    fn perform(&self, action: Action, pre_command: &str) -> Result<(), String>;
}
