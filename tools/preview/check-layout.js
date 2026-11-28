// Quét bố cục: mọi màn × mọi kích thước cửa sổ (kể cả trạng thái phóng to / thu nhỏ) × hai giao diện.
// Không màn nào được cuộn, tràn khung, bị cắt mất nội dung hay đè lên nhau; không có lỗi console.
// node tools/preview/check-layout.js [--sizes 1060x760,900x640] [--shots /tmp/dir] [--rows 40]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

// 1920×1080 và 1400×900 ~ thu nhỏ; 1060×760 mặc định; 900×640 tối thiểu; 848×608 / 707×507 / 640×480 ~ phóng to 125/150/165%.
const SIZES = opt('--sizes', '1920x1080,1400x900,1060x760,900x640,848x608,707x507,640x480').split(',').map((s) => s.split('x').map(Number));
const THEMES = opt('--theme', 'dark').split(',');
const SHOTS = opt('--shots', null);
const ROWS = Number(opt('--rows', '40'));

// Mỗi trạng thái: tên + các bước tới đó (từ màn Hẹn giờ vừa mở).
const STATES = [
  ['setup-countdown', []],
  ['setup-at', ['[data-mode=at]']],
  ['setup-cond', ['[data-mode=cond]']],
  ['setup-cond-net', ['[data-type=net]']],
  ['setup-cond-process', ['[data-type=process]']],
  ['setup-saving', ['[data-mode=countdown]', '[data-do=preset-new]']],
  ['sounds', ['[data-view=sounds]']],
  ['sounds-lofi', ['[data-snd=lofi]']],
  ['presets', ['[data-view=presets]']],
  ['presets-p2', ['[data-page="presets:1"]']],
  ['presets-menu', ['[data-pmenu]']],
  ['schedules', ['[data-view=schedules]']],
  ['schedules-menu', ['[data-smenu]']],
  ['history', ['[data-view=history]']],
  ['history-p2', ['[data-page="history:1"]']],
  ['history-filtered', ['.dd-hfilter .dd-btn', '[role=option][data-value=error]']],
  ['settings', ['[data-view=settings]']],
];

async function audit(p) {
  return p.evaluate(() => {
    const W = innerWidth, H = innerHeight, issues = [];
    const doc = document.documentElement, main = document.querySelector('#main');
    if (doc.scrollHeight > H + 1 || doc.scrollWidth > W + 1) issues.push('document overflows the window');
    if (main.scrollHeight > main.clientHeight + 1 || main.scrollWidth > main.clientWidth + 1) issues.push(`#main overflows (${main.scrollWidth}×${main.scrollHeight} in ${main.clientWidth}×${main.clientHeight})`);
    const name = (el) => el.id ? `#${el.id}` : `${el.localName}${el.classList.length ? '.' + [...el.classList].join('.') : ''}`;
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    const isScrollableRegion = (el) => {
      if (!el?.matches?.('[data-scroll-region]')) return false;
      const oy = getComputedStyle(el).overflowY;
      return oy === 'auto' || oy === 'scroll';
    };
    for (const el of document.querySelectorAll('.app *')) {
      if (el.closest('svg') || el.closest('.clip-fit') || !visible(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'inline' || ['INPUT', 'SELECT', 'OPTION', 'DATALIST'].includes(el.tagName)) continue;
      const selfScroll = isScrollableRegion(el);
      const ancestorScroll = el.parentElement?.closest('[data-scroll-region]');
      const inScrollRegion = !!(ancestorScroll && isScrollableRegion(ancestorScroll));
      // Nội dung tràn khỏi hộp của chính nó (bị cắt, hoặc đè lên phần bên dưới). Bỏ qua hộp chỉ chứa chữ
      // (nét chữ lớn nhô khỏi line-height), vòng tròn có núm kéo (.dial, .orb), và vùng cuộn có chủ đích ([data-scroll-region]).
      const textOnly = [...el.children].every((c) => getComputedStyle(c).display.startsWith('inline'));
      if (!textOnly && !selfScroll && !el.matches('.dial, .orb') && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0) issues.push(`${name(el)} content taller than box (${el.scrollHeight} > ${el.clientHeight})`);
      if (cs.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) issues.push(`${name(el)} content wider than box (${el.scrollWidth} > ${el.clientWidth})`);
      // Phần tử nằm ngoài cửa sổ (bỏ qua tràn dọc bên trong vùng cuộn có chủ đích)
      const r = el.getBoundingClientRect();
      if (r.right > W + 1 || r.left < -1 || (!inScrollRegion && (r.bottom > H + 1 || r.top < -1))) issues.push(`${name(el)} outside the window (${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)})`);
    }
    return [...new Set(issues)].slice(0, 8);
  });
}

(async () => {
  const browser = await chromium.launch();
  const mock = fs.readFileSync(path.join(__dirname, 'mock-ipc.js'), 'utf8');
  const rows = [];
  let bad = 0;
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

  async function open(theme, w, h, job, errors) {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await p.addInitScript(`window.__MOCK__ = ${JSON.stringify({ theme, dryRun: true, history: ROWS, extra: Math.round(ROWS / 4),
      job: job ? { action: 'shutdown', trigger: { type: 'countdown', seconds: 95 } } : null })};\n${mock}`);
    await p.goto('file://' + path.resolve(__dirname, '../../ui/index.html'));
    await p.waitForTimeout(900);
    return p;
  }
  async function record(p, theme, w, h, state, errors) {
    const issues = await audit(p);
    const r = { theme, size: `${w}x${h}`, state, ok: !issues.length && !errors.length, issues, errors: [...errors] };
    errors.length = 0;
    if (!r.ok) bad++;
    rows.push(r);
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${theme}-${w}x${h}-${state}.png`) });
  }

  for (const theme of THEMES) {
    for (const [w, h] of SIZES) {
      const errors = [];
      const p = await open(theme, w, h, false, errors);
      for (const [state, steps] of STATES) {
        let skipped = false;
        for (const sel of steps) {
          // Bước không áp dụng ở cỡ này (vd. chỉ một trang, hay tab Cài đặt bị ẩn khi rộng) thì bỏ qua trạng thái
          const el = await p.$(sel);
          if (!el || !(await el.isVisible())) { skipped = true; break; }
          await p.click(sel); await p.waitForTimeout(220);
        }
        if (skipped) { rows.push({ theme, size: `${w}x${h}`, state, ok: true, skipped: true }); continue; }
        await p.waitForTimeout(300);
        await record(p, theme, w, h, state, errors);
      }
      await p.close();
      const q = await open(theme, w, h, true, errors);
      await record(q, theme, w, h, 'running', errors);
      await q.close();
    }
  }
  await browser.close();
  const fails = rows.filter((r) => !r.ok);
  const states = [...new Set(rows.map((r) => r.state))];
  console.log(`checked ${rows.length} (states × sizes × themes): ${rows.length - fails.length - rows.filter((r) => r.skipped).length} ok, ${rows.filter((r) => r.skipped).length} skipped, ${fails.length} failing`);
  for (const theme of THEMES) {
    console.log(`\n[${theme}] ${'size'.padEnd(10)} ${states.map((s) => s.padEnd(4).slice(0, 4)).join(' ')}`);
    for (const [w, h] of SIZES) {
      const line = states.map((s) => { const r = rows.find((x) => x.theme === theme && x.size === `${w}x${h}` && x.state === s); return (!r ? '?' : r.skipped ? '-' : r.ok ? 'ok' : 'FAIL').padEnd(4); });
      console.log(`${' '.repeat(theme.length + 3)}${`${w}x${h}`.padEnd(10)} ${line.join(' ')}`);
    }
  }
  console.log(`\ncolumns: ${states.join(', ')}`);
  for (const f of fails) console.log(`\nFAIL ${f.theme} ${f.size} ${f.state}\n  ${[...f.issues, ...f.errors.map((e) => 'console: ' + e)].join('\n  ')}`);
  process.exit(bad ? 1 : 0);
})();
