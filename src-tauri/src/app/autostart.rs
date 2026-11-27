//! Tự mở khi đăng nhập qua `~/.config/autostart/sleepy.desktop` (chuẩn XDG).

use std::fs;
use std::path::PathBuf;

fn desktop_file() -> Option<PathBuf> {
    let config = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))?;
    Some(config.join("autostart").join("sleepy.desktop"))
}

pub fn set(enabled: bool) -> std::io::Result<()> {
    let Some(file) = desktop_file() else { return Ok(()) };
    if !enabled {
        return match fs::remove_file(&file) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        };
    }
    // AppImage chạy từ file tạm; đường dẫn thật nằm trong biến APPIMAGE.
    let exe = std::env::var_os("APPIMAGE")
        .map(PathBuf::from)
        .or_else(|| std::env::current_exe().ok());
    let Some(exe) = exe else { return Ok(()) };
    fs::create_dir_all(file.parent().expect("có thư mục cha"))?;
    fs::write(
        file,
        format!(
            "[Desktop Entry]\nType=Application\nName=Sleepy\nComment=Hẹn giờ tắt máy\nExec=\"{}\" --hidden\nIcon=sleepy\nX-GNOME-Autostart-enabled=true\n",
            exe.display()
        ),
    )
}
