//! Vẽ icon khay hình vòng tròn đếm ngược (44×44, khử răng cưa bằng siêu lấy mẫu).

use tauri::image::Image;

const SIZE: u32 = 44;
const SS: u32 = 3;
const MOON: [f64; 3] = [183.0, 197.0, 255.0];
const INK: [f64; 3] = [255.0, 255.0, 255.0];
const RED: [f64; 3] = [255.0, 110.0, 126.0];

/// `remaining`: phần còn lại 0..1, hoặc `None` khi đang theo dõi điều kiện (vòng nét đứt).
pub fn draw(remaining: Option<f64>, urgent: bool) -> Image<'static> {
    let c = SIZE as f64 / 2.0;
    let (r, w) = (15.5, 4.2);
    let dot_r = if urgent { 5.0 } else { 3.6 };
    let mut buf = vec![0u8; (SIZE * SIZE * 4) as usize];
    for y in 0..SIZE {
        for x in 0..SIZE {
            let (mut acc, mut alpha) = ([0.0f64; 3], 0.0f64);
            for sy in 0..SS {
                for sx in 0..SS {
                    let px = x as f64 + (sx as f64 + 0.5) / SS as f64 - c;
                    let py = y as f64 + (sy as f64 + 0.5) / SS as f64 - c;
                    let d = px.hypot(py);
                    let hit: Option<([f64; 3], f64)> = if (d - r).abs() <= w / 2.0 {
                        let ang = ((px.atan2(-py) / std::f64::consts::TAU) + 1.0) % 1.0;
                        Some(match remaining {
                            None => (INK, if (ang * 16.0) as u32 % 2 == 0 { 1.0 } else { 0.25 }),
                            Some(f) if ang <= f => (MOON, 1.0),
                            Some(_) => (INK, 0.32),
                        })
                    } else if d <= dot_r {
                        Some((if urgent { RED } else { INK }, 1.0))
                    } else {
                        None
                    };
                    if let Some((col, a)) = hit {
                        for i in 0..3 {
                            acc[i] += col[i] * a;
                        }
                        alpha += a;
                    }
                }
            }
            let n = (SS * SS) as f64;
            let i = ((y * SIZE + x) * 4) as usize;
            let a = alpha / n;
            // RGBA không nhân trước alpha: chia lại cho độ phủ.
            let un = |v: f64| {
                if alpha > 0.0 {
                    (v / alpha).round().clamp(0.0, 255.0) as u8
                } else {
                    0
                }
            };
            buf[i] = un(acc[0]);
            buf[i + 1] = un(acc[1]);
            buf[i + 2] = un(acc[2]);
            buf[i + 3] = (a * 255.0).round() as u8;
        }
    }
    Image::new_owned(buf, SIZE, SIZE)
}
