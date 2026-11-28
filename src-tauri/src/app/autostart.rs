//! Tự mở khi đăng nhập: Linux dùng `~/.config/autostart/sleepy.desktop`, Windows dùng Registry `HKCU\...\Run`.

#[cfg(not(target_os = "windows"))]
pub fn set(enabled: bool) -> std::io::Result<()> {
    use std::fs;
    use std::path::PathBuf;

    let Some(config) = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
    else {
        return Ok(());
    };
    let file = config.join("autostart").join("sleepy.desktop");
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

#[cfg(target_os = "windows")]
pub fn set(enabled: bool) -> std::io::Result<()> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";

    if !enabled {
        let _ = Command::new("reg")
            .args(["delete", RUN_KEY, "/v", "Sleepy", "/f"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        return Ok(());
    }
    let exe = std::env::current_exe()?;
    let value = format!("\"{}\" --hidden", exe.display());
    let status = Command::new("reg")
        .args(["add", RUN_KEY, "/v", "Sleepy", "/t", "REG_SZ", "/d", &value, "/f"])
        .creation_flags(CREATE_NO_WINDOW)
        .status()?;
    if status.success() {
        Ok(())
    } else {
        Err(std::io::Error::other(
            "Không ghi được khoá khởi động cùng Windows",
        ))
    }
}
