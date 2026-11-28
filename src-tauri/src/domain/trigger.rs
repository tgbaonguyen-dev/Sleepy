use serde::{Deserialize, Serialize};

use super::format::human;

/// Điều kiện để thực hiện hành động.
///
/// Hai loại đầu dựa vào thời gian; các loại còn lại là "khi xong việc":
/// Sleepy theo dõi cảm biến và chỉ bắt đầu đếm lùi khi điều kiện được giữ đủ lâu.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Trigger {
    /// Sau một khoảng thời gian.
    Countdown { seconds: u64 },
    /// Đúng giờ `HH:MM` (đã qua thì hiểu là ngày mai).
    At { time: String },
    /// Không đụng chuột, bàn phím trong N phút.
    Idle { minutes: u64 },
    /// Pin còn dưới X% và không cắm sạc.
    Battery { percent: f64 },
    /// Mạng chậm dưới X KB/s suốt N phút (tải xong).
    Net { kbps: f64, minutes: u64 },
    /// CPU dưới X% suốt N phút (máy hết bận).
    Cpu { percent: f64, minutes: u64 },
    /// Một tiến trình đóng lại.
    Process { name: String },
}

impl Trigger {
    /// `true` với các kiểu "khi xong việc" — cần theo dõi cảm biến.
    pub fn is_condition(&self) -> bool {
        !matches!(self, Trigger::Countdown { .. } | Trigger::At { .. })
    }

    /// Mô tả ngắn cho thông báo và menu khay.
    pub fn describe(&self) -> String {
        match self {
            Trigger::Countdown { seconds } => format!("sau {}", human(*seconds as i64 * 1000)),
            Trigger::At { time } => format!("lúc {time}"),
            Trigger::Idle { minutes } => format!("sau {minutes} phút không hoạt động"),
            Trigger::Battery { percent } => format!("khi pin còn dưới {percent}%"),
            Trigger::Net { kbps, minutes } => {
                format!("khi lưu lượng mạng dưới {kbps} KB/s trong {minutes} phút")
            }
            Trigger::Cpu { percent, minutes } => {
                format!("khi CPU dưới {percent}% trong {minutes} phút")
            }
            Trigger::Process { name } => format!("khi tiến trình \"{name}\" kết thúc"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_tagged_json_from_ui() {
        let t: Trigger = serde_json::from_str(r#"{"type":"net","kbps":50,"minutes":3}"#).unwrap();
        assert_eq!(
            t,
            Trigger::Net {
                kbps: 50.0,
                minutes: 3
            }
        );
        assert!(t.is_condition());
        let t: Trigger = serde_json::from_str(r#"{"type":"at","time":"23:30"}"#).unwrap();
        assert!(!t.is_condition());
    }

    #[test]
    fn describes_in_vietnamese() {
        assert_eq!(
            Trigger::Countdown { seconds: 5400 }.describe(),
            "sau 1 giờ 30 phút"
        );
        assert_eq!(
            Trigger::Process { name: "obs".into() }.describe(),
            "khi tiến trình \"obs\" kết thúc"
        );
    }
}
