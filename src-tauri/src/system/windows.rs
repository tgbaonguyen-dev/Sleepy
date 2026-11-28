use std::collections::BTreeMap;
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use super::PowerControl;
use crate::domain::Action;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Điều khiển nguồn trên Windows bằng lệnh hệ thống & Win32 API (không bật cửa sổ CMD).
#[derive(Default)]
pub struct WindowsPower;

impl PowerControl for WindowsPower {
    fn capabilities(&self) -> BTreeMap<String, String> {
        let hibernate_ok = Command::new("powercfg")
            .args(["/a"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()
            .map(|o| {
                let text = String::from_utf8_lossy(&o.stdout).to_ascii_lowercase();
                text.contains("hibernate") && !text.contains("hibernation has not been enabled")
            })
            .unwrap_or(true);

        Action::ALL
            .iter()
            .map(|&a| {
                let status = if a == Action::Hibernate && !hibernate_ok {
                    "no"
                } else {
                    "yes"
                };
                (a.key().to_string(), status.to_string())
            })
            .collect()
    }

    fn perform(&self, action: Action, pre_command: &str) -> Result<(), String> {
        if !pre_command.trim().is_empty() {
            run_cmd_with_timeout(pre_command, Duration::from_secs(30)).ok();
        }
        match action {
            Action::Shutdown => run_exe("shutdown", &["/s", "/t", "0"]),
            Action::Reboot => run_exe("shutdown", &["/r", "/t", "0"]),
            Action::Hibernate => run_exe("shutdown", &["/h"]),
            Action::Logout => run_exe("shutdown", &["/l"]),
            Action::Lock => run_exe("rundll32.exe", &["user32.dll,LockWorkStation"]),
            Action::Suspend => run_exe("rundll32.exe", &["powrprof.dll,SetSuspendState", "0,1,0"]),
        }
    }
}

fn run_exe(program: &str, args: &[&str]) -> Result<(), String> {
    let out = Command::new(program)
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Không chạy được {program}: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        let err = String::from_utf8_lossy(&out.stderr);
        Err(err
            .trim()
            .lines()
            .last()
            .unwrap_or("Không thể thực hiện hành động")
            .to_string())
    }
}

fn run_cmd_with_timeout(cmd: &str, limit: Duration) -> Result<(), String> {
    let mut child = Command::new("cmd")
        .args(["/C", cmd])
        .creation_flags(CREATE_NO_WINDOW)
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
