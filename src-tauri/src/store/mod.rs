//! Lưu cài đặt, preset, lịch lặp, nhật ký và lần hẹn đang chạy vào một file JSON.
//!
//! File được ghi nguyên tử (ghi file tạm rồi đổi tên) để không bao giờ bị hỏng giữa chừng.

mod model;

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub use model::{Data, HistoryEntry, MixPreset, Preset, Schedule, Settings};

const FILE_NAME: &str = "sleepy.json";
const HISTORY_LIMIT: usize = 200;

pub struct Store {
    path: PathBuf,
    pub data: Data,
}

impl Store {
    /// Đọc từ `dir/sleepy.json`; file chưa có hoặc hỏng thì dùng mặc định.
    pub fn open(dir: &Path) -> io::Result<Self> {
        fs::create_dir_all(dir)?;
        let path = dir.join(FILE_NAME);
        let data = fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<Data>(&s).ok())
            .unwrap_or_default();
        let store = Store { path, data };
        if !store.path.exists() {
            store.save()?;
        }
        Ok(store)
    }

    /// Store chỉ nằm trong bộ nhớ — dùng cho test.
    pub fn in_memory() -> Self {
        Store {
            path: PathBuf::new(),
            data: Data::default(),
        }
    }

    pub fn save(&self) -> io::Result<()> {
        if self.path.as_os_str().is_empty() {
            return Ok(());
        }
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_vec_pretty(&self.data)?)?;
        fs::rename(tmp, &self.path)
    }

    /// Ghi một dòng nhật ký lên đầu danh sách (giữ tối đa 200 dòng).
    pub fn log(&mut self, entry: HistoryEntry) {
        self.data.history.insert(0, entry);
        self.data.history.truncate(HISTORY_LIMIT);
    }
}

/// Mã ngắn ngẫu nhiên cho preset, lịch, nhật ký.
pub fn new_id() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let mixed = nanos
        ^ COUNTER
            .fetch_add(1, Ordering::Relaxed)
            .wrapping_mul(0x9E37_79B9_7F4A_7C15);
    format!("{:010x}", mixed & 0xff_ffff_ffff)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_through_disk() {
        let dir = std::env::temp_dir().join(format!("sleepy-test-{}", new_id()));
        let mut s = Store::open(&dir).unwrap();
        assert_eq!(s.data.presets.len(), 4, "có preset mặc định");
        s.data.settings.dry_run = true;
        s.save().unwrap();
        let again = Store::open(&dir).unwrap();
        assert!(again.data.settings.dry_run);
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn reads_partial_settings_with_defaults() {
        let d: Data = serde_json::from_str(r#"{"settings":{"sound":false}}"#).unwrap();
        assert!(!d.settings.sound);
        assert_eq!(d.settings.warn_minutes, 2);
        assert_eq!(d.settings.theme, "dark");
    }

    #[test]
    fn ids_are_unique() {
        let a: std::collections::HashSet<_> = (0..1000).map(|_| new_id()).collect();
        assert_eq!(a.len(), 1000);
    }
}
