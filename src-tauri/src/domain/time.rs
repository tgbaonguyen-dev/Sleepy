//! Tính mốc thời gian theo giờ địa phương.

use chrono::{Datelike, Duration, Local, LocalResult, NaiveTime, TimeZone};

/// Mili-giây Unix hiện tại.
pub fn now_ms() -> i64 {
    Local::now().timestamp_millis()
}

/// Tách `"HH:MM"` thành (giờ, phút); trả `None` nếu sai định dạng.
pub fn parse_hhmm(s: &str) -> Option<(u32, u32)> {
    let (h, m) = s.split_once(':')?;
    let (h, m) = (h.trim().parse().ok()?, m.trim().parse().ok()?);
    (h < 24 && m < 60).then_some((h, m))
}

fn local_ms(date: chrono::NaiveDate, h: u32, m: u32) -> Option<i64> {
    let naive = date.and_time(NaiveTime::from_hms_opt(h, m, 0)?);
    match Local.from_local_datetime(&naive) {
        LocalResult::Single(t) | LocalResult::Ambiguous(t, _) => Some(t.timestamp_millis()),
        LocalResult::None => None,
    }
}

/// Lần tới đồng hồ chỉ `HH:MM` kể từ `now` (đã qua thì là ngày mai).
pub fn at_deadline(time: &str, now: i64) -> Option<i64> {
    let (h, m) = parse_hhmm(time)?;
    let today = Local.timestamp_millis_opt(now).single()?.date_naive();
    let t = local_ms(today, h, m)?;
    if t > now + 1000 {
        Some(t)
    } else {
        local_ms(today + Duration::days(1), h, m)
    }
}

/// Lần tới (sau `from`) rơi vào một trong các thứ `days` (0 = Chủ nhật) lúc `HH:MM`.
pub fn next_weekly(time: &str, days: &[u8], from: i64) -> Option<i64> {
    if days.is_empty() {
        return None;
    }
    let (h, m) = parse_hhmm(time)?;
    let start = Local.timestamp_millis_opt(from).single()?.date_naive();
    (0..8).find_map(|d| {
        let date = start + Duration::days(d);
        let wd = date.weekday().num_days_from_sunday() as u8;
        let t = local_ms(date, h, m)?;
        (t > from && days.contains(&wd)).then_some(t)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_time() {
        assert_eq!(parse_hhmm("23:30"), Some((23, 30)));
        assert_eq!(parse_hhmm("24:00"), None);
        assert_eq!(parse_hhmm("abc"), None);
    }

    #[test]
    fn at_deadline_is_always_in_the_future() {
        let now = now_ms();
        let d = at_deadline("03:00", now).unwrap();
        assert!(d > now && d - now <= 24 * 3_600_000 + 3_600_000);
    }

    #[test]
    fn weekly_respects_days() {
        let now = now_ms();
        let all = [0, 1, 2, 3, 4, 5, 6];
        let t = next_weekly("12:00", &all, now).unwrap();
        assert!(t > now && t - now <= 24 * 3_600_000 + 3_600_000);
        assert_eq!(next_weekly("12:00", &[], now), None);
    }
}
