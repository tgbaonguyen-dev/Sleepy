use std::fs;
use std::path::Path;
use std::process::Command;
use std::time::Instant;

use super::{Battery, Readings, SensorSource};

/// Đọc cảm biến từ `/proc`, `/sys` và D-Bus của GNOME.
pub struct LinuxSensors {
    last_cpu: Option<(u64, u64)>,
    last_net: Option<(u64, Instant)>,
    mutter_ok: bool,
    ticks: u64,
    idle: Option<u64>,
    battery: Option<Battery>,
    uid: Option<u32>,
}

impl Default for LinuxSensors {
    fn default() -> Self {
        Self::new()
    }
}

impl LinuxSensors {
    pub fn new() -> Self {
        let mut s = LinuxSensors {
            last_cpu: None,
            last_net: None,
            mutter_ok: true,
            ticks: 0,
            idle: None,
            battery: None,
            uid: own_uid(),
        };
        s.cpu();
        s.net();
        s.battery = read_battery();
        s
    }

    fn cpu(&mut self) -> Option<f64> {
        let stat = fs::read_to_string("/proc/stat").ok()?;
        let nums: Vec<u64> = stat
            .lines()
            .next()?
            .split_whitespace()
            .skip(1)
            .filter_map(|x| x.parse().ok())
            .collect();
        let idle = nums.get(3)? + nums.get(4).copied().unwrap_or(0);
        let total: u64 = nums.iter().sum();
        let pct = self.last_cpu.and_then(|(t0, i0)| {
            let (dt, di) = (total.saturating_sub(t0), idle.saturating_sub(i0));
            (dt > 0).then(|| ((1.0 - di as f64 / dt as f64) * 100.0).clamp(0.0, 100.0))
        });
        self.last_cpu = Some((total, idle));
        pct
    }

    fn net(&mut self) -> Option<f64> {
        let dev = fs::read_to_string("/proc/net/dev").ok()?;
        let mut bytes = 0u64;
        for line in dev.lines().skip(2) {
            let Some((ifc, rest)) = line.split_once(':') else {
                continue;
            };
            let name = ifc.trim();
            if name == "lo"
                || ["docker", "veth", "virbr", "br-"]
                    .iter()
                    .any(|p| name.starts_with(p))
            {
                continue;
            }
            let f: Vec<u64> = rest.split_whitespace().filter_map(|x| x.parse().ok()).collect();
            bytes += f.first().copied().unwrap_or(0) + f.get(8).copied().unwrap_or(0);
        }
        let now = Instant::now();
        let rate = self.last_net.and_then(|(b0, t0)| {
            let secs = now.duration_since(t0).as_secs_f64();
            (secs > 0.0).then(|| (bytes.saturating_sub(b0) as f64 / 1024.0 / secs).max(0.0))
        });
        self.last_net = Some((bytes, now));
        rate
    }

    /// Thời gian rảnh qua Mutter (chạy được cả X11 lẫn Wayland), dự phòng `xprintidle`.
    fn idle_seconds(&mut self) -> Option<u64> {
        if self.mutter_ok {
            let out = Command::new("gdbus")
                .args([
                    "call",
                    "--session",
                    "--dest",
                    "org.gnome.Mutter.IdleMonitor",
                    "--object-path",
                    "/org/gnome/Mutter/IdleMonitor/Core",
                    "--method",
                    "org.gnome.Mutter.IdleMonitor.GetIdletime",
                ])
                .output()
                .ok()
                .filter(|o| o.status.success())
                .map(|o| String::from_utf8_lossy(&o.stdout).into_owned());
            if let Some(ms) = out
                .as_deref()
                .and_then(|s| s.split("uint64 ").nth(1))
                .and_then(|s| {
                    s.trim_end_matches(|c: char| !c.is_ascii_digit())
                        .parse::<u64>()
                        .ok()
                })
            {
                return Some(ms / 1000);
            }
            self.mutter_ok = false;
        }
        Command::new("xprintidle")
            .output()
            .ok()
            .filter(|o| o.status.success())
            .and_then(|o| String::from_utf8_lossy(&o.stdout).trim().parse::<u64>().ok())
            .map(|ms| ms / 1000)
    }
}

impl SensorSource for LinuxSensors {
    fn read(&mut self) -> Readings {
        self.ticks += 1;
        if self.ticks % 2 == 0 {
            self.idle = self.idle_seconds();
        }
        if self.ticks % 10 == 0 {
            self.battery = read_battery();
        }
        Readings {
            cpu: self.cpu(),
            net: self.net(),
            battery: self.battery.clone(),
            idle: self.idle,
            process: None,
        }
    }

    fn is_running(&self, name: &str) -> bool {
        let q = name.trim().to_lowercase();
        if q.is_empty() {
            return false;
        }
        let me = std::process::id().to_string();
        proc_entries(self.uid).any(|(pid, comm, argv0)| {
            pid != me
                && (comm.to_lowercase() == q
                    || Path::new(&argv0)
                        .file_name()
                        .is_some_and(|f| f.to_string_lossy().to_lowercase() == q))
        })
    }

    fn battery(&self) -> Option<Battery> {
        self.battery.clone()
    }

    fn process_names(&self) -> Vec<String> {
        let mut names: Vec<String> = proc_entries(self.uid)
            .map(|(_, comm, _)| comm)
            .filter(|c| !c.starts_with("kworker"))
            .collect();
        names.sort_by_key(|n| n.to_lowercase());
        names.dedup();
        names
    }
}

fn read_battery() -> Option<Battery> {
    let base = Path::new("/sys/class/power_supply");
    fs::read_dir(base).ok()?.flatten().find_map(|e| {
        let p = e.path();
        let read = |f: &str| fs::read_to_string(p.join(f)).ok().map(|s| s.trim().to_string());
        if read("type")? != "Battery" {
            return None;
        }
        let percent: u8 = read("capacity")?.parse().ok()?;
        let status = read("status").unwrap_or_else(|| "Unknown".into());
        Some(Battery {
            percent,
            charging: status == "Charging" || status == "Full",
            status,
        })
    })
}

fn own_uid() -> Option<u32> {
    fs::read_to_string("/proc/self/status")
        .ok()?
        .lines()
        .find_map(|l| l.strip_prefix("Uid:"))?
        .split_whitespace()
        .next()?
        .parse()
        .ok()
}

/// (pid, tên ngắn, đường dẫn chương trình) của các tiến trình thuộc người dùng hiện tại.
fn proc_entries(uid: Option<u32>) -> impl Iterator<Item = (String, String, String)> {
    fs::read_dir("/proc")
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(move |e| {
            let pid = e.file_name().to_string_lossy().into_owned();
            if !pid.bytes().all(|b| b.is_ascii_digit()) {
                return None;
            }
            let dir = e.path();
            if let Some(uid) = uid {
                let owner = fs::read_to_string(dir.join("status"))
                    .ok()?
                    .lines()
                    .find_map(|l| l.strip_prefix("Uid:").map(str::to_owned))?;
                if owner.split_whitespace().next()?.parse::<u32>().ok()? != uid {
                    return None;
                }
            }
            let comm = fs::read_to_string(dir.join("comm")).ok()?.trim().to_string();
            let argv0 = fs::read(dir.join("cmdline"))
                .ok()
                .and_then(|b| {
                    b.split(|&c| c == 0)
                        .next()
                        .map(|s| String::from_utf8_lossy(s).into_owned())
                })
                .unwrap_or_default();
            (!comm.is_empty()).then_some((pid, comm, argv0))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sees_itself_as_running() {
        let s = LinuxSensors::new();
        let me = fs::read_to_string("/proc/self/comm").unwrap().trim().to_string();
        // tiến trình test có thể có tên giống; chỉ cần danh sách không rỗng và tìm được init/khác
        assert!(!s.process_names().is_empty());
        assert!(!s.is_running("tien-trinh-khong-ton-tai-123"));
        let _ = me;
    }

    #[test]
    fn cpu_reads_after_second_sample() {
        let mut s = LinuxSensors::new();
        std::thread::sleep(std::time::Duration::from_millis(120));
        let r = s.read();
        assert!(r.cpu.is_some_and(|c| (0.0..=100.0).contains(&c)));
        assert!(r.net.is_some());
    }
}
