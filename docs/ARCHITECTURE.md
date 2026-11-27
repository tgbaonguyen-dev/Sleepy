# Kiến trúc

Sleepy là ứng dụng [Tauri 2](https://tauri.app): lõi viết bằng Rust, giao diện là HTML/CSS/JS
tĩnh chạy trong WebKitGTK. Mọi logic (hẹn giờ, cảm biến, tắt máy, lưu dữ liệu) nằm ở Rust;
giao diện chỉ hiển thị và gửi lệnh.

```
┌──────────────────────── ui/ (WebKitGTK) ────────────────────────┐
│ index.html · warning.html                                        │
│ js/app.js   js/warning.js   js/sky.js   js/icons.js   js/shared.js│
│ js/bridge.js  ── window.sleepy ► invoke("job_start", …)          │
│                ◄── listen("tick" | "state")                      │
└───────────────────────────────┬──────────────────────────────────┘
                                │ IPC
┌───────────────────── src-tauri/src (Rust) ───────────────────────┐
│ app/        commands · dispatch · runtime · tray · windows        │
│   │           ▲ Event                                             │
│   ▼           │                                                   │
│ engine/     Engine (logic thuần, có test)                          │
│   │  dùng ──► sensors/ (trait SensorSource)  · store/ (JSON)       │
│   ▼                                                               │
│ system/     trait PowerControl → systemd / logind                  │
│ domain/     Action · Trigger · Job · format · time                 │
└──────────────────────────────────────────────────────────────────┘
```

## Các tầng

| Module | Trách nhiệm | Phụ thuộc |
|---|---|---|
| `domain` | Kiểu dữ liệu (`Action`, `Trigger`, `Job`), định dạng và tính giờ địa phương | `serde`, `chrono` |
| `store` | Đọc/ghi `sleepy.json` nguyên tử; mặc định; nhật ký tối đa 200 dòng | `domain` |
| `sensors` | Trait `SensorSource` + `LinuxSensors` đọc `/proc`, `/sys`, D-Bus Mutter | — |
| `system` | Trait `PowerControl` + `Systemd` gọi `systemctl` / `loginctl`, hỏi quyền qua logind | `domain` |
| `engine` | Toàn bộ logic hẹn giờ: bắt đầu, huỷ, hoãn, theo dõi điều kiện, lịch lặp, khôi phục | `domain`, `store`, `sensors` (qua trait) |
| `app` | Nối với Tauri: lệnh IPC, vòng lặp nền mỗi giây, khay, cửa sổ cảnh báo, thông báo, tự khởi động | tất cả |

`engine` không biết gì về Tauri hay hệ điều hành: nó nhận `now` và một `SensorSource`, trả về
danh sách `Event` (`Changed`, `Warn`, `Unwarn`, `Execute`). Tầng `app` quyết định làm gì với
từng sự kiện. Nhờ vậy engine được kiểm thử đầy đủ bằng cảm biến giả (`engine/tests.rs`).

## Luồng một lần hẹn

1. Giao diện gọi `job_start(action, trigger)` → `Engine::start` kiểm tra và lưu `Job`.
2. Luồng `sleepy-tick` gọi `Engine::tick` mỗi giây:
   - hẹn theo giờ: báo trước `warnMinutes` phút (`Event::Warn` → mở `warning.html`);
   - hẹn theo điều kiện: điều kiện phải giữ đủ lâu, sau đó đếm lùi `graceSeconds`;
   - lịch lặp: lên lịch trước `warnMinutes` phút, mỗi lần chỉ một lần.
3. Hết giờ → `Event::Execute`: `app` chạy lệnh trên luồng riêng, rồi `Engine::finish` ghi kết quả.
4. Mỗi giây `app` gửi `tick` (ảnh chụp trạng thái) cho mọi cửa sổ và vẽ lại icon khay.

## Dữ liệu

`~/.config/dev.giabao.sleepy/sleepy.json` (đổi bằng biến `SLEEPY_DATA`). Các trường thiếu trong file được điền
giá trị mặc định, nên dữ liệu cũ vẫn đọc được.

## Kiểm thử

```bash
cd src-tauri
cargo test          # engine, store, domain, sensors, system
cargo clippy --all-targets -- -D warnings
```
