//! Thực hiện hành động thật trên hệ điều hành.

mod awake;
#[cfg(not(target_os = "windows"))]
mod linux;
#[cfg(target_os = "windows")]
mod windows;

use std::collections::BTreeMap;

use crate::domain::Action;

pub use awake::KeepAwake;
#[cfg(not(target_os = "windows"))]
pub use linux::Systemd as PlatformPower;
#[cfg(target_os = "windows")]
pub use windows::WindowsPower as PlatformPower;

/// Điều khiển nguồn — tách thành trait để engine và test không phụ thuộc hệ thống thật.
pub trait PowerControl: Send + Sync {
    /// `yes` | `no` | `challenge` | `na` | `unknown` cho từng hành động.
    fn capabilities(&self) -> BTreeMap<String, String>;
    /// Chạy `pre_command` (nếu có) rồi thực hiện hành động.
    fn perform(&self, action: Action, pre_command: &str) -> Result<(), String>;
}
