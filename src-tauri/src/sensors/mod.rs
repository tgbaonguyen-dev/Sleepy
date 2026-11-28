//! Cảm biến cho các kiểu hẹn "khi xong việc": CPU, mạng, pin, thời gian rảnh, tiến trình.

#[cfg(not(target_os = "windows"))]
mod linux;
#[cfg(target_os = "windows")]
mod windows;

use serde::Serialize;

#[cfg(not(target_os = "windows"))]
pub use linux::LinuxSensors as PlatformSensors;
#[cfg(target_os = "windows")]
pub use windows::WindowsSensors as PlatformSensors;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Battery {
    pub percent: u8,
    pub charging: bool,
    pub status: String,
}

/// Một lần đọc cảm biến. `None` nghĩa là chưa đọc được.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Readings {
    /// Phần trăm CPU đang dùng.
    pub cpu: Option<f64>,
    /// Tốc độ mạng (nhận + gửi), KB/s.
    pub net: Option<f64>,
    pub battery: Option<Battery>,
    /// Số giây không đụng chuột, bàn phím.
    pub idle: Option<u64>,
    /// Tiến trình đang theo dõi còn chạy không.
    pub process: Option<bool>,
}

/// Nguồn cảm biến — tách thành trait để engine test được với dữ liệu giả.
pub trait SensorSource {
    /// Đọc CPU, mạng, pin, thời gian rảnh. Gọi mỗi giây.
    fn read(&mut self) -> Readings;
    fn is_running(&self, name: &str) -> bool;
    fn battery(&self) -> Option<Battery>;
    fn process_names(&self) -> Vec<String>;
}
