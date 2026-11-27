//! Lưu cài đặt, preset, lịch lặp, nhật ký và lần hẹn đang chạy vào một file JSON.

mod model;

pub use model::{Data, HistoryEntry, Preset, Schedule, Settings};

/// Mã ngắn ngẫu nhiên cho preset, lịch, nhật ký.
pub fn new_id() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let mixed = nanos ^ COUNTER.fetch_add(1, Ordering::Relaxed).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    format!("{:010x}", mixed & 0xff_ffff_ffff)
}
