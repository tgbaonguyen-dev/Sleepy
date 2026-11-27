use std::collections::BTreeMap;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use super::PowerControl;
use crate::domain::Action;

/// Điều khiển qua systemd/logind, có phương án dự phòng cho từng môi trường desktop.
#[derive(Default)]
pub struct Systemd;

impl Systemd {
    fn command(action: Action) -> &'static str {
        match action {
            Action::Shutdown => "systemctl poweroff",
            Action::Reboot => "systemctl reboot",
            Action::Suspend => "systemctl suspend",
            Action::Hibernate => "systemctl hibernate",
            Action::Lock => "loginctl lock-session || xdg-screensaver lock || gnome-screensaver-command -l",
            Action::Logout => {
                "gnome-session-quit --logout --no-prompt \
                 || qdbus org.kde.ksmserver /KSMServer logout 0 0 0 \
                 || loginctl terminate-session \"$XDG_SESSION_ID\""
            }
        }
    }

    /// Tên phương thức logind hỏi xem hành động có được phép không.
    fn can_method(action: Action) -> Option<&'static str> {
        match action {
            Action::Shutdown => Some("CanPowerOff"),
            Action::Reboot => Some("CanReboot"),
            Action::Suspend => Some("CanSuspend"),
            Action::Hibernate => Some("CanHibernate"),
            Action::Lock | Action::Logout => None,
        }
    }
}

impl PowerControl for Systemd {
    fn capabilities(&self) -> BTreeMap<String, String> {
        Action::ALL
            .iter()
            .map(|&a| {
                let v = match Self::can_method(a) {
                    None => "yes".to_string(),
                    Some(m) => Command::new("gdbus")
                        .args([
                            "call",
                            "--system",
                            "--dest",
                            "org.freedesktop.login1",
                            "--object-path",
                            "/org/freedesktop/login1",
                            "--method",
                            &format!("org.freedesktop.login1.Manager.{m}"),
                        ])
                        .output()
                        .ok()
                        .and_then(|o| {
                            let s = String::from_utf8_lossy(&o.stdout).into_owned();
                            s.split('\'').nth(1).map(str::to_owned)
                        })
                        .unwrap_or_else(|| "unknown".into()),
                };
                (a.key().to_string(), v)
            })
            .collect()
    }

    fn perform(&self, action: Action, pre_command: &str) -> Result<(), String> {
        if !pre_command.trim().is_empty() {
            run_with_timeout(pre_command, Duration::from_secs(30)).ok();
        }
        run_with_timeout(Self::command(action), Duration::from_secs(15))
    }
}

/// Chạy lệnh shell, quá giờ thì huỷ. Trả lỗi kèm dòng stderr cuối cùng.
fn run_with_timeout(cmd: &str, limit: Duration) -> Result<(), String> {
    let mut child = Command::new("/bin/sh")
        .args(["-c", cmd])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let start = Instant::now();
    loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) if status.success() => return Ok(()),
            Some(_) => {
                let out = child.wait_with_output().map_err(|e| e.to_string())?;
                let err = String::from_utf8_lossy(&out.stderr);
                return Err(err.trim().lines().last().unwrap_or("Lỗi không rõ").to_string());
            }
            None if start.elapsed() > limit => {
                child.kill().ok();
                return Err("Quá thời gian chờ".into());
            }
            None => std::thread::sleep(Duration::from_millis(100)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_last_stderr_line() {
        assert!(run_with_timeout("true", Duration::from_secs(2)).is_ok());
        let err = run_with_timeout("echo một >&2; echo hai >&2; exit 3", Duration::from_secs(2)).unwrap_err();
        assert_eq!(err, "hai");
    }

    #[test]
    fn times_out() {
        let err = run_with_timeout("sleep 5", Duration::from_millis(300)).unwrap_err();
        assert_eq!(err, "Quá thời gian chờ");
    }
}
