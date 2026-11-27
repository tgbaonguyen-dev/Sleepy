<p align="center"><img src="src-tauri/icons/icon.png" width="96" alt=""></p>

<h1 align="center">Sleepy</h1>

<p align="center">Hẹn giờ tắt máy, ngủ, khoá màn hình cho Ubuntu — đẹp, nhẹ, viết bằng Rust.</p>

---

Sleepy thay cho qShutdown: chọn việc cần làm, chọn lúc nào, rồi để máy tự nghỉ. Không chỉ hẹn
theo giờ, Sleepy còn chờ được tới khi **tải xong**, **máy hết bận**, **bạn rời máy** hay **một app đóng lại**.

## Tính năng

- **6 hành động:** tắt máy, khởi động lại, ngủ, ngủ đông, khoá màn hình, đăng xuất. Hành động nào
  hệ thống không cho phép sẽ tự mờ đi.
- **7 kiểu hẹn:** sau bao lâu · đúng giờ · không đụng máy · tải xong · máy hết bận · tắt một app · pin sắp cạn.
- **Báo trước** bằng cửa sổ nhỏ ở góc màn hình: hoãn 5/15 phút, huỷ, làm ngay; có chuông nhẹ.
- **Khay hệ thống:** icon là vòng đếm ngược; menu hẹn nhanh, preset, hoãn, huỷ.
- **Preset**, **lịch lặp** theo thứ trong tuần, **nhật ký**.
- **Hai giao diện:** Đêm (trời sao, Ngân Hà, sao băng) và Sáng (ấm, phẳng).
- **Chế độ thử** (không tắt thật), **lệnh chạy trước** (vd. `playerctl pause`), **mở cùng máy**.

## Cài đặt

Tải `.deb` hoặc `.AppImage` ở mục Releases / Actions artifacts, rồi:

```bash
sudo apt install ./Sleepy_2.0.0_amd64.deb
# hoặc
chmod +x Sleepy_2.0.0_amd64.AppImage && ./Sleepy_2.0.0_amd64.AppImage
```

## Build từ mã nguồn

```bash
# Thư viện hệ thống (Ubuntu 22.04+)
sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev
# Rust: https://rustup.rs

npm install          # chỉ để có Tauri CLI
npm run dev          # chạy thử
npm run build        # ra .deb + .AppImage trong src-tauri/target/release/bundle/
```

## Kiến trúc

Lõi Rust chia tầng rõ ràng (`domain` → `engine` → `app`), logic hẹn giờ thuần và có test.
Chi tiết ở [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
src-tauri/src/
├── domain/    Action, Trigger, Job, định dạng thời gian
├── engine/    bộ máy hẹn giờ + test
├── sensors/   CPU, mạng, pin, thời gian rảnh, tiến trình
├── system/    systemd / logind
├── store/     lưu JSON
└── app/       lệnh IPC, khay, cửa sổ, vòng lặp nền
ui/            giao diện HTML/CSS/JS
```

## Giấy phép

MIT © Nguyen Tran Gia Bao. Font Inter theo giấy phép SIL OFL 1.1 (`ui/fonts/inter/LICENSE`).
