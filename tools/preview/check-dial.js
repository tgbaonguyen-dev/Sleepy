// Kiểm tra thao tác trực tiếp trên vòng quay thiết lập: kéo (ở rãnh, ở mặt, từ ô số), qua đỉnh thêm giờ,
// lùi quá 0 thì dừng ở 0, lăn chuột, phím mũi tên, chip có hoạt ảnh, bấm vào ô số vẫn gõ được.
// node tools/preview/check-dial.js [--theme dark|light] [--shots /tmp/dir]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const theme = opt('--theme', 'dark');
const SHOTS = opt('--shots', null);
const TAU = Math.PI * 2;

(async () => {
  const browser = await chromium.launch();
  const results = [], errors = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, ...(detail !== undefined ? { detail } : {}) });

  async function open(reduced) {
    const p = await browser.newPage({ viewport: { width: 1060, height: 760 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const mock = fs.readFileSync(path.join(__dirname, 'mock-ipc.js'), 'utf8');
    await p.addInitScript(`window.__MOCK__ = ${JSON.stringify({ theme, job: null })};\n${mock}`);
    await p.goto('file://' + path.resolve(__dirname, '../../ui/index.html'));
    await p.waitForTimeout(900);
    return p;
  }
  // Toạ độ màn hình của một góc (0 = 12 giờ, theo chiều kim đồng hồ, tính bằng vòng) ở khoảng cách r (theo bán kính vòng)
  async function geom(p) {
    return p.evaluate(() => { const r = document.querySelector('#dial').getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, R: (r.width / 2) * (138 / 165) }; });
  }
  const at = (g, f, k = 1) => [g.cx + g.R * k * Math.sin(f * TAU), g.cy - g.R * k * Math.cos(f * TAU)];
  // Rê chuột dọc theo cung tròn từ f0 tới f1 (f1 có thể > 1 hoặc < 0 để đi nhiều vòng)
  async function sweep(p, g, f0, f1, k = 1) {
    const n = Math.max(2, Math.ceil(Math.abs(f1 - f0) * 48));
    for (let i = 1; i <= n; i++) { const [x, y] = at(g, f0 + ((f1 - f0) * i) / n, k); await p.mouse.move(x, y); }
  }
  const state = (p) => p.evaluate(() => {
    const d = document.querySelector('#dial'), h = document.querySelector('#dial-hand');
    const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(h?.getAttribute('transform') || '');
    const f = m ? ((Math.atan2(+m[1] - 165, -(+m[2] - 165)) / (2 * Math.PI)) + 1) % 1 : null;
    return { now: +d.getAttribute('aria-valuenow'), text: d.getAttribute('aria-valuetext'), handle: f && +f.toFixed(4),
      inputs: [...document.querySelectorAll('#dial-center input')].map((i) => i.value).join(':'), dragging: document.documentElement.classList.contains('dragging-dial') };
  });
  const near = (a, b, eps = 0.004) => Math.abs(((a - b + 1.5) % 1) - 0.5) < eps;

  // ----- Sau bao lâu -----
  const p = await open(false);
  let g = await geom(p);
  await p.focus('#dial'); await p.keyboard.press('Home'); await p.waitForTimeout(450);
  check('Home resets countdown to 0', (await state(p)).now === 0, await state(p));

  // Kéo từ 12 giờ sang 3 giờ ≈ 15 phút
  let [x, y] = at(g, 0); await p.mouse.move(x, y); await p.mouse.down();
  await sweep(p, g, 0, 0.25);
  let s = await state(p);
  check('drag 12→3 o\'clock gives 15 min', s.now === 15 && s.inputs === '0:15' && s.dragging, s);
  // Giữa hai vạch phút: núm nằm đúng góc con trỏ (liên tục), số hiện đã làm tròn 1 phút
  await sweep(p, g, 0.25, 0.1225);
  s = await state(p);
  check('mid-drag handle follows pointer continuously (7.35 min)', near(s.handle, 0.1225) && s.now === 7, s);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${theme}-countdown-middrag.png`) });
  await sweep(p, g, 0.1225, 0.25);
  // Đi tiếp qua đỉnh: +1 giờ
  await sweep(p, g, 0.25, 1.25);
  s = await state(p);
  check('continuing past 12 adds an hour (1h15)', s.now === 75 && s.inputs === '1:15', s);
  // Lùi lại quá 0: dừng ở 0, không quay vòng sang 23 giờ
  await sweep(p, g, 1.25, -0.4);
  s = await state(p);
  check('dragging backwards below 0 clamps at 0', s.now === 0 && s.inputs === '0:00', s);
  // Từ chỗ lùi quá, quay lại tới 12 giờ vẫn là 0; qua 12 giờ thì tăng và núm khớp con trỏ
  await sweep(p, g, -0.4, 0.1);
  s = await state(p);
  check('coming back from below 0 re-aligns with the pointer (6 min)', s.now === 6 && near(s.handle, 0.1), s);
  await p.mouse.up(); await p.waitForTimeout(350);
  s = await state(p);
  check('release settles on the shown minute', !s.dragging && s.now === 6 && near(s.handle, 0.1, 0.001), s);

  // Nắm ở mặt vòng (giữa ô số và rãnh) rồi xoay: tương đối, +¼ vòng = +15 phút
  [x, y] = at(g, 0.5, 0.45); await p.mouse.move(x, y); await p.mouse.down();
  await sweep(p, g, 0.5, 0.75, 0.45);
  s = await state(p);
  check('grab on dial face and rotate ¼ turn adds 15 min', s.now === 21, s);
  await p.mouse.up(); await p.waitForTimeout(300);

  // Nắm từ ô số phút rồi kéo: thành kéo vòng, ô số bị bỏ focus
  let box = await p.locator('[data-dial="countdown.m"]').boundingBox();
  const ix = box.x + box.width / 2, iy = box.y + box.height / 2;
  await p.mouse.move(ix, iy); await p.mouse.down();
  const a0 = Math.atan2(ix - g.cx, -(iy - g.cy)) / TAU;
  const rr = Math.hypot(ix - g.cx, iy - g.cy) / g.R;
  await sweep(p, g, a0, a0 + 0.25, rr);
  s = await state(p);
  const focusedAfterDrag = await p.evaluate(() => document.activeElement?.dataset?.dial || document.activeElement?.id);
  check('dragging that starts on the minute number turns the dial (+15)', s.now === 36 && focusedAfterDrag !== 'countdown.m', { ...s, focusedAfterDrag });
  await p.mouse.up(); await p.waitForTimeout(300);

  // Bấm (không kéo) vào ô phút: được focus để gõ
  await p.mouse.click(ix, iy); await p.waitForTimeout(100);
  const foc = await p.evaluate(() => document.activeElement?.dataset?.dial);
  check('clicking the minute number focuses the input', foc === 'countdown.m', foc);
  await p.keyboard.type('42'); await p.waitForTimeout(80);
  s = await state(p);
  check('typing in the minute input updates the dial', s.now === 42, s);
  await p.waitForTimeout(400);
  check('typed value animates the handle to 42 min', near((await state(p)).handle, 0.7, 0.001), await state(p));

  // Lăn chuột trên vòng: ±1 phút, Shift ±5
  [x, y] = at(g, 0.4, 0.8); await p.mouse.move(x, y);
  await p.mouse.wheel(0, -100); await p.waitForTimeout(60);
  s = await state(p); const w1 = s.now;
  await p.mouse.wheel(0, -100); await p.mouse.wheel(0, 100); await p.mouse.wheel(0, 100); await p.waitForTimeout(60);
  const w2 = (await state(p)).now;
  await p.keyboard.down('Shift'); await p.mouse.wheel(0, -100); await p.keyboard.up('Shift'); await p.waitForTimeout(60);
  const w3 = (await state(p)).now;
  check('wheel over dial: +1, then +1-1-1, then Shift +5 to grid', w1 === 43 && w2 === 42 && w3 === 45, { w1, w2, w3 });
  // Lăn trên ô giờ vẫn chỉnh riêng giờ
  await p.hover('[data-dial="countdown.h"]'); await p.mouse.wheel(0, -100); await p.waitForTimeout(60);
  s = await state(p);
  check('wheel over hour input still steps hours', s.now === 105 && s.inputs === '1:45', s);

  // Bàn phím khi vòng có focus
  await p.focus('#dial');
  const keys = [];
  for (const k of ['ArrowUp', 'ArrowRight', 'ArrowDown', 'Shift+ArrowUp', 'PageUp', 'PageDown', 'End', 'ArrowUp', 'Home', 'ArrowDown']) { await p.keyboard.press(k); keys.push([k, (await state(p)).now]); }
  const kv = keys.map((k) => k[1]);
  check('arrow/page/home/end keys on focused dial', JSON.stringify(kv) === JSON.stringify([106, 107, 106, 110, 120, 60, 1439, 1439, 0, 0]), keys);
  s = await state(p);
  const aria = await p.evaluate(() => { const d = document.querySelector('#dial'); return { role: d.getAttribute('role'), tab: d.tabIndex, min: d.getAttribute('aria-valuemin'), max: d.getAttribute('aria-valuemax') }; });
  await p.keyboard.press('PageUp'); await p.keyboard.press('PageUp'); await p.keyboard.press('Shift+ArrowUp'); await p.keyboard.press('Shift+ArrowUp'); await p.keyboard.press('Shift+ArrowUp'); await p.keyboard.press('Shift+ArrowUp'); await p.keyboard.press('Shift+ArrowUp'); await p.keyboard.press('Shift+ArrowUp');
  const vt = await p.evaluate(() => document.querySelector('#dial').getAttribute('aria-valuetext'));
  check('dial is an accessible slider with Vietnamese valuetext', aria.role === 'slider' && aria.tab === 0 && aria.min === '0' && aria.max === '1439' && vt === '2 giờ 30 phút', { ...aria, vt });

  // Chip: hoạt ảnh từ giá trị cũ sang mới (~300ms)
  await p.evaluate(() => document.querySelector('[data-chip="30"]').click()); await p.waitForTimeout(450);
  const anim = await p.evaluate(async () => {
    const f = () => { const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(document.querySelector('#dial-hand').getAttribute('transform')); return ((Math.atan2(+m[1] - 165, -(+m[2] - 165)) / (2 * Math.PI)) + 1) % 1; };
    const before = f();
    document.querySelector('[data-chip="15"]').click();
    await new Promise((r) => setTimeout(r, 90));
    const mid = f();
    return { before, mid };
  });
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${theme}-chip-midanim.png`) });
  await p.waitForTimeout(450);
  s = await state(p);
  check('chip click animates handle (mid frame between 30 and 15 min)', anim.before > 0.499 && anim.mid < anim.before - 0.01 && anim.mid > 0.26 && near(s.handle, 0.25, 0.001) && s.now === 15, { ...anim, after: s.handle });
  const chipOn = await p.evaluate(() => document.querySelector('[data-chip="15"]').classList.contains('on'));
  check('matching chip lights up', chipOn);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${theme}-after-chip.png`) });
  // Nắm sát bên trái đỉnh khi đang < 1 giờ: hiểu là 0 phút chứ không nhảy lên 59
  [x, y] = at(g, 0.998); await p.mouse.move(x, y); await p.mouse.down();
  const edge = (await state(p)).now;
  await sweep(p, g, -0.002, 0.25); await p.mouse.up(); await p.waitForTimeout(250);
  check('grabbing just left of 12 under 1h means 0, not 59', edge === 0 && (await state(p)).now === 15, { edge, after: (await state(p)).now });
  // Kéo tới 30 phút: chip "30 phút" sáng theo
  [x, y] = at(g, 0.25); await p.mouse.move(x, y); await p.mouse.down(); await sweep(p, g, 0.25, 0.5); await p.mouse.up(); await p.waitForTimeout(250);
  check('dragging to 30 min lights the "30 phút" chip', await p.evaluate(() => document.querySelector('[data-chip="30"]').classList.contains('on') && !document.querySelector('[data-chip="15"]').classList.contains('on')));
  // Bị huỷ giữa chừng (pointercancel): thoát trạng thái kéo
  [x, y] = at(g, 0.5); await p.mouse.move(x, y); await p.mouse.down(); await sweep(p, g, 0.5, 0.6);
  await p.evaluate(() => { const d = document.querySelector('#dial'); d.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })); });
  s = await state(p); await p.mouse.up();
  check('pointercancel ends the drag', !s.dragging && s.now === 36, s);

  // ----- Đúng giờ -----
  await p.click('[data-mode=at]'); await p.waitForTimeout(500);
  g = await geom(p);
  [x, y] = at(g, 0.25); await p.mouse.move(x, y); await p.mouse.down();
  await sweep(p, g, 0.25, 0.5);
  s = await state(p);
  check('at-mode: drag ring to 6 o\'clock = 12:00', s.now === 720 && s.inputs === '12:00', s);
  await sweep(p, g, 0.5, 0.9);
  s = await state(p);
  check('at-mode: drag on to 0.9 turn = 21:35 (5-min snap)', s.now === 1295 && s.inputs === '21:35', s);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${theme}-at-middrag.png`) });
  await p.mouse.up(); await p.waitForTimeout(300);
  [x, y] = at(g, 0.4, 0.8); await p.mouse.move(x, y);
  await p.mouse.wheel(0, -100); await p.waitForTimeout(40); const aw1 = (await state(p)).now;
  await p.mouse.wheel(0, 100); await p.mouse.wheel(0, 100); await p.waitForTimeout(40); const aw2 = (await state(p)).now;
  check('at-mode wheel ±5 min', aw1 === 1300 && aw2 === 1290, { aw1, aw2 });
  await p.focus('#dial'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp');
  check('at-mode arrow keys ±5 min', (await state(p)).now === 1300, await state(p));
  await p.evaluate(() => document.querySelector('[data-chip-at="00:30"]').click()); await p.waitForTimeout(60);
  const atMid = (await state(p)).handle;
  await p.waitForTimeout(450);
  const atEnd = (await state(p)).handle;
  // 21:40 → 00:30 đi xuôi qua nửa đêm (đường ngắn nhất), không quay ngược cả vòng
  check('at-mode chip animates the short way across midnight', (atMid > 0.9 || atMid < 0.021) && near(atEnd, 30 / 1440, 0.001), { atMid, atEnd });
  await p.close();

  // ----- Giảm chuyển động: không trượt, cập nhật ngay -----
  const q = await open(true);
  await q.evaluate(() => document.querySelector('[data-chip="15"]').click());
  const rm = await state(q);
  check('reduced motion: chip jumps instantly', near(rm.handle, 0.25, 0.001) && rm.now === 15, rm);
  await q.close();

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ theme, passed: results.length - failed.length, failed: failed.length, errors, results }, null, 1));
  process.exit(failed.length || errors.length ? 1 : 0);
})();
