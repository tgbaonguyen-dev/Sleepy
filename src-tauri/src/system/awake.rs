#[cfg(not(target_os = "windows"))]
use std::io::Read;
#[cfg(not(target_os = "windows"))]
use std::process::{Child, Command, Stdio};
#[cfg(not(target_os = "windows"))]
use std::thread;
#[cfg(not(target_os = "windows"))]
use std::time::Duration;

#[cfg(target_os = "windows")]
const ES_CONTINUOUS: u32 = 0x8000_0000;
#[cfg(target_os = "windows")]
const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001;
#[cfg(target_os = "windows")]
const ES_DISPLAY_REQUIRED: u32 = 0x0000_0002;

#[cfg(target_os = "windows")]
#[link(name = "kernel32")]
extern "system" {
    fn SetThreadExecutionState(es_flags: u32) -> u32;
}

pub struct KeepAwake {
    #[cfg(not(target_os = "windows"))]
    child: Option<Child>,
    #[cfg(target_os = "windows")]
    active: bool,
}

impl KeepAwake {
    pub fn new() -> Self {
        Self {
            #[cfg(not(target_os = "windows"))]
            child: None,
            #[cfg(target_os = "windows")]
            active: false,
        }
    }

    pub fn set(&mut self, enabled: bool) -> Result<(), String> {
        if enabled {
            self.start()
        } else {
            self.stop()
        }
    }

    #[cfg(target_os = "windows")]
    fn start(&mut self) -> Result<(), String> {
        if self.active {
            return Ok(());
        }
        let prev =
            unsafe { SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED) };
        if prev == 0 {
            return Err("Không bật được chế độ giữ màn hình sáng trên Windows".into());
        }
        self.active = true;
        Ok(())
    }

    #[cfg(target_os = "windows")]
    fn stop(&mut self) -> Result<(), String> {
        if !self.active {
            return Ok(());
        }
        unsafe {
            SetThreadExecutionState(ES_CONTINUOUS);
        }
        self.active = false;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    fn start(&mut self) -> Result<(), String> {
        if let Some(child) = self.child.as_mut() {
            if child
                .try_wait()
                .map_err(|error| format!("Không kiểm tra được chế độ giữ màn hình sáng: {error}"))?
                .is_none()
            {
                return Ok(());
            }
            self.child = None;
        }

        let mut child = Command::new("gnome-session-inhibit")
            .args([
                "--app-id=dev.giabao.sleepy",
                "--reason=Sleepy đang chạy một hẹn giờ",
                "--inhibit=idle",
                "--inhibit=suspend",
                "--inhibit-only",
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| {
                format!("Không bật được chế độ giữ màn hình sáng bằng gnome-session-inhibit: {error}")
            })?;

        thread::sleep(Duration::from_millis(80));
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("Không kiểm tra được gnome-session-inhibit: {error}"))?
        {
            let mut stderr = String::new();
            if let Some(mut pipe) = child.stderr.take() {
                pipe.read_to_string(&mut stderr)
                    .map_err(|error| format!("Không đọc được lỗi từ gnome-session-inhibit: {error}"))?;
            }
            let detail = stderr.trim();
            return Err(if detail.is_empty() {
                format!("Trình giữ màn hình sáng đã dừng với trạng thái {status}")
            } else {
                format!("Trình giữ màn hình sáng đã dừng với trạng thái {status}: {detail}")
            });
        }

        self.child = Some(child);
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    fn stop(&mut self) -> Result<(), String> {
        let Some(mut child) = self.child.take() else {
            return Ok(());
        };
        child
            .kill()
            .map_err(|error| format!("Không tắt được chế độ giữ màn hình sáng: {error}"))?;
        child
            .wait()
            .map_err(|error| format!("Không chờ được trình giữ màn hình sáng kết thúc: {error}"))?;
        Ok(())
    }
}

impl Default for KeepAwake {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for KeepAwake {
    fn drop(&mut self) {
        #[cfg(target_os = "windows")]
        {
            if self.active {
                unsafe {
                    SetThreadExecutionState(ES_CONTINUOUS);
                }
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            if let Some(child) = self.child.as_mut() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}
