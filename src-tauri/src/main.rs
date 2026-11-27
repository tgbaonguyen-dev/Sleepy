// Ẩn cửa sổ console trên Windows ở bản release (không ảnh hưởng Linux).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sleepy_lib::run();
}
