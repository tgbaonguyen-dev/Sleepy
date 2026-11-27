use serde::{Deserialize, Serialize};

/// Việc Nghỉ sẽ làm với máy khi đến giờ.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    Shutdown,
    Reboot,
    Suspend,
    Hibernate,
    Lock,
    Logout,
}

impl Action {
    pub const ALL: [Action; 6] = [
        Action::Shutdown,
        Action::Reboot,
        Action::Suspend,
        Action::Hibernate,
        Action::Lock,
        Action::Logout,
    ];

    /// Khoá dùng chung với giao diện (`"shutdown"`, `"reboot"`…).
    pub fn key(self) -> &'static str {
        match self {
            Action::Shutdown => "shutdown",
            Action::Reboot => "reboot",
            Action::Suspend => "suspend",
            Action::Hibernate => "hibernate",
            Action::Lock => "lock",
            Action::Logout => "logout",
        }
    }

    /// Tên ngắn hiện trên nút, menu khay.
    pub fn label(self) -> &'static str {
        match self {
            Action::Shutdown => "Tắt máy",
            Action::Reboot => "Khởi động lại",
            Action::Suspend => "Ngủ",
            Action::Hibernate => "Ngủ đông",
            Action::Lock => "Khoá màn hình",
            Action::Logout => "Đăng xuất",
        }
    }

    /// Động từ dùng trong câu thông báo: "Sắp {verb}".
    pub fn verb(self) -> &'static str {
        match self {
            Action::Shutdown => "tắt máy",
            Action::Reboot => "khởi động lại",
            Action::Suspend => "cho máy ngủ",
            Action::Hibernate => "ngủ đông",
            Action::Lock => "khoá màn hình",
            Action::Logout => "đăng xuất",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_as_lowercase_key() {
        for a in Action::ALL {
            assert_eq!(serde_json::to_string(&a).unwrap(), format!("\"{}\"", a.key()));
        }
    }
}
