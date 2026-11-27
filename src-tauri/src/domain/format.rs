//! Định dạng thời gian theo cách người Việt đọc.

use chrono::{Local, TimeZone, Timelike};

/// `"1 giờ 30 phút"`, `"45 phút"`, `"20 giây"`.
pub fn human(ms: i64) -> String {
    if ms < 60_000 {
        return format!("{} giây", (ms.max(0) as f64 / 1000.0).ceil() as i64);
    }
    let total_min = (ms as f64 / 60_000.0).round() as i64;
    let (h, m) = (total_min / 60, total_min % 60);
    match (h, m) {
        (0, m) => format!("{m} phút"),
        (h, 0) => format!("{h} giờ"),
        (h, m) => format!("{h} giờ {m} phút"),
    }
}

/// `"1:05:09"` hoặc `"05:09"`.
pub fn clock(ms: i64) -> String {
    let s = (ms.max(0) as f64 / 1000.0).ceil() as i64;
    let (h, m, x) = (s / 3600, (s % 3600) / 60, s % 60);
    if h > 0 {
        format!("{h}:{m:02}:{x:02}")
    } else {
        format!("{m:02}:{x:02}")
    }
}

/// Giờ địa phương dạng `"23:30"` từ mốc mili-giây.
pub fn hhmm(ts_ms: i64) -> String {
    match Local.timestamp_millis_opt(ts_ms).single() {
        Some(t) => format!("{:02}:{:02}", t.hour(), t.minute()),
        None => "--:--".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn human_reads_naturally() {
        assert_eq!(human(20_000), "20 giây");
        assert_eq!(human(45 * 60_000), "45 phút");
        assert_eq!(human(2 * 3_600_000), "2 giờ");
        assert_eq!(human(90 * 60_000), "1 giờ 30 phút");
    }

    #[test]
    fn clock_pads() {
        assert_eq!(clock(65_000), "01:05");
        assert_eq!(clock(3_909_000), "1:05:09");
        assert_eq!(clock(-5), "00:00");
    }
}
