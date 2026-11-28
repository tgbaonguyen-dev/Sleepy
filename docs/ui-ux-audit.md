# Sleepy — UI/UX Audit & Design System Spec

> Phạm vi: toàn bộ UI trong `ui/` (Tauri webview) tại commit `7aa4d4e` (branch `feat/ambient-sounds`).
> Phương pháp: chụp 10 màn bằng `tools/preview/shoot.js` (IPC giả lập, 1060×760 và 720×560, dark + light), đọc `ui/css/styles.css` (1.226 dòng) và `ui/js/app.js` (1.320 dòng), đo tương phản bằng công thức WCAG 2.x.
> Tài liệu này **chỉ chẩn đoán và đặc tả**, chưa triển khai.

---

## Mục lục

1. [Tóm tắt điều hành](#1-tóm-tắt-điều-hành)
2. [Bệnh hệ thống (cross-cutting)](#2-bệnh-hệ-thống-cross-cutting)
3. [Audit theo từng màn](#3-audit-theo-từng-màn)
4. [Trạng thái, chức năng & QOL còn thiếu](#4-trạng-thái-chức-năng--qol-còn-thiếu)
5. [Hệ thống Typography](#5-hệ-thống-typography)
6. [Phân cấp Header & tiêu đề](#6-phân-cấp-header--tiêu-đề)
7. [Bản đồ vùng cố định (Layout regions)](#7-bản-đồ-vùng-cố-định-layout-regions)
8. [Vị trí cố định theo từng màn](#8-vị-trí-cố-định-theo-từng-màn)
9. [Design tokens: spacing, radius, màu, elevation, motion](#9-design-tokens)
10. [Component spec](#10-component-spec)
11. [Microcopy & thuật ngữ](#11-microcopy--thuật-ngữ)
12. [Bàn phím & focus](#12-bàn-phím--focus)
13. [Lộ trình ưu tiên](#13-lộ-trình-ưu-tiên)

Ký hiệu mức độ:
- 🔴 **Chí mạng (Block UX)**: gây mất dữ liệu, hành động sai không lường trước, hoặc không dùng được.
- 🟠 **Gây ức chế (High Friction)**: làm chậm, gây nhầm lẫn, thiếu lối đi.
- 🟡 **Rẻ tiền (Polish & Visual)**: cẩu thả thị giác, không nhất quán.

---

## 1. Tóm tắt điều hành

Sleepy là app **có hệ quả vật lý**: nó tắt máy, khởi động lại, đăng xuất. Thế nhưng UI hiện tại được tối ưu cho *không khí* (trời sao, bokeh, đĩa vinyl, mặt trời/mặt trăng) hơn là cho *sự chắc chắn*. Năm vấn đề lớn nhất:

| # | Vấn đề | Mức |
|---|---|---|
| 1 | "Thực hiện ngay" tắt máy bằng 1 click, đặt sát "Huỷ hẹn", không xác nhận | 🔴 |
| 2 | Xoá lịch, xoá preset, xoá nhật ký: không xác nhận, không hoàn tác | 🔴 |
| 3 | Ở cửa sổ hẹp, lưới Hành động mất hết nhãn, chỉ còn icon | 🔴 |
| 4 | Focus ring làm méo bo góc phần tử; vài input tắt hẳn outline | 🔴 |
| 5 | `--ink-3` không đạt AA (dark 3.94:1, light 2.86:1); nút primary light 3.8:1 | 🔴 |

Gốc rễ chung: **không có design system thật**. Có 25+ cỡ chữ, 20 giá trị bo góc, 69 `box-shadow`, cùng một selector bị định nghĩa lại 3–4 lần trong cùng file. Mọi sửa lỗi riêng lẻ sẽ lại trôi nếu không khoá token trước (xem §5, §9).

---

## 2. Bệnh hệ thống (cross-cutting)

### 2.1 🔴 CSS theo lớp đè (override stacking)

Cùng một selector được viết lại nhiều lần, mỗi lần ghi đè một phần. Giá trị cuối cùng phụ thuộc vào thứ tự dòng, nên không ai đọc file mà đoán được kết quả.

| Selector | Các dòng định nghĩa |
|---|---|
| `.btn` | 135, 411, 549 |
| `.btn.big` | 141, 420, 551, 604 |
| `.day` | 273, 575, 865, 872 |
| `.label` | 132, 321, 547 |
| `.set b` / `.set p` | 297–298, 519–520 |
| `.mini .v` | 121, 541, 970 |
| `--rail-w` | 31 (164px), 533 (64px), 905 (96px), 998 (64px) |
| `.dd-text` `text-transform` | 727 (`none`), 809 (`capitalize`) |

**Hậu quả:** mỗi lần chỉnh, sửa một nơi thì vỡ một nơi khác. Đây là lý do các giá trị 0.5px "lạc" xuất hiện.
**Chuẩn:** một selector chỉ có một khối định nghĩa; biến thể dùng modifier (`.btn--lg`); responsive chỉ đổi **token** trong media/container query, không đổi thuộc tính lẻ.

### 2.2 🟠 `text-transform: capitalize` phá tiếng Việt

`styles.css:490, 494, 495, 809` áp `capitalize` lên `.hist th`, `.mini .d`, `.title`, `.dial .cap`, `.day`, `.bgroup button`, `.act`, `.dd-text`…

- Kết quả thấy được: dropdown ở Lịch lặp hiện **"Tắt Máy"**, **"Khoá Màn Hình"** (Title Case), trong khi lưới Hành động ở Hẹn giờ lại là "Tắt máy".
- Tiếng Việt dùng **sentence case**. Title Case làm chữ trông như dịch máy.
- **Chuẩn:** xoá toàn bộ `text-transform: capitalize`; viết hoa ngay trong chuỗi nguồn (`S.ACTIONS`).

### 2.3 🔴 Tương phản không đạt WCAG AA

| Cặp màu | Tỉ lệ | Yêu cầu | Dùng ở |
|---|---|---|---|
| dark `--ink-3 #69749A` / `#0D1430` | **3.94:1** | 4.5:1 | label section, note, footer, "Đã tắt", th bảng |
| light `--ink-3 #A3958A` / `#FFFDFA` | **2.86:1** | 4.5:1 | như trên |
| light primary: `#FFFFFF` / `#E0553B` | **3.80:1** | 4.5:1 | nút "Bắt đầu hẹn giờ", chip đang chọn |
| light `--line-2 #E5D9CC` / nền | 1.37:1 | 3:1 (non-text) | viền input, viền nút ghost |
| dark `--ink-2` / `--bg1` | 8.14:1 | ✓ | — |
| dark `--moon-ink` / `--moon` | 11.02:1 | ✓ | — |

Ngoài ra, chữ đặt trên **canvas sao động + bokeh phát sáng** có tương phản thay đổi theo thời gian: đốm sáng trôi qua "hôm nay" trong dial, qua bảng Nhật ký, qua tiêu đề Preset.

### 2.4 🔴 Focus làm thay đổi hình học

`styles.css:80`: `:focus-visible { … border-radius: 10px; }` gán radius lên **chính phần tử**. Nút tròn (play, winctl), toggle, chip pill đều méo thành vuông bo khi focus bằng Tab. Đồng thời:

- `.time-in input:focus { outline: none; background: var(--surface-2) }` (`:192`): chỉ đổi nền rất nhẹ, gần như vô hình.
- `.pname input:focus { outline: none }` (`:258`): chỉ còn border-bottom.
- `.dial.drag:focus-visible` dùng outline mờ 65%.

### 2.5 🟡 Không có type scale

25+ cỡ chữ cố định: 9.5 · 10 · 10.5 · 11 · 11.5 · 12 · 12.5 · 13 · 13.5 · 14 · 14.5 · 15 · 15.5 · 17 · 19 · 28 · 30 · 34 · 40 · 54 · 60px, cộng 8 biểu thức `clamp()`/`cqw` khác nhau. Các bước 0.5px mắt người không phân biệt được, nên chỉ tạo cảm giác "nhòe", không tạo phân cấp. Weight dùng 200/300/400/500/600, với 200/300 cho số lớn và 500/600 trộn lẫn cho cùng vai trò (`.chip.on` 600 rồi lại 500).

### 2.6 🟡 Không có hệ thống bo góc

20 giá trị: 0 · 1 · 2 · 4 · 5 · 6 · 7 · 8 · 9 · 10 · 11 · 12 · 13 · 14 · 16 · 18 · 22 · 50% · 999px · `14px 0 0 14px`. `.btn` vừa là pill (`999px`, dòng 135) vừa là `12px` (dòng 411). Segmented control không theo quy tắc đồng tâm (`outer = inner + padding`).

### 2.7 🟡 Lạm dụng shadow / blur / trang trí

- 69 `box-shadow`, 3 `backdrop-filter` chồng trên một canvas động: tốn GPU trên WebKitGTK, và lớp nổi không còn khác biệt vì mọi thứ đều "nổi".
- Icon trang trí không mang nghĩa: núm dial là **mặt trời** khi cài đặt và **mặt trăng** khi chạy (ẩn dụ mâu thuẫn); đĩa vinyl cho âm mưa; vòng tròn rỗng ở mini player khi rảnh.

### 2.8 🟡 Nhiễu trong chrome

- Titlebar: "Sleepy | hẹn giờ hệ thống" là tagline đặt trong chrome cửa sổ.
- Eyebrow lặp nhãn rail: "Preset / Preset đã lưu", "Nhật ký / Lịch sử hoạt động", "Lịch lặp / Lịch tự động", "Sleepy / Cài đặt".
- Mini player góc trái dưới khi rảnh: chữ "Sleepy" + vòng rỗng, chiếm vùng Fitts tốt mà không có chức năng.

---

## 3. Audit theo từng màn

### 3.1 Hẹn giờ: thiết lập (`view=timer`, không có job)

| Mức | Vị trí | Lỗi | Nguyên lý | Hậu quả |
|---|---|---|---|---|
| 🔴 | Lưới Hành động, cửa sổ ≤720px | Nhãn biến mất, chỉ còn icon; ô đang chọn chỉ khác ở nền xám nhạt | Recognition over recall | Không biết đang chọn Tắt máy hay Khởi động lại |
| 🟠 | Cột phải | Khoảng trống chết khoảng 150px giữa đoạn hướng dẫn và "Âm thanh đi ngủ" | Data-ink, nhịp dọc | Bố cục trông rời rạc, mắt không có đường đi |
| 🟠 | Chip thời lượng | Đặt tận đáy cột trái, cách dial khoảng 60px; ở 720px bị cắt còn 3/7 chip, không có dấu hiệu cuộn | Fitts, proximity | Lối tắt dùng nhiều nhất lại khó với nhất |
| 🟠 | Thứ tự đọc | Mắt đi Dial → Hành động → Thời điểm → Âm thanh → CTA, trong khi tác vụ thật là *chọn hành động → chọn thời lượng → bắt đầu* | Visual hierarchy | Phải quét cả màn mới hiểu |
| 🟠 | "Ngủ đông" | Disable mà không có lý do | Feedback | Người dùng tưởng app lỗi |
| 🟠 | Đoạn "Kéo vòng để đặt thời lượng. Dùng con lăn hoặc phím mũi tên…; giữ Shift…" | Hướng dẫn thao tác bằng văn xuôi, luôn hiện | Signifier | Tốn chỗ; người quen thì không cần, người mới thì không đọc |
| 🟠 | "Âm thanh đi ngủ" | 5 chip (Phát nhạc, Đêm mưa rào, Rừng đêm & Dế, Lo-Fi lò sưởi, Tất cả); "Tất cả" thực ra là *đi tới trang Âm thanh* nhưng trông như một lựa chọn | Affordance | Click "Tất cả" bị điều hướng bất ngờ |
| 🟡 | Núm dial | Icon mặt trời 🌞 khi đặt hẹn ngủ | Ẩn dụ nhất quán | Trang trí gây nhiễu |
| 🟡 | Câu tóm tắt dưới cùng | Ở 720px bị cắt "khoảng 06:34 hôm …" | Truncation | Mất thông tin xác nhận cuối cùng |
| 🟡 | Eyebrow "Thứ bảy · 05:34" | Đồng hồ hệ thống đặt ở vị trí eyebrow, ngang hàng H1 | Hierarchy | Thông tin phụ chiếm vị trí chính |

**Tab "Điều kiện":** chip điều kiện xuống 3 dòng; input số nằm *giữa câu* ("Sau [20] phút không có thao tác…"). Cách này đọc hay nhưng vùng chạm chỉ khoảng 30×30px, và khi người dùng xoá trống input thì không có validate inline. Dial biến thành vòng cung với chấm xanh tách rời, không rõ ý nghĩa ngưỡng.

### 3.2 Hẹn giờ: đang chạy

| Mức | Vị trí | Lỗi | Hậu quả |
|---|---|---|---|
| 🔴 | `app.js:593` "Thực hiện ngay" | 1 click là chạy hành động ngay; nằm liền kề "Huỷ hẹn" | Trượt tay là tắt máy, mất việc |
| 🟠 | Nhóm "Hoãn 5 phút 15 phút 1 giờ" | Chữ "Hoãn" ở trong nhóm nút nên trông như một nút bị disable | Không rõ là nhãn hay nút |
| 🟠 | "Còn 2 phút" | Nằm cách đồng hồ khoảng 170px, lặp lại thông tin đồng hồ đã hiện | Thừa, phá nhóm |
| 🟠 | Pill "Đang giữ hệ thống hoạt động" | Có viền, có padding, đặt góc phải trên nên trông như nút | Click vào không có gì xảy ra |
| 🟡 | "Thủ công" dưới dòng hành động | Nghĩa mơ hồ (nguồn khởi chạy) | Người dùng không hiểu |
| 🟡 | Banner "Chế độ thử…" | Chỉ hiện ở màn này, màu cam trên pill cam | Các màn khác không cảnh báo |

### 3.3 Âm thanh

| Mức | Vị trí | Lỗi | Hậu quả |
|---|---|---|---|
| 🟠 | Hai tầng điều hướng | Tab (Âm thanh/Bộ mix/Playlist/YouTube) + chip danh mục (Tất cả/Đang phát/Mưa/…) | Tải nhận thức; người dùng không biết đang lọc ở tầng nào |
| 🟠 | Chip danh mục | **Xuống dòng mồ côi**: "Không gian" rơi riêng xuống dòng 2 | Lỗi layout nhìn thấy ngay |
| 🟠 | Chevron `⌄` mỗi dòng | Không rõ chức năng (mở rộng? tuỳ chọn?) | Signifier mơ hồ |
| 🟠 | Panel phải | Đĩa vinyl khoảng 230px cho **tiếng mưa** | Ẩn dụ sai: ambient không có "bài"; chiếm nửa màn mà không mang dữ liệu |
| 🟠 | Trạng thái | "Tạm dừng · 1 kênh" (phải trên) + "8 kênh" (trái dưới), hai nơi | Phân tán, không có nguồn sự thật duy nhất |
| 🟡 | Nhãn slider | "Không gian: Giữa", "Swell Tắt", "Tắt dần 10p cuối" | Trộn Anh–Việt, viết tắt "10p" |
| 🟡 | Transport | 5 nút cùng cỡ; nút loop và nút "visualizer" `ılı` không có nhãn hay tooltip rõ ràng | Đoán mò |
| 🟡 | Dòng kênh | Slider hiện cả khi kênh tắt, không thấy rõ kênh nào đang phát ngoài nền highlight mờ | Trạng thái chỉ dựa vào độ sáng |

### 3.4 Preset

| Mức | Lỗi | Hậu quả |
|---|---|---|
| 🔴 | Thùng rác cạnh "Chạy", xoá ngay, không hoàn tác | Mất preset |
| 🟠 | Đổi tên chỉ bằng **double-click**, chỉ được nhắc ở footer | Tính năng ẩn |
| 🟠 | Không có sửa, nhân bản, sắp xếp | Muốn đổi 30 → 40 phút thì phải tạo lại từ đầu |
| 🟠 | Không có empty state | Danh sách trống thì màn trắng |
| 🟡 | Dòng phụ lặp tiêu đề ("Tạm ngưng sau 30 phút" / "Tạm ngưng hệ thống sau 30 phút") | Không thêm thông tin |
| 🟡 | 4 nút "Chạy" outline cùng độ nặng | Mắt không có điểm neo |
| 🟡 | Tag "Theo thời lượng" / "Lưu lượng mạng" | Lặp thông tin đã có trong dòng phụ |

### 3.5 Lịch lặp

| Mức | Lỗi | Hậu quả |
|---|---|---|
| 🔴 | Xoá ngay, thùng rác cạnh toggle (cách khoảng 20px) | Bật/tắt trượt tay thành xoá |
| 🟠 | Form thêm không có tiêu đề nhóm, nhìn như một dòng dữ liệu | Không phân biệt "tạo mới" và "đã có" |
| 🟠 | Chip ngày khoảng 28×22px | Dưới vùng chạm tối thiểu (32px desktop) |
| 🟠 | Dòng bị tắt làm mờ cả toggle | Control duy nhất cần bấm lại khó thấy nhất |
| 🟠 | Không sửa được giờ của lịch có sẵn | Phải xoá rồi tạo lại |
| 🟠 | Footer "Bật 'Khởi động cùng hệ thống' nếu cần" | Cảnh báo bị động, không có nút bật tại chỗ |
| 🟡 | Dropdown hẹp → "Khoá Màn Hì…", Title Case (§2.2) | Cắt nhãn, sai chính tả kiểu |
| 🟡 | Giờ 23:30 cỡ 34px weight 300 | Lệch tông so với mọi danh sách khác |

### 3.6 Nhật ký

| Mức | Lỗi | Hậu quả |
|---|---|---|
| 🔴 | "Xoá nhật ký" ghost button, xoá toàn bộ không xác nhận | Mất lịch sử |
| 🟠 | Không lọc, không tìm | Không tra được "lần lỗi gần nhất" |
| 🟠 | Cột "Hành động" rộng thừa khoảng 400px, cột "Nguồn" bị cắt (`Preset "Tạm ngưng sau 30 p…`), không có `title` | Mất thông tin quan trọng nhất |
| 🟠 | "Lỗi · Không có quyền" không có hướng khắc phục | Dead-end |
| 🟡 | Badge "Thử" màu cam | Đọc như cảnh báo, thực ra là dry-run |
| 🟡 | Không có empty state chuẩn | — |

### 3.7 Cài đặt

| Mức | Lỗi | Hậu quả |
|---|---|---|
| 🟠 | 3 tab (Cảnh báo/Ứng dụng/Nâng cao), tab đầu chỉ có 4 dòng | Phân mảnh; phải click để tìm |
| 🟠 | "Chế độ thử" dùng cùng kiểu toggle với "Âm báo" | Không phân biệt được cài đặt có hệ quả lớn |
| 🟡 | Footer hiện đường dẫn file `~/.config/...` | Không có nút "Mở thư mục" hay "Sao chép" |
| 🟡 | Segmented "Không / 1 phút / 2 phút / 5 phút / 10 phút" | Ổn, nhưng radius không đồng tâm |

### 3.8 Light theme

- Tương phản `--ink-3` và nút primary không đạt (§2.3).
- Toast light dùng `#202020` / `#fff` (`:396`), gần đen/trắng thuần, khác hẳn tông ấm của theme.
- Viền `--line-2` 1.37:1, nên input và nút ghost gần như không có biên.

### 3.9 Cửa sổ nhỏ (720×560)

- Lưới Hành động chỉ còn icon (🔴, §3.1).
- Chip thời lượng cắt còn 3, không fade hay cuộn.
- Tóm tắt bị cắt.
- Rail thu về 64px nhưng không có tooltip hiện khi hover hoặc focus (chỉ `title` native).

---

## 4. Trạng thái, chức năng & QOL còn thiếu

### 4.1 Chống lỗi (bắt buộc)

| Thao tác | Cơ chế |
|---|---|
| Thực hiện ngay | **Nhấn giữ 800ms** (nút lấp dần); bàn phím Enter/Space mở popover "Tắt máy ngay?" [Huỷ] [Tắt máy] |
| Huỷ hẹn bằng Esc | Toast "Đã huỷ hẹn giờ · Hoàn tác" (6s) |
| Xoá preset / lịch / mix / bài | Xoá lạc quan + toast "Đã xoá … · Hoàn tác" (6s) + `Ctrl+Z` |
| Xoá nhật ký | Popover xác nhận có số lượng: "Xoá 42 mục nhật ký?" [Huỷ] [Xoá 42 mục] |
| Bật "Chế độ thử" | Banner cố định ở mọi màn (§7) |

### 4.2 Trạng thái

| Loại | Nơi | Nội dung |
|---|---|---|
| Empty | Preset | "Chưa có preset" · "Thiết lập hẹn giờ rồi chọn *Lưu preset* để chạy lại nhanh." · [Đi tới Hẹn giờ] |
| Empty | Lịch lặp | "Chưa có lịch" · "Tự động tắt máy vào giờ cố định mỗi ngày." · focus vào form Lịch mới |
| Empty | Nhật ký | "Chưa có hoạt động" · "Mỗi lần hẹn giờ chạy, bị huỷ hoặc lỗi sẽ hiện ở đây." |
| Empty | Âm thanh › Đang phát | "Chưa bật âm thanh nào" · [Phát ngẫu nhiên] |
| Filtered-zero | Nhật ký, danh mục âm thanh | "Không có mục khớp bộ lọc" · [Xoá bộ lọc] |
| Loading | Danh sách tiến trình, thumbnail YouTube | Skeleton dòng 36px; không spinner giữa màn |
| Error | Quyền hệ thống | Inline: "Sleepy chưa có quyền tắt máy." · [Cách cấp quyền] |
| Error | YouTube / mạng | "Không tải được video." · [Thử lại] |
| Unavailable | Pin / Ngủ đông | Disable + dòng phụ lý do: "Thiết bị không có pin", "Hệ thống không hỗ trợ" |
| Edge | Tên preset/mix/tiến trình dài | `text-overflow: ellipsis` + `title`; tối đa 2 dòng ở card |
| Edge | Ảnh ambient lỗi | Fallback gradient `--surface-3` + icon kênh |
| Edge | Tiến trình không tồn tại | Inline dưới input: "Không thấy tiến trình đang chạy" |

### 4.3 QOL

- Preset: menu `⋯` gồm **Đổi tên · Sửa · Nhân bản · Xoá**; "Sửa" mở màn Hẹn giờ đã điền sẵn.
- Lịch: sửa giờ inline; nút **Bật khởi động cùng hệ thống** ngay trong cảnh báo.
- Nhật ký: lọc theo Kết quả (Tất cả / Đã thực hiện / Đã huỷ / Lỗi / Chạy thử).
- Đang chạy: chip **+5 phút · +15 phút · +1 giờ** thay cho nhóm "Hoãn".
- Cài đặt: [Mở thư mục dữ liệu] cạnh đường dẫn.
- Command palette `Ctrl+K`: chạy preset, chuyển màn, bật/tắt âm thanh.

---

## 5. Hệ thống Typography

### 5.1 Nguyên tắc

1. **Một family**: Be Vietnam Pro (đã bundle, hỗ trợ dấu tiếng Việt tốt). Mono chỉ dùng cho đường dẫn và mã.
2. **Một thang tỉ lệ duy nhất**, bước khoảng 1.2, toàn số nguyên px, line-height bội số 4px.
3. **Ba weight**: 400 (đọc), 500 (nhấn nhẹ / control), 600 (tiêu đề / số chính). Weight 300 chỉ dành cho số hiển thị ≥ 48px. **Cấm 200.**
4. **Phân cấp bằng cỡ + màu trước, weight sau.** Không dùng `text-transform`.
5. **Số luôn `font-variant-numeric: tabular-nums`** (đồng hồ, giờ, phần trăm, KB/s).
6. **Responsive không đổi cỡ chữ lẻ**: chỉ role `display` và `time-lg` được co giãn theo container (`cqw`); mọi role khác cố định.

### 5.2 Thang cỡ (type scale)

| Token | Size / Line-height | Weight | Tracking | Màu mặc định | Vai trò |
|---|---|---|---|---|---|
| `--type-display` | `clamp(48px, 16cqw, 88px)` / 1.0 | 300 | −0.03em | `--ink` | Đồng hồ đếm ngược (đang chạy), số giờ:phút trên dial |
| `--type-time-lg` | 32px / 40px | 500 | −0.02em | `--ink` | Giờ trong danh sách Lịch lặp, giờ trong form Lịch mới |
| `--type-h1` | 22px / 28px | 600 | −0.015em | `--ink` | Tiêu đề trang (một mỗi màn) |
| `--type-h2` | 15px / 20px | 600 | −0.005em | `--ink` | Tiêu đề section / panel |
| `--type-h3` | 12px / 16px | 500 | +0.02em | `--ink-3` | Nhãn nhóm control ("Hành động", "Thời điểm") |
| `--type-body-lg` | 15px / 24px | 400 | 0 | `--ink-2` | Câu điều kiện ("Sau [20] phút…"), tên mục chính trong player |
| `--type-body` | 14px / 20px | 400 | 0 | `--ink` | Nội dung mặc định, tên dòng trong list, tóm tắt |
| `--type-control` | 13px / 20px | 500 | 0 | theo component | Nút, chip, segmented, tab, dropdown, menu |
| `--type-caption` | 12px / 16px | 400 | 0 | `--ink-3` | Dòng phụ, ghi chú, th bảng, helper text, footer |
| `--type-micro` | 11px / 12px | 600 | +0.01em | theo component | **Chỉ** badge số, `<kbd>`, nhãn chip ngày |

Mười role, sáu cỡ cố định (11 · 12 · 13 · 14 · 15 · 22) + 32 + display. Không có cỡ nào khác được phép xuất hiện.

```css
:root {
  --font: 'Be Vietnam Pro', 'Ubuntu Sans', 'Cantarell', system-ui, sans-serif;
  --mono: 'Ubuntu Sans Mono', 'JetBrains Mono', ui-monospace, monospace;

  --fs-micro: 11px;   --lh-micro: 12px;
  --fs-caption: 12px; --lh-caption: 16px;
  --fs-control: 13px; --lh-control: 20px;
  --fs-body: 14px;    --lh-body: 20px;
  --fs-body-lg: 15px; --lh-body-lg: 24px;
  --fs-h3: 12px;      --lh-h3: 16px;
  --fs-h2: 15px;      --lh-h2: 20px;
  --fs-h1: 22px;      --lh-h1: 28px;
  --fs-time-lg: 32px; --lh-time-lg: 40px;
  --fs-display: clamp(48px, 16cqw, 88px);

  --fw-regular: 400; --fw-medium: 500; --fw-semibold: 600; --fw-light: 300;
}
```

### 5.3 Ánh xạ từ selector hiện tại sang role

| Selector hiện tại | Hiện tại | → Role mới |
|---|---|---|
| `.brand` | 13px 600 | `control` 600 |
| `.brand small` | 11.5px, capitalize | **Xoá** |
| `h1` | `clamp(18px…25px)` 600 | `h1` |
| `.eyebrow` | 11.5–12px | **Xoá** (hoặc `caption` nếu là đồng hồ/meta, đặt ở vùng Page meta §7) |
| `.label` | 11–12px 500 (3 định nghĩa) | `h3` |
| `.group h2` | 12–13px 600 `--ink-3` | `h2` (màu `--ink`) |
| `.btn` / `.btn.small` | 13 / 12.5 / 13.5px | `control` |
| `.btn.big` | 13.5 / 14 / 15 / 15.5px | `body` 600 (nút primary lớn duy nhất) |
| `.chip`, `.seg button`, `.stabs button`, `.snd-tab`, `.bgroup button` | 12–13.5px | `control` |
| `.sub-tab` | 12px | `control` (hoặc chuyển thành dropdown, §8.3) |
| `.act` | 11.5–12.5px, capitalize | `control` |
| `.dd-text` | 13px, capitalize | `control` |
| `.rail button` | 11.5–12px | `caption` 500 (dạng mở rộng: `control`) |
| `.rail .badge` | 9.5–10px | `micro` |
| `.mini .v` / `.mini .d` | 9.5–12.5px / 10.5px | `control` 600 / `caption` |
| `.time-in input` (setup dial) | 18cqw / 60px weight 300 | `display` |
| `.time-in .sep` | 54px weight 200 | `display`, weight 300, màu `--ink-3` |
| `.time-in .unit`, `.tu span` | 10.5–13px | `caption` |
| `.dial .cap` | 11–13px capitalize | `caption` |
| `.dial .sub` | 11–13.5px | `caption` màu `--ink-2` |
| `.dial .live` | 14cqw / 10.3cqw | `display` |
| `.orb .big` | 20cqw / 12cqw weight 200 | `display` |
| `.orb .what` | 12–15px | `body-lg` |
| `.orb .src` | 11–12.5px | `caption` |
| `.status-line` | 12.5–13px | **Xoá** ("Còn 2 phút" thừa) |
| `.sentence`, `.sentence input` | 14–17px | `body-lg`; input 600 `--ink` |
| `.note` | 12–12.5px | `caption` |
| `.summary` | 13.5–14px | `body` |
| `.pname` | 14–15.5px 500–600 | `body` 500 |
| `.pdesc` | 12.5–13px | `caption` |
| `.tag` | 11–11.5px | `caption` (hoặc xoá, §3.4) |
| `.stime` | 22–34px weight 300 | `time-lg` |
| `.adder .time-in input` | 17 / 19 / 28 / 34 / 40px | `time-lg` |
| `.day` | 10.5–11.5px | `micro` |
| `.hist th` | 11.5–12px capitalize | `caption` 500 |
| `.hist td` | 13px | `body` |
| `.hist .sub` | 11.5–12px | `caption` |
| `.set b` / `.set p` | 13.5–14.5px / 12–12.5px | `body` 500 / `caption` |
| `.mono` | 13px | `mono` 13px / 20px |
| `.toast` | 13–13.5px | `control` |
| `.dry` | 12–12.5px | `caption` 500 |
| `.pl-meta b` / `small` | 13px / 11px | `body` 500 / `caption` |
| `.pl-num`, `.pager .num`, `.snd-count` | 11.5–12px | `caption` tabular |
| `.tick-l` (SVG) | 11px | `micro` 400 |

### 5.4 Quy tắc màu chữ (text hierarchy)

| Token | Dùng cho | Dark | Light | Tỉ lệ tối thiểu |
|---|---|---|---|---|
| `--ink` | Tiêu đề, giá trị, tên mục, nội dung chính | `#E6EAF7` | `#2B2420` | ≥ 12:1 |
| `--ink-2` | Câu mô tả, nhãn control không chọn, giá trị phụ | `#A9B2D3` | `#6F625A` | ≥ 5.5:1 |
| `--ink-3` | Caption, helper, th bảng, placeholder | `#8A94B8` | `#756759` | **≥ 4.5:1** |
| `--ink-disabled` | Control bị vô hiệu (kèm lý do bằng chữ) | `#5A6386` | `#B8ACA2` | không bắt buộc (WCAG miễn) |
| `--accent-ink` | Chữ trên nền accent | `#0A1030` | `#FFFFFF` | ≥ 4.5:1 |

**Cấm:** `--ink-3` cho bất kỳ chữ nào mang thông tin cần hành động (giá trị, trạng thái lỗi, cảnh báo).

---

## 6. Phân cấp Header & tiêu đề

### 6.1 Cây tiêu đề chuẩn (áp dụng cho mọi màn)

```
L0  Window chrome      Titlebar — tên app, không tagline              (không phải heading)
L1  Page title   <h1>  Một mỗi màn. Trùng tên mục rail.               --type-h1
     └ Page meta       Thông tin trạng thái của trang (tuỳ chọn)      --type-caption, cùng hàng h1, căn phải
L2  Section      <h2>  Khối chức năng lớn trong trang                 --type-h2
L3  Group label  <h3>  Nhãn cho một nhóm control / một field          --type-h3
L4  Item title         Tên dòng trong list (preset, lịch, kênh)        --type-body 500
L5  Item meta          Dòng phụ dưới tên                              --type-caption
```

### 6.2 Quy tắc

1. **Một `<h1>` duy nhất mỗi màn**, nội dung đúng bằng nhãn rail. Bỏ eyebrow trùng lặp.
2. **Không nhảy cấp**: không có `<h3>` nếu thiếu `<h2>` cha. Nếu màn chỉ có một section thì bỏ `<h2>`, đưa `<h3>` lên làm nhãn nhóm trực tiếp dưới `<h1>`.
3. **Heading là danh từ**, nút là động từ (xem §11).
4. **Khoảng cách theo cấp** (phía trên / phía dưới):

| Cấp | Margin trên | Margin dưới tới nội dung |
|---|---|---|
| `h1` | 0 (đỉnh vùng Page header) | 24px |
| `h2` | 32px (giữa hai section) | 12px |
| `h3` | 20px (giữa hai nhóm) | 8px |
| Item title → Item meta | — | 2px |

5. **Cùng hàng với `h1`** chỉ được có: Page meta (trái/phải) và *tối đa một* action cấp trang (ví dụ "Xoá nhật ký"). Không đặt tab ở đây (Cài đặt hiện đang vi phạm).

### 6.3 Áp dụng cụ thể

| Màn | `h1` | Page meta (phải) | `h2` | `h3` |
|---|---|---|---|---|
| Hẹn giờ (setup) | Hẹn giờ | Thứ bảy · 05:34 | — | Hành động · Thời điểm · Điều kiện · Âm thanh khi ngủ |
| Hẹn giờ (đang chạy) | *(ẩn trực quan, giữ `sr-only`)* "Đang hẹn giờ" | Banner keep-awake dạng chữ | — | — |
| Âm thanh | Âm thanh | "Đang phát 3 kênh" / "Tạm dừng" | — | Danh mục (dropdown) · Mixer |
| Preset | Preset | "4 preset" | — | — |
| Lịch lặp | Lịch lặp | "1 lịch đang bật" | Lịch mới · Lịch đã tạo | Giờ · Ngày · Hành động |
| Nhật ký | Nhật ký | Bộ lọc kết quả + [Xoá nhật ký] | — | — |
| Cài đặt | Cài đặt | — | Cảnh báo · Ứng dụng · Nâng cao | tên từng dòng cài đặt (Item title) |

---

## 7. Bản đồ vùng cố định (Layout regions)

Mọi màn dùng chung **một khung**. Vị trí các vùng là **bất biến**: không màn nào được tự di chuyển CTA, banner hay toast.

```
┌───────────────────────────────────────────────────────────────────────┐
│ R1 TITLEBAR  h=36  ☾ Sleepy                                 – □ ×     │ drag region
├──────────┬────────────────────────────────────────────────────────────┤
│ R2 RAIL  │ R3 SYSTEM BANNER  h=36 (chỉ khi có: dry-run / thiếu quyền) │
│ w=64     ├────────────────────────────────────────────────────────────┤
│ (≥1100:  │ R4 PAGE HEADER  h=56                                       │
│  w=184)  │   <h1>                         [Page meta] [Page action]   │
│          ├────────────────────────────────────────────────────────────┤
│  nav     │ R5 CONTENT  (cuộn dọc khi tràn; max-width 1040, căn giữa)  │
│  items   │                                                            │
│          │                                                            │
│          │                                                            │
│  ─────   ├────────────────────────────────────────────────────────────┤
│ R6 NOW   │ R7 ACTION BAR  h=64, border-top 1px (chỉ màn có CTA chính) │
│ PLAYING  │   [Tóm tắt / trạng thái]            [Secondary] [Primary]  │
│ h=56     │                                                            │
└──────────┴────────────────────────────────────────────────────────────┘
                     R8 TOAST: neo đáy-giữa, cách mép trên R7 16px
                     R9 POPOVER/DROPDOWN: neo vào trigger, không che R7
```

### 7.1 Đặc tả từng vùng

| Vùng | Kích thước | Nội dung được phép | Cấm |
|---|---|---|---|
| **R1 Titlebar** | h 36px; padding-x 16px | Icon + "Sleepy" (`control` 600); 3 nút cửa sổ 36×36 | Tagline, trạng thái, nút chức năng |
| **R2 Rail** | w 64px (icon + tooltip); ≥1100px: 184px (icon + nhãn ngang); item h 40px, gap 4px, padding 8px | 6 mục điều hướng theo thứ tự cố định: Hẹn giờ · Âm thanh · Preset · Lịch lặp · Nhật ký · Cài đặt. Badge số ở góc trên-phải icon | Nhãn chồng dưới icon cỡ 11px |
| **R3 System banner** | h 36px, full width R5, nền `--warn-bg`, viền dưới 1px | Một câu + một action: "Chế độ thử đang bật · Hành động sẽ không được thực hiện. [Tắt chế độ thử]" | Đặt banner ở giữa content; nhiều banner cùng lúc (ưu tiên: thiếu quyền > dry-run) |
| **R4 Page header** | h 56px; padding-top 24px; baseline `h1` thẳng với cạnh trên R5 + 24px | `h1` trái; Page meta + tối đa 1 Page action phải | Tab, eyebrow, nhiều nút |
| **R5 Content** | padding-x 32px (≤760: 16px); max-width 1040px căn giữa; gap section 32px | Nội dung màn | Nút CTA chính (thuộc R7) |
| **R6 Now playing** | h 56px, đáy rail, cách đáy 8px | Chỉ hiện khi **có** job hoặc âm thanh đang phát: vòng tiến độ 24px + thời gian còn lại (`control` 600, tabular). Click → về màn tương ứng | Hiện khi rảnh ("Sleepy" + vòng rỗng) |
| **R7 Action bar** | h 64px; padding-x 32px; border-top 1px `--border`; nền `--surface-1` | Trái: tóm tắt (`body`, `--ink-2` + đoạn nhấn `--ink` 600). Phải: Secondary rồi Primary, gap 8px. Primary luôn nằm **góc phải-dưới** | Nút nguy hiểm cạnh primary |
| **R8 Toast** | max-w 420px; h ≥ 40px; radius `--r-md`; đáy = top R7 − 16px (màn không có R7: đáy cửa sổ − 24px) | Một câu + tối đa 1 action ("Hoàn tác", "Thử lại"); tự đóng 4s (6s nếu có action) | Toast chồng nhau (thay thế toast cũ) |
| **R9 Popover** | neo trigger, offset 8px, radius `--r-lg`, `--shadow-pop` | Xác nhận, menu `⋯`, dropdown | Che R7 khi mở từ R7 (mở lên trên) |

### 7.2 Hành vi responsive (theo bề rộng cửa sổ)

| Breakpoint | Thay đổi |
|---|---|
| ≥ 1100px | Rail 184px có nhãn; content 2 cột |
| 760–1099px | Rail 64px; content 2 cột co lại |
| < 760px | Rail 64px; content **1 cột**; R7 giữ nguyên; lưới Hành động → dropdown có nhãn; chip cuộn ngang có fade 24px ở mép |
| < 560px chiều cao | R5 cuộn dọc; R4 thu còn h 48px; dial thu tối thiểu 200px |

**Quy tắc vàng:** khi thiếu chỗ thì **đổi dạng component** (lưới → dropdown, chip → cuộn), **không bao giờ xoá nhãn** của lựa chọn có hệ quả.

---

## 8. Vị trí cố định theo từng màn

### 8.1 Hẹn giờ: thiết lập

```
R4  [h1 Hẹn giờ]                                       [Thứ bảy · 05:34]
R5  ┌──────────── Cột A (1fr) ────────────┐  ┌─── Cột B (360px) ───────┐
    │                                     │  │ h3 Hành động             │
    │            DIAL (≤ 360px)           │  │  ▢ Tắt máy        (list  │
    │         1 : 00   giờ  phút          │  │  ▢ Khởi động lại   6 dòng│
    │       Tắt máy lúc 06:34 hôm nay     │  │  ▢ Tạm ngưng       h 36, │
    │                                     │  │  ▢ Ngủ đông · lý do  2 cột│
    │  ── gap 16 ──                       │  │  ▢ Khoá màn hình   ≥ 760)│
    │  [15p][30p][45p][1g][1g30][2g][3g]  │  │  ▢ Đăng xuất             │
    │   (chip ngay dưới dial, căn giữa)   │  │ h3 Thời điểm             │
    └─────────────────────────────────────┘  │  [Thời lượng|Giờ|Đ.kiện] │
                                             │  (panel điều kiện)       │
                                             │ h3 Âm thanh khi ngủ      │
                                             │  [Dropdown: Không ▾]     │
                                             └──────────────────────────┘
R7  Tắt máy sau 1 giờ · lúc 06:34          [Lưu preset]  [▶ Bắt đầu ⌃↵]
```

Cố định:
- Chip nhanh **luôn liền dưới dial** (gap 16px), không trôi xuống đáy cột.
- Đoạn hướng dẫn kéo/cuộn/Shift → **xoá**; thay bằng tooltip trên dial + `aria-describedby`.
- "Âm thanh khi ngủ" là một dropdown; mục cuối "Mở trang Âm thanh…" có icon ↗ để báo rằng nó điều hướng.
- Cột B luôn bắt đầu thẳng hàng với đỉnh dial; không có khoảng trống giữa các nhóm > 24px.

### 8.2 Hẹn giờ: đang chạy

```
R3  (banner dry-run nếu bật)
R4  (h1 sr-only)                                [☾ Đang giữ máy thức] ← chữ, không viền
R5            ┌──────── ORB ────────┐
              │        01:34        │  display
              │ Tắt máy lúc 05:36   │  body-lg (Tắt máy = 600)
              │ Bắt đầu thủ công    │  caption
              └─────────────────────┘
                  gap 24
              [+5 phút] [+15 phút] [+1 giờ]        (control, nhóm secondary)
R7  Còn lại hiển thị ở ORB — R7 trái để trống      [Tắt máy ngay… (giữ)]  [Huỷ hẹn giờ]
```

Cố định:
- "Huỷ hẹn giờ" là action an toàn chính → **góc phải-dưới R7** (vị trí primary nhất quán với màn setup).
- "Tắt máy ngay…" (hold-to-confirm) nằm **trái** nút Huỷ, cách tối thiểu 16px, kiểu ghost với chữ `--danger`.
- Xoá "Còn 2 phút".

### 8.3 Âm thanh

```
R4  [h1 Âm thanh]                       [Đang phát 3 kênh] [⏸] [Tắt hết]
R5  Tabs (một tầng):  Kênh · Bộ mix · Playlist · YouTube        [Danh mục ▾]
    ┌── List kênh (1fr) ───────────────────┐ ┌── Panel (320px) ──────────┐
    │ ▢ ảnh 32  Mưa nhẹ         ━━━━●━━  ● │ │ Tab Kênh: MIXER đang phát │
    │           caption                    │ │  • Mưa nhẹ      ━━━●━  ×  │
    │ …                                    │ │  • Gió          ━●━━━  ×  │
    └──────────────────────────────────────┘ │ Không gian  [Hẹp|Giữa|Rộng]│
                                             │ Nhỏ dần 10 phút cuối  [◉] │
                                             │ Tab Playlist/YouTube:     │
                                             │   artwork + transport     │
                                             └───────────────────────────┘
```

Cố định:
- **Một** tầng tab. Danh mục thành dropdown đặt ở cuối hàng tab (bỏ chip xuống dòng).
- Trạng thái phát + Play/Pause tổng + "Tắt hết" chỉ ở **R4 phải**. Xoá "8 kênh" ở đáy.
- Mỗi dòng kênh: trạng thái bật/tắt bằng **toggle hoặc nút play có nhãn**, không chỉ dựa vào độ sáng; bỏ chevron không rõ nghĩa (nếu là "tuỳ chọn" thì đổi thành `⋯` có tooltip).
- Đĩa vinyl chỉ dùng cho Playlist/YouTube.

### 8.4 Preset

```
R4  [h1 Preset]                                                 [4 preset]
R5  ☾  Tạm ngưng sau 30 phút                       Thời lượng   [▶ Chạy] [⋯]
       Tạm ngưng · 30 phút                         (caption)
    ─────────────────────────────────────────────────────────────── 1px
```
- Dòng h 56px; `[Chạy]` ghost, chỉ đậm khi hover/focus dòng; `[⋯]` chứa Đổi tên · Sửa · Nhân bản · Xoá. **Thùng rác không lộ ra ngoài.**
- Dòng phụ là *tham số* (hành động · thời lượng/điều kiện), không lặp tiêu đề.

### 8.5 Lịch lặp

```
R4  [h1 Lịch lặp]                                         [1 lịch đang bật]
R3/R5 Cảnh báo inline (nếu chưa bật autostart):
    "Sleepy phải đang chạy để thực hiện lịch."   [Bật khởi động cùng hệ thống]
R5  h2 Lịch mới
    h3 Giờ [23:30]  h3 Ngày [T2..CN]  h3 Hành động [Tắt máy ▾]   [+ Thêm lịch]
    h2 Lịch đã tạo
    23:30   T2 T3 T4 T5 T6 T7 CN    Tắt máy ▾        [◉ toggle]   [⋯]
            Lần tới: hôm nay 23:30 (caption)
```
- Chip ngày 32×32px. Toggle luôn ở độ tương phản đầy đủ kể cả khi dòng tắt (chỉ làm mờ giờ và ngày).
- Xoá nằm trong `[⋯]`; nếu giữ icon riêng thì cách toggle ≥ 24px và có Hoàn tác.

### 8.6 Nhật ký

```
R4  [h1 Nhật ký]               [Kết quả: Tất cả ▾]   [Xoá nhật ký…]
R5  Thời gian (120) | Hành động (1fr) | Nguồn (1fr) | Kết quả (140)
```
- Cột dùng tỉ lệ cố định như trên; Nguồn có `title` đầy đủ.
- Kết quả: badge **icon + chữ** (✓ Đã thực hiện · ✕ Đã huỷ · ! Lỗi · ◌ Chạy thử). Dòng Lỗi có link "Cách khắc phục".

### 8.7 Cài đặt

```
R4  [h1 Cài đặt]
R5  h2 Cảnh báo
      Báo trước                    [Không|1|2|5|10 phút]
      Chờ sau khi đạt điều kiện    [30 giây|60 giây|2 phút]
      Âm báo                       [◉]
    h2 Ứng dụng
      …
    h2 Nâng cao
      Chế độ thử  ⚠                [◉]   ← dòng có nền --warn-bg nhẹ khi bật
      Dữ liệu   ~/.config/…/sleepy.json   [Mở thư mục]
```
- Bỏ tab; một trang cuộn với các `h2`.
- Control luôn căn **phải**, thẳng một cột; label + mô tả căn trái, max 52ch.

---

## 9. Design tokens

### 9.1 Spacing (lưới 4px)

| Token | px | Dùng cho |
|---|---|---|
| `--s-1` | 4 | icon ↔ chữ trong chip nhỏ, khe segmented |
| `--s-2` | 8 | gap giữa nút cạnh nhau, padding dọc chip |
| `--s-3` | 12 | padding ngang chip/nút nhỏ, gap h2 → nội dung |
| `--s-4` | 16 | padding card, gap trong nhóm, gutter mobile |
| `--s-5` | 24 | gap giữa các nhóm (h3), padding-top R4 |
| `--s-6` | 32 | gap giữa section (h2), padding-x R5 |
| `--s-7` | 48 | khoảng thở lớn (empty state) |

Cấm giá trị lẻ (5, 6, 7, 9, 10, 11, 13, 14…) và `clamp()` cho padding. Responsive chỉ đổi `--pad-x` giữa `--s-4` và `--s-6`.

### 9.2 Radius (đồng tâm)

| Token | px | Dùng cho |
|---|---|---|
| `--r-xs` | 4 | `<kbd>`, thanh progress |
| `--r-sm` | 6 | badge, chip ngày, item segmented (track padding 2px → track `--r-sm`+2 = 8) |
| `--r-md` | 8 | nút, input, dropdown trigger, chip, dòng list hover, toast |
| `--r-lg` | 12 | card, popover, panel, track segmented chứa item `--r-md` với padding 4px |
| `--r-full` | 999 | toggle, avatar/artwork tròn, nút transport tròn |

Quy tắc: `radius_ngoài = radius_trong + padding`. Ví dụ track segmented padding 4 + item 8 → track 12 (`--r-lg`).

### 9.3 Màu

```css
:root {                       /* DARK */
  --bg:            #0A0F22;
  --surface-1:     #10162C;   /* rail, action bar */
  --surface-2:     #161D38;   /* card, input */
  --surface-3:     #1F2748;   /* hover, selected */
  --border:        #242C4C;   /* hairline mặc định */
  --border-strong: #343E66;   /* input, nút ghost, focus vùng */
  --ink:           #E6EAF7;
  --ink-2:         #A9B2D3;
  --ink-3:         #8A94B8;
  --ink-disabled:  #5A6386;
  --accent:        #B7C5FF;
  --accent-hover:  #C9D4FF;
  --accent-ink:    #0A1030;
  --accent-soft:   rgb(183 197 255 / .12);
  --ok:            #7FDCAA;   --ok-soft:     rgb(127 220 170 / .12);
  --warn:          #FFB27A;   --warn-soft:   rgb(255 178 122 / .12);
  --danger:        #FF7A88;   --danger-soft: rgb(255 122 136 / .12);
  --focus:         #B7C5FF;
}
:root[data-theme='light'] {
  --bg:            #FFFDFA;
  --surface-1:     #F8F2EA;
  --surface-2:     #FFFFFF;
  --surface-3:     #F2EAE0;
  --border:        #E8DED3;
  --border-strong: #9A8673;   /* 3.43:1 — viền control */
  --ink:           #2B2420;
  --ink-2:         #6F625A;
  --ink-3:         #756759;   /* 5.39:1 nền · 4.92:1 rail */
  --ink-disabled:  #B8ACA2;
  --accent:        #3D4BA8;   /* chàm — chữ trắng 7.58:1, tách khỏi danger */
  --accent-hover:  #2F3C8F;
  --accent-ink:    #FFFFFF;
  --ok:            #2F7A47;  --warn: #8F4C07;  --danger: #C23A30;
  --focus:         #3D4BA8;
}
```

Phân bổ 60-30-10: 60% `--bg`/`--surface-*`, 30% `--ink-*` và viền, ≤10% `--accent` (chỉ primary CTA, item đang chọn, tiến độ). Semantic (`ok`/`warn`/`danger`) **luôn đi kèm icon hoặc chữ**, không đứng một mình.

### 9.4 Elevation

| Lớp | Cách thể hiện |
|---|---|
| 0 Nền | `--bg` + canvas sao (độ sáng ≤ 40% phía sau R5; 100% ở màn đang chạy) |
| 1 Vùng | `--surface-1` + border 1px `--border` (rail, action bar) |
| 2 Card / input | `--surface-2` + border 1px |
| 3 Nổi (popover, dropdown, toast) | `--surface-3` + border `--border-strong` + `--shadow-pop: 0 8px 24px -12px rgb(0 0 0 / .6)` |

Bỏ toàn bộ `box-shadow` ở lớp 0–2 và toàn bộ `backdrop-filter`. Bỏ bokeh trôi.

### 9.5 Motion

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--dur-fast` | 120ms | hover, màu, toggle |
| `--dur-base` | 200ms | popover, tab, chip |
| `--dur-slow` | 320ms | chuyển màn, toast vào/ra |
| `--ease-out` | `cubic-bezier(.22, .9, .25, 1)` | vào |
| `--ease-in` | `cubic-bezier(.4, 0, 1, 1)` | ra |

Chỉ animate `opacity`, `transform`, `background-color`, `color`. `prefers-reduced-motion`: giữ opacity, bỏ transform, dừng canvas sao.

---

## 10. Component spec

### 10.1 Chiều cao control (đồng bộ khi đặt cạnh nhau)

| Size | Height | Padding-x | Font | Dùng |
|---|---|---|---|---|
| `sm` | 28px | 10px | `control` | chip ngày, nút trong bảng, tag |
| `md` | 36px | 14px | `control` | nút, input, dropdown, segmented item, chip |
| `lg` | 44px | 20px | `body` 600 | **chỉ** primary trong R7 |

Input và nút cùng hàng phải cùng size. Vùng chạm tối thiểu 32×32px (dùng `::after` mở rộng nếu phần nhìn thấy nhỏ hơn).

### 10.2 Button

| Biến thể | Nền | Chữ | Viền | Dùng |
|---|---|---|---|---|
| Primary | `--accent` | `--accent-ink` | — | Một mỗi màn, góc phải R7 |
| Secondary | `--surface-2` | `--ink` | `--border-strong` | Hành động phụ |
| Ghost | trong suốt | `--ink-2` | — | Hành động cấp ba, trong dòng list |
| Danger-ghost | trong suốt | `--danger` | — | Hành động nguy hiểm (luôn đi kèm xác nhận/hold/undo) |
| Icon | 36×36 | `--ink-2` | — | Bắt buộc `aria-label` + tooltip có `<kbd>` |

Trạng thái: hover (+1 bậc surface), active (scale .98), focus (§12), disabled (`--ink-disabled`, không đổi opacity cả khối), loading (spinner 14px thay icon, giữ nguyên bề rộng).

### 10.3 Segmented

Track `--surface-1`, padding 4px, radius `--r-lg`; item h 28px, radius `--r-md`; item chọn `--surface-3` + chữ `--ink` 500. Không dùng shadow inset.

### 10.4 List row

h 56px (có meta) / 44px (không meta); padding-x 12px; hover `--surface-3` radius `--r-md`; divider 1px `--border` giữa các dòng (không có ở dòng cuối). Action trong dòng: ghost, hiện đầy đủ khi hover hoặc focus-within, mờ 60% khi không (vẫn bấm được, vẫn đọc được bởi screen reader).

### 10.5 Badge trạng thái

h 20px, padding-x 8px, radius `--r-sm`, font `caption` 500, nền `*-soft`, chữ màu semantic, **icon 12px bắt buộc**.

### 10.6 Toast

Xem R8. Cấu trúc: `[icon 16] Thông điệp · [Action]  [×]`. Có `role="status"` (thành công) / `role="alert"` (lỗi).

---

## 11. Microcopy & thuật ngữ

### 11.1 Quy tắc

- Sentence case ở mọi nơi. Không viết tắt đơn vị ("10p" → "10 phút").
- Nút: **động từ + tân ngữ** khi mơ hồ ("Xoá 42 mục", "Tắt máy ngay"). Cấm "OK", "Xác nhận", "Đồng ý".
- Heading: danh từ ngắn.
- Lỗi: nói chuyện gì đã xảy ra + cách sửa, không đổ lỗi.
- Một khái niệm, một từ: dùng **"Hẹn giờ"** (không lẫn "hẹn"), **"Preset"** (giữ nguyên, nhất quán), **"Lịch lặp"**.

### 11.2 Bảng thay thế

| Hiện tại | Đề xuất | Lý do |
|---|---|---|
| Sleepy · hẹn giờ hệ thống (titlebar) | Sleepy | Bỏ tagline |
| Thiết lập hẹn giờ | Hẹn giờ | Trùng nhãn rail |
| Bắt đầu hẹn giờ | Bắt đầu | Ngữ cảnh đã rõ |
| Lưu làm preset | Lưu preset | Gọn |
| Thực hiện ngay | *{Hành động}* ngay… (VD: "Tắt máy ngay…") | Nói rõ hậu quả; "…" báo hiệu cần xác nhận |
| Huỷ hẹn | Huỷ hẹn giờ | Rõ đối tượng |
| Hoãn · 5 phút · 15 phút · 1 giờ | +5 phút · +15 phút · +1 giờ | Hành động, không cần nhãn nhóm |
| Còn 2 phút | *(xoá)* | Trùng đồng hồ |
| Thủ công | Bắt đầu thủ công | Rõ nghĩa nguồn |
| Đang giữ hệ thống hoạt động | Đang giữ máy thức | Ngắn, đời thường |
| Âm thanh đi ngủ | Âm thanh khi ngủ | Tự nhiên hơn |
| Tất cả (chip âm thanh) | Mở trang Âm thanh ↗ | Báo điều hướng |
| Ngủ đông (disabled) | Ngủ đông · Hệ thống không hỗ trợ | Có lý do |
| Swell Tắt | Dâng sóng: Tắt | Bỏ tiếng Anh |
| Không gian: Giữa | Không gian: Vừa | Từ tự nhiên |
| Tắt dần 10p cuối | Nhỏ dần 10 phút cuối | Đúng nghĩa (âm lượng) |
| Tạm dừng · 1 kênh | Tạm dừng · 1 kênh *(chỉ ở R4)* | Một nơi |
| Preset đã lưu | Preset | Trùng nhãn rail |
| Lịch tự động | Lịch lặp | Một thuật ngữ |
| Thêm lịch | Thêm lịch *(dưới h2 "Lịch mới")* | Có ngữ cảnh |
| Lịch sử hoạt động | Nhật ký | Một thuật ngữ |
| Xoá nhật ký | Xoá nhật ký… → popover "Xoá {n} mục?" [Huỷ] [Xoá {n} mục] | Xác nhận có số lượng |
| Thử (badge) | Chạy thử | Không đọc như cảnh báo |
| Lỗi · Không có quyền | Lỗi · Thiếu quyền tắt máy — [Cách khắc phục] | Có lối ra |
| Tắt Máy / Khoá Màn Hình | Tắt máy / Khoá màn hình | Sentence case |
| Nhấp đúp vào tên để đổi tên… (footer) | *(xoá, thay bằng menu ⋯ › Đổi tên)* | Không giấu tính năng |
| Sleepy phải đang chạy… Bật "Khởi động cùng hệ thống" nếu cần. | Sleepy phải đang chạy để thực hiện lịch. [Bật khởi động cùng hệ thống] | Biến cảnh báo thành hành động |

---

## 12. Bàn phím & focus

### 12.1 Focus ring

```css
:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;          /* KHÔNG đặt border-radius ở đây */
}
input:focus-visible, .time-in input:focus-visible, .sentence input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
```
- Overlay (popover, dropdown): trap focus khi mở, trả focus về trigger khi đóng, Esc để đóng.
- Thứ tự Tab theo vùng: R1 → R2 → R3 → R4 → R5 → R7.

### 12.2 Bản đồ phím tắt

| Phím | Phạm vi | Hành động |
|---|---|---|
| `Ctrl+1…6` | Toàn cục | Chuyển màn (đã có; hiện trong tooltip rail bằng `<kbd>`) |
| `Ctrl+K` | Toàn cục | Command palette |
| `Ctrl+Enter` | Hẹn giờ (setup) | Bắt đầu |
| `1…7` | Hẹn giờ (setup, không focus input) | Chọn chip thời lượng tương ứng |
| `↑/↓`, `Shift+↑/↓` | Dial | ±1 / ±5 phút (đã có) |
| `Esc` | Đang chạy | Huỷ hẹn giờ (kèm toast Hoàn tác) |
| `Space` | Âm thanh | Phát / tạm dừng |
| `Ctrl+Z` | Toàn cục | Hoàn tác lần xoá/huỷ gần nhất |
| `F2` | Dòng preset/mix đang focus | Đổi tên |
| `Delete` | Dòng đang focus | Xoá (kèm Hoàn tác) |
| `?` | Toàn cục | Bảng phím tắt |

---

## 13. Lộ trình ưu tiên

| Pha | Hạng mục | Tham chiếu | Ước lượng |
|---|---|---|---|
| **P0 — An toàn** | Hold-to-confirm "Thực hiện ngay"; Hoàn tác cho mọi lệnh xoá; xác nhận xoá nhật ký; sửa focus ring; nâng `--ink-3` + accent light; lưới Hành động giữ nhãn ở cửa sổ hẹp | §2.3, §2.4, §3.1, §3.2, §4.1 | nhỏ |
| **P1 — Nền móng** | Gộp CSS override về một định nghĩa mỗi selector; áp type scale (§5), spacing/radius/color tokens (§9); xoá `text-transform: capitalize`; bỏ shadow/blur lớp 0–2, bỏ bokeh | §2.1, §2.2, §2.5–2.7, §5, §9 | vừa |
| **P2 — Khung bố cục** | Dựng R1–R9 dùng chung; chuẩn hoá `h1`/`h2`/`h3`; Action bar R7; System banner R3; Now playing R6 chỉ hiện khi có nội dung | §6, §7 | vừa |
| **P3 — Từng màn** | Hẹn giờ (chip liền dial, dropdown âm thanh); Đang chạy (+5/+15, vị trí Huỷ); Âm thanh (một tầng tab, mixer thay vinyl); Preset/Lịch (menu ⋯, sửa, nhân bản); Nhật ký (lọc, cột, badge icon); Cài đặt (bỏ tab) | §8 | lớn |
| **P4 — Trạng thái & tăng tốc** | Empty / loading / error / edge states; phím tắt; command palette | §4.2, §4.3, §12.2 | vừa |

**Tiêu chí nghiệm thu chung:**
- `grep -oE "font-size: ?[0-9.]+px" styles.css | sort -u` chỉ còn các giá trị trong §5.2.
- `grep -oE "border-radius: ?[^;]+" | sort -u` chỉ còn token §9.2.
- Không selector nào xuất hiện ở hơn một khối định nghĩa.
- Mọi cặp chữ/nền đạt ≥ 4.5:1 (đo bằng script trong §2.3).
- Các script `tools/preview/check-*.js` vẫn pass; ảnh chụp 1060×760 và 720×560, dark + light, không có nhãn bị mất hoặc bị cắt ở control có hệ quả.

---

## 14. Re-audit sau P0–P4 (2026-11-28) — việc còn lại

> Đo trên commit `5cd0399`. Các mục đã đóng: hold-to-confirm, toast Hoàn tác, popover xoá nhật ký, menu ⋯ preset, focus ring, bỏ `capitalize`, banner dry-run, h1 đúng rail, +5/+15/+1 giờ, badge có icon, palette, bảng phím tắt.
> **Đính chính:** bản trước ghi light `--ink-3 #85776C` ≈ 4.6:1 — đo thật **4.26:1** (trượt). Giá trị mới ở §5.4/§9.3 đã sửa và được đo.

### 14.1 Chí mạng

| ID | Vị trí | Lỗi | Sửa |
|---|---|---|---|
| RC1 | Màn đang chạy (`.awake-meta`, `styles.css:155`) | `position:absolute; top: var(--pad-y)` tính từ `.main`, **đè lên nút "Tắt chế độ thử"** của banner R3 (mọi kích thước, cả hai theme) | Đưa vào R4 Page meta, luồng thường; không phần tử nào absolute ra ngoài vùng của nó |
| RC2 | Light theme | Accent `#C9432B` ≈ danger `#C23A30`: "Huỷ hẹn giờ" (an toàn) đỏ đặc, "Tắt máy ngay…" (nguy hiểm) viền trung tính; badge đếm đỏ như lỗi | Accent light → `#3D4BA8` (chàm). `--danger` chỉ dùng cho phá huỷ/lỗi |
| RC3 | Undo (`app.js` ~204–210, ~1318–1327, `sdel`) | Snapshot `prev` cả mảng rồi ghi đè; toast mới thay toast cũ → double-click mất 2 mục, chỉ hoàn tác 1; thay đổi khác trong 6s bị ghi đè. Sau xoá, dòng kế tiếp trượt dưới con trỏ | Undo = thao tác đảo ngược `{type,item,index}` áp lên state **hiện tại**; ngăn xếp ≥10, `Ctrl+Z` lặp; toast gộp "Đã xoá 2 lịch"; sau xoá focus → ⋯ dòng kế; xoá lịch chuyển vào ⋯ |
| RC4 | Hẹn giờ 720×560 | "Âm thanh khi ngủ" biến mất; chip thời lượng cắt còn 3/7 | <760px: dropdown âm thanh; chip cuộn ngang + fade 24px + wheel ngang |
| RC5 | Tương phản | light `--ink-3` 4.26; light `--lamp` 4.44; `--line-2` dùng làm biên control chỉ 1.8:1 | light `--ink-3 #756759`, light `--lamp #8F4C07`, light `--line-2 #9A8673` (3.43), dark `--line-2 #636F99` (3.86). `--line` giữ cho divider |

### 14.2 Gây ức chế

- Hẹn giờ: chip thời lượng phải **sát dưới dial (gap 16px)**; "Âm thanh khi ngủ" thành dropdown (mục cuối "Mở trang Âm thanh ↗"); cột B không có khoảng trống >24px.
- Núm dial là **mặt trời** ở cả setup và đang chạy (`app.js:64`, mã cứng `#FFB938`) — regression. Đổi thành chấm trơn dùng token (hoặc trăng ở cả hai).
- Âm thanh: thiếu `h1`/R4; trạng thái "Tạm dừng · 1 kênh", Trộn, Tắt hết đưa lên R4; bỏ "8 kênh" ở đáy; "Đang phát (1)" → toggle "Chỉ đang phát"; icon `∿` và `ılı` cần nhãn/tooltip hoặc bỏ; vinyl chỉ cho Playlist/YouTube, tab Kênh dùng panel "Mixer đang phát".
- Lịch lặp: dòng tắt không làm mờ toggle; dropdown ≥160px không cắt nhãn; xoá vào ⋯ (Sửa · Nhân bản · Xoá); `h2` "Lịch mới" / "Lịch đã tạo"; sửa giờ inline; empty state.
- Nhật ký: bộ lọc → dropdown "Kết quả"; "Xoá nhật ký…" vào ⋯; cột 120 | 1fr | 1.4fr | 160, Nguồn có `title`; Lỗi có link "Cách khắc phục"; filtered-zero; empty có khoảng thở.
- Cài đặt: bỏ tab, một trang với `h2`; [Mở thư mục dữ liệu].
- Palette: metadata không dùng kiểu `<kbd>`; nhóm có tiêu đề; fade/đếm khi còn mục; icon tìm kiếm; "Không có lệnh khớp "…"".
- Mini player R6: vòng tiến độ phải phản ánh tiến độ thật; ở rail hẹp vẫn hiện số.
- Esc chỉ đóng overlay; huỷ hẹn giờ = `Ctrl+.`.
- Nút cửa sổ ra khỏi tab order mặc định.

### 14.3 Polish

- Token khai báo nhưng không dùng: `var(--s-*)` 3 lần; 20 cỡ chữ literal (9.5/10.5/11.5/12.5/13.5/15.5…); radius literal 5–22px; `box-shadow` 73. Selector trùng: `.day`×4, `.adder`×4, `.rail*`×3, `.seg button`×3, `.label`×3. `--rail-w` 64 bị đè 96 (`:996`).
- Trạng thái chọn khác nhau giữa theme — thống nhất: chip = nền accent/chữ accent-ink 500; ô Hành động = `--surface-3` + viền 1px accent + icon accent; segmented = `--surface-3` + `--ink` 500; rail = `--surface-3`.
- Dial: vòng 6px, bỏ glow/halo, ticks `--ink-3`.
- Banner: nút dùng biến thể secondary.
- Toast: bỏ dấu chấm trước action; `×` ≥32×32 (cả bảng phím tắt).

### 14.4 Tiêu chí nghiệm thu

```bash
grep -oE "font-size: ?[0-9.]+px" ui/css/styles.css | sort -u      # rỗng (trừ SVG tick nếu buộc)
grep -oE "border-radius: ?[0-9]+px" ui/css/styles.css | sort -u   # rỗng
grep -c "box-shadow" ui/css/styles.css                             # ≤ 8
grep -oE "^[.#a-z][^{@]*\{" ui/css/styles.css | sort | uniq -d     # rỗng
```
+ mọi cặp chữ/nền ≥4.5:1, biên control ≥3:1; `tools/preview/check-*.js` pass; ảnh 1060×760 & 720×560, dark & light không chồng lấn, không mất nhãn.
