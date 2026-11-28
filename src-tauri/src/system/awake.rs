use std::io::Read;
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::Duration;

pub struct KeepAwake {
    child: Option<Child>,
}

impl KeepAwake {
    pub fn new() -> Self {
        Self { child: None }
    }

    pub fn set(&mut self, enabled: bool) -> Result<(), String> {
        if enabled {
            self.start()
        } else {
            self.stop()
        }
    }

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
        if let Some(child) = self.child.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
