// Kiểm tra ô chọn tự vẽ (ui/js/dropdown.js) ở màn Lịch lặp: mở/đóng, bàn phím (mũi tên, Home/End, gõ chữ),
// chọn bằng chuột và phím cập nhật data-value lẫn dữ liệu đã lưu ở IPC giả lập, Escape/Tab trả focus về nút,
// menu luôn nằm trong cửa sổ (lật lên trên khi sát đáy), sống sót qua lần vẽ lại, trang không bao giờ cuộn.
// node tools/preview/check-dropdown.js [--shots /tmp/dir]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const theme = opt('--theme', 'dark');
const SHOTS = opt('--shots', null);

(async () => {
  const browser = await chromium.launch();
  const results = [], errors = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, ...(detail !== undefined ? { detail } : {}) });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${theme}-${name}.png`) }); };

  async function open({ w = 1060, h = 760, extra = 0, reduced = false } = {}) {
    const p = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const mock = fs.readFileSync(path.join(__dirname, 'mock-ipc.js'), 'utf8');
    await p.addInitScript(`window.__MOCK__ = ${JSON.stringify({ theme, job: null, extra })};\n${mock}`);
    await p.goto('file://' + path.resolve(__dirname, '../../ui/index.html'));
    await p.waitForTimeout(800);
    await p.click('[data-view=schedules]');
    await p.waitForTimeout(450);
    return p;
  }
  // Trạng thái ô chọn `key` và menu đang mở (nếu có)
  const dd = (p, key) => p.evaluate((key) => {
    const root = document.querySelector(`.dd[data-key="${key}"]`), btn = root?.querySelector('.dd-btn');
    const menu = document.querySelector('.dd-menu:not(.out)');
    const r = menu?.getBoundingClientRect(), b = btn?.getBoundingClientRect();
    const items = menu ? [...menu.querySelectorAll('[role=option]')] : [];
    const se = document.scrollingElement, main = document.querySelector('#main');
    return {
      value: root?.dataset.value, face: root?.querySelector('.dd-text')?.textContent, expanded: btn?.getAttribute('aria-expanded'),
      haspopup: btn?.getAttribute('aria-haspopup'), controls: btn?.getAttribute('aria-controls'),
      open: !!menu, role: menu?.getAttribute('role'), count: items.length,
      active: items.findIndex((li) => li.classList.contains('active')),
      activedesc: menu ? items.findIndex((li) => li.id === menu.getAttribute('aria-activedescendant')) : -1,
      selected: items.filter((li) => li.getAttribute('aria-selected') === 'true').map((li) => li.dataset.value),
      side: menu?.dataset.side, focus: document.activeElement === btn ? 'trigger' : document.activeElement === menu ? 'menu' : document.activeElement?.className || document.activeElement?.tagName,
      inView: r ? r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth : null,
      below: r && b ? r.top >= b.bottom : null, above: r && b ? r.bottom <= b.top : null,
      menus: document.querySelectorAll('.dd-menu').length,
      scrolled: se.scrollTop !== 0 || se.scrollLeft !== 0 || main.scrollTop !== 0 || se.scrollHeight > innerHeight + 1,
    };
  }, key);
  const saved = (p) => p.evaluate(async () => (await window.__TAURI__.core.invoke('state_get')).schedules);
  const settle = (p, ms = 260) => p.waitForTimeout(ms);
  const ROW = 'dd-s-s1', NEW = 'dd-new';

  // ----- Mở / đóng bằng chuột -----
  const p = await open();
  let s = await dd(p, ROW);
  check('trigger exposes button/listbox ARIA', s.haspopup === 'listbox' && s.expanded === 'false' && !s.open && s.value === 'shutdown', s);
  await shot(p, 'closed');
  await p.click(`[data-key=${ROW}] .dd-btn`); await settle(p);
  s = await dd(p, ROW);
  check('click opens a listbox with 6 options', s.open && s.role === 'listbox' && s.count === 6 && s.expanded === 'true' && !!s.controls, s);
  check('current option is marked selected and active', s.selected.join() === 'shutdown' && s.active === 0 && s.activedesc === 0, s);
  check('open menu sits below the trigger, inside the viewport', s.below && s.inView && s.side === 'bottom', s);
  check('focus moves into the menu', s.focus === 'menu', s);
  await p.hover('.dd-menu [role=option]:nth-child(3)');
  await shot(p, 'open');
  check('hover highlights the option', (await dd(p, ROW)).active === 2);
  await p.mouse.click(700, 650); await settle(p);
  s = await dd(p, ROW);
  check('click outside closes the menu', !s.open && s.expanded === 'false' && s.menus === 0, s);

  // ----- Bàn phím -----
  await p.focus(`[data-key=${ROW}] .dd-btn`);
  await p.keyboard.press('Enter'); await settle(p, 200);
  s = await dd(p, ROW);
  check('Enter opens the menu', s.open && s.focus === 'menu', s);
  await p.keyboard.press('ArrowDown');
  check('ArrowDown moves to the next option', (await dd(p, ROW)).active === 1);
  await p.keyboard.press('End');
  check('End jumps to the last option', (await dd(p, ROW)).active === 5);
  await p.keyboard.press('Home');
  check('Home jumps to the first option', (await dd(p, ROW)).active === 0);
  await p.keyboard.press('ArrowUp');
  check('ArrowUp stops at the first option', (await dd(p, ROW)).active === 0);
  await p.keyboard.press('k');
  check('typing "k" jumps to "Khởi động lại"', (await dd(p, ROW)).active === 1);
  await p.keyboard.press('k');
  check('typing "k" again cycles to "Khoá màn hình"', (await dd(p, ROW)).active === 4);
  await p.waitForTimeout(800);
  await p.keyboard.press('d');
  check('typing "d" matches "Đăng xuất" (diacritics folded)', (await dd(p, ROW)).active === 5);
  await p.keyboard.press('ArrowUp');
  s = await dd(p, ROW);
  check('keyboard highlight follows aria-activedescendant', s.active === 4 && s.activedesc === 4, s);
  await shot(p, 'keyboard');
  await p.keyboard.press('Enter'); await settle(p, 350);
  s = await dd(p, ROW);
  check('Enter selects: data-value and face update', !s.open && s.value === 'lock' && /khoá/i.test(s.face), s);
  check('focus returns to the trigger after selecting', s.focus === 'trigger', s);
  let list = await saved(p);
  check('selection is saved through sleepy.setSchedules', list.find((x) => x.id === 's1').action === 'lock', list.map((x) => `${x.id}:${x.action}`));
  s = await dd(p, ROW);
  check('re-render after save keeps the new value', s.value === 'lock' && /khoá/i.test(s.face), s);

  await p.keyboard.press('Space'); await settle(p, 200);
  check('Space opens the menu', (await dd(p, ROW)).open);
  await p.keyboard.press('Escape'); await settle(p);
  s = await dd(p, ROW);
  check('Escape closes and returns focus to the trigger', !s.open && s.focus === 'trigger' && s.expanded === 'false', s);
  await p.keyboard.press('ArrowDown'); await settle(p, 200);
  check('ArrowDown on the trigger opens the menu', (await dd(p, ROW)).open);
  await p.keyboard.press('Tab'); await settle(p);
  s = await dd(p, ROW);
  check('Tab closes and returns focus to the trigger', !s.open && s.focus === 'trigger', s);
  check('value unchanged after Escape/Tab', s.value === 'lock', s);

  // ----- Vẽ lại lúc menu đang mở -----
  await p.click(`[data-key=${ROW}] .dd-btn`); await settle(p);
  const before = await p.evaluate(() => { window.__btn = document.querySelector('[data-key=dd-s-s1] .dd-btn'); return true; });
  await p.evaluate(() => { render(); render(); });
  await p.evaluate(() => sleepy.setSettings({ sound: false })); await settle(p, 200); // trạng thái đổi → app vẽ lại
  s = await dd(p, ROW);
  const same = await p.evaluate(() => window.__btn === document.querySelector('[data-key=dd-s-s1] .dd-btn'));
  check('menu survives morph re-renders (same trigger, still expanded)', before && same && s.open && s.expanded === 'true' && s.menus === 1, s);
  await p.keyboard.press('Escape'); await settle(p);

  // ----- Ô chọn ở dòng Thêm lịch: chọn bằng chuột rồi thêm -----
  await p.click(`[data-key=${NEW}] .dd-btn`); await settle(p);
  await p.click('.dd-menu [data-value=suspend]'); await settle(p);
  s = await dd(p, NEW);
  check('mouse selection updates the adder value', s.value === 'suspend' && !s.open && await p.evaluate(() => sched.action === 'suspend'), s);
  await p.click('[data-do=sched-add]'); await settle(p, 300);
  list = await saved(p);
  check('new schedule is saved with the chosen action', list.length === 3 && list[2].action === 'suspend', list.map((x) => `${x.time}:${x.action}`));
  check('page never scrolled', !(await dd(p, NEW)).scrolled);

  // ----- Đổi cỡ cửa sổ đóng menu -----
  await p.click(`[data-key=${NEW}] .dd-btn`); await settle(p);
  await p.setViewportSize({ width: 1000, height: 740 }); await settle(p, 400);
  check('resize closes the menu', !(await dd(p, NEW)).open);
  await p.close();

  // ----- Sát đáy cửa sổ: menu lật lên trên, vẫn nằm trong khung -----
  for (const [w, h] of [[1060, 760], [640, 480]]) {
    const q = await open({ w, h, extra: 12 });
    const key = await q.evaluate(() => [...document.querySelectorAll('.sched .item .dd')].pop().dataset.key);
    await q.click(`[data-key="${key}"] .dd-btn`); await settle(q);
    s = await dd(q, key);
    check(`${w}x${h}: menu near the bottom flips above and stays in view`, s.open && s.side === 'top' && s.above && s.inView && !s.scrolled, s);
    if (w === 1060) await shot(q, 'flipped');
    else await shot(q, 'flipped-small');
    await q.close();
  }

  // ----- Giảm chuyển động: mở/đóng tức thì -----
  const r = await open({ reduced: true });
  await r.click(`[data-key=${ROW}] .dd-btn`);
  const inNow = await r.evaluate(() => document.querySelector('.dd-menu')?.classList.contains('in'));
  await r.keyboard.press('Escape');
  const gone = await r.evaluate(() => document.querySelectorAll('.dd-menu').length === 0);
  check('reduced motion: opens and closes without animation', inNow && gone, { inNow, gone });
  await r.close();

  await browser.close();
  const failed = results.filter((x) => !x.ok);
  console.log(JSON.stringify({ theme, passed: results.length - failed.length, failed: failed.length, errors, results }, null, 1));
  process.exit(failed.length || errors.length ? 1 : 0);
})();
