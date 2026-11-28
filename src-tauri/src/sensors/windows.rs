use std::collections::BTreeSet;
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::time::Instant;

use super::{Battery, Readings, SensorSource};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[repr(C)]
#[derive(Default, Clone, Copy)]
struct FileTime {
    low: u32,
    high: u32,
}

impl FileTime {
    fn as_u64(self) -> u64 {
        ((self.high as u64) << 32) | (self.low as u64)
    }
}

#[repr(C)]
#[derive(Default)]
struct SystemPowerStatus {
    ac_line_status: u8,
    battery_flag: u8,
    battery_life_percent: u8,
    system_status_flag: u8,
    battery_life_time: u32,
    battery_full_life_time: u32,
}

#[repr(C)]
struct LastInputInfo {
    cb_size: u32,
    dw_time: u32,
}

#[link(name = "kernel32")]
extern "system" {
    fn GetSystemTimes(idle: *mut FileTime, kernel: *mut FileTime, user: *mut FileTime) -> i32;
    fn GetSystemPowerStatus(status: *mut SystemPowerStatus) -> i32;
    fn GetTickCount() -> u32;
}

#[link(name = "user32")]
extern "system" {
    fn GetLastInputInfo(info: *mut LastInputInfo) -> i32;
}

/// Đọc cảm biến trên Windows qua Win32 API (CPU, pin, thời gian rảnh) và lệnh hệ thống gọn (mạng, tiến trình).
pub struct WindowsSensors {
    last_cpu: Option<(u64, u64)>,
    last_net: Option<(u64, Instant)>,
    ticks: u64,
    battery: Option<Battery>,
}

impl Default for WindowsSensors {
    fn default() -> Self {
        Self::new()
    }
}

impl WindowsSensors {
    pub fn new() -> Self {
        let mut s = Self {
            last_cpu: None,
            last_net: None,
            ticks: 0,
            battery: None,
        };
        s.cpu();
        s.net();
        s.battery = read_battery();
        s
    }

    fn cpu(&mut self) -> Option<f64> {
        let (mut idle, mut kernel, mut user) =
            (FileTime::default(), FileTime::default(), FileTime::default());
        let ok = unsafe { GetSystemTimes(&mut idle, &mut kernel, &mut user) };
        if ok == 0 {
            return None;
        }
        let idle_t = idle.as_u64();
        let total_t = kernel.as_u64().saturating_add(user.as_u64());
        let pct = self.last_cpu.and_then(|(t0, i0)| {
            let dt = total_t.saturating_sub(t0);
            let di = idle_t.saturating_sub(i0);
            (dt > 0).then(|| ((1.0 - di as f64 / dt as f64) * 100.0).clamp(0.0, 100.0))
        });
        self.last_cpu = Some((total_t, idle_t));
        pct
    }

    fn net(&mut self) -> Option<f64> {
        let bytes = read_net_bytes()?;
        let now = Instant::now();
        let rate = self.last_net.and_then(|(b0, t0)| {
            let dt = now.duration_since(t0).as_secs_f64();
            (dt > 0.1).then(|| bytes.saturating_sub(b0) as f64 / 1024.0 / dt)
        });
        self.last_net = Some((bytes, now));
        rate
    }
}

impl SensorSource for WindowsSensors {
    fn read(&mut self) -> Readings {
        self.ticks += 1;
        if self.ticks % 5 == 0 {
            self.battery = read_battery();
        }
        Readings {
            cpu: self.cpu(),
            net: self.net(),
            battery: self.battery.clone(),
            idle: read_idle_secs(),
            process: None,
        }
    }

    fn is_running(&self, name: &str) -> bool {
        let needle = name.trim().to_ascii_lowercase();
        if needle.is_empty() {
            return false;
        }
        let needle_no_ext = needle.strip_suffix(".exe").unwrap_or(&needle);
        self.process_names().into_iter().any(|p| {
            let pl = p.to_ascii_lowercase();
            let pl_no_ext = pl.strip_suffix(".exe").unwrap_or(&pl);
            pl == needle || pl_no_ext == needle_no_ext
        })
    }

    fn battery(&self) -> Option<Battery> {
        self.battery.clone()
    }

    fn process_names(&self) -> Vec<String> {
        let output = Command::new("tasklist")
            .args(["/FO", "CSV", "/NH"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok();
        let Some(out) = output.filter(|o| o.status.success()) else {
            return Vec::new();
        };
        let mut names = BTreeSet::new();
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            if let Some(first) = line.split(',').next() {
                let clean = first.trim().trim_matches('"');
                if !clean.is_empty() {
                    names.insert(clean.to_string());
                }
            }
        }
        names.into_iter().collect()
    }
}

fn read_battery() -> Option<Battery> {
    let mut s = SystemPowerStatus::default();
    let ok = unsafe { GetSystemPowerStatus(&mut s) };
    if ok == 0 || (s.battery_flag & 128) != 0 || s.battery_life_percent > 100 {
        return None;
    }
    let charging = s.ac_line_status == 1;
    let status = if charging { "Charging" } else { "Discharging" }.to_string();
    Some(Battery {
        percent: s.battery_life_percent,
        charging,
        status,
    })
}

fn read_idle_secs() -> Option<u64> {
    let mut info = LastInputInfo {
        cb_size: std::mem::size_of::<LastInputInfo>() as u32,
        dw_time: 0,
    };
    let ok = unsafe { GetLastInputInfo(&mut info) };
    if ok == 0 {
        return None;
    }
    let now = unsafe { GetTickCount() };
    let elapsed_ms = now.wrapping_sub(info.dw_time);
    Some((elapsed_ms / 1000) as u64)
}

fn read_net_bytes() -> Option<u64> {
    let out = Command::new("netstat")
        .args(["-e"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    for line in String::from_utf8_lossy(&out.stdout).lines() {
        let nums: Vec<u64> = line
            .split_whitespace()
            .filter_map(|tok| tok.parse::<u64>().ok())
            .collect();
        if nums.len() >= 2 {
            return Some(nums[0].saturating_add(nums[1]));
        }
    }
    None
}
