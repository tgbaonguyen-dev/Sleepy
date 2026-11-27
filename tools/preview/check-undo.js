// Kiểm tra hệ thống Hoàn tác (RC3), danh sách (Preset/Lịch lặp/Nhật ký/Cài đặt), bảng lệnh và phím tắt.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, ...(detail !== undefined ? { detail } : {}) });
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1060, height: 760 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const mock = fs.readFileSync(path.join(__dirname, 'mock-ipc.js'), 'utf8');
  await page.addInitScript(`window.__MOCK__ = { theme: 'dark', dryRun: true, history: 6, extra: 1 };\n${mock}`);
  await page.goto('file://' + path.resolve(__dirname, '../../ui/index.html'));
  await page.waitForTimeout(600);

  // 1. Window controls excluded from default tab order
  const winTabs = await page.evaluate(() => [...document.querySelectorAll('.winctl button')].map((b) => b.tabIndex));
  check('window controls have tabindex=-1', winTabs.length === 3 && winTabs.every((t) => t === -1), winTabs);

  // 2. Schedules: delete 2 quickly -> merged toast -> 1 undo restores both at original positions
  await page.click('[data-view="schedules"]');
  await page.waitForTimeout(450);
  const origSchedIds = await page.evaluate(() => [...document.querySelectorAll('[data-key^="s-"]')].map((r) => r.dataset.key));
  check('schedules initial count >= 3', origSchedIds.length >= 3, origSchedIds);

  // Verify no exposed trash icon, day chips 32x32, dropdown >= 160px
  const schedChecks = await page.evaluate(() => {
    const trash = document.querySelectorAll('[data-sdel]').length;
    const dayRect = document.querySelector('.sched .sinfo .day')?.getBoundingClientRect();
    const ddRect = document.querySelector('.sched .dd-row .dd-btn')?.getBoundingClientRect();
    const offItem = document.querySelector('.sched .item.off');
    const toggleOpacity = offItem ? getComputedStyle(offItem.querySelector('.switch')).opacity : null;
    const itemOpacity = offItem ? getComputedStyle(offItem).opacity : null;
    const h2s = [...document.querySelectorAll('.sched h2')].map((h) => h.textContent.trim());
    return {
      trash,
      dayW: dayRect ? Math.round(dayRect.width) : 0,
      dayH: dayRect ? Math.round(dayRect.height) : 0,
      ddW: ddRect ? Math.round(ddRect.width) : 0,
      toggleOpacity,
      itemOpacity,
      h2s,
    };
  });
  check('schedules: no exposed trash icon', schedChecks.trash === 0, schedChecks.trash);
  check('schedules: day chips are 32x32', schedChecks.dayW === 32 && schedChecks.dayH === 32, { w: schedChecks.dayW, h: schedChecks.dayH });
  check('schedules: action dropdown >= 160px', schedChecks.ddW >= 160, schedChecks.ddW);
  check('schedules: disabled row does not dim toggle', schedChecks.itemOpacity === '1' && schedChecks.toggleOpacity === '1', { item: schedChecks.itemOpacity, toggle: schedChecks.toggleOpacity });
  check('schedules: h2 headings Lịch mới & Lịch đã tạo', schedChecks.h2s[0] === 'Lịch mới' && schedChecks.h2s[1] === 'Lịch đã tạo', schedChecks.h2s);

  // Autostart notice button enables autostart and hides notice
  const noticeBefore = await page.locator('.inline-notice').count();
  await page.click('[data-autostart-cta]');
  await page.waitForTimeout(200);
  const noticeAfter = await page.locator('.inline-notice').count();
  check('schedules: autostart CTA hides notice once enabled', noticeBefore === 1 && noticeAfter === 0, { noticeBefore, noticeAfter });

  // Delete 1st schedule via menu
  await page.click(`[data-smenu="${origSchedIds[0].slice(2)}"]`);
  await page.click('.pmenu [data-pm="del"]');
  await page.waitForTimeout(320);

  // Focus moved to next row's ⋯ button
  const focusedAfter1 = await page.evaluate(() => document.activeElement?.dataset?.smenu || null);
  check('schedules: focus moves to next row menu after delete', focusedAfter1 === origSchedIds[1].slice(2), focusedAfter1);

  // Delete 2nd schedule quickly while toast is still visible
  await page.click(`[data-smenu="${origSchedIds[1].slice(2)}"]`);
  await page.click('.pmenu [data-pm="del"]');
  await page.waitForTimeout(320);

  const toastInfo = await page.evaluate(() => {
    const t = document.querySelector('#toast');
    const x = t.querySelector('.toast-x')?.getBoundingClientRect();
    return {
      role: t.getAttribute('role'),
      msg: t.querySelector('.toast-msg')?.textContent || '',
      act: t.querySelector('.toast-act')?.textContent || '',
      xW: x ? Math.round(x.width) : 0,
      xH: x ? Math.round(x.height) : 0,
    };
  });
  check('merged undo toast copy & role & close hit area', toastInfo.msg === 'Đã xoá 2 lịch' && toastInfo.act === 'Hoàn tác' && toastInfo.role === 'status' && toastInfo.xW >= 32 && toastInfo.xH >= 32, toastInfo);

  // Click Hoàn tác once -> restores BOTH at original positions
  await page.click('[data-toast-act]');
  await page.waitForTimeout(250);
  const restoredSchedIds = await page.evaluate(() => [...document.querySelectorAll('[data-key^="s-"]')].map((r) => r.dataset.key));
  check('single Hoàn tác restores both schedules at original positions', JSON.stringify(restoredSchedIds) === JSON.stringify(origSchedIds), { origSchedIds, restoredSchedIds });

  // Inline time edit on first schedule
  await page.click(`[data-smenu="${origSchedIds[0].slice(2)}"]`);
  await page.click('.pmenu [data-pm="edit"]');
  await page.waitForTimeout(100);
  await page.fill('[data-stime-edit] input[data-se="h"]', '22');
  await page.fill('[data-stime-edit] input[data-se="m"]', '45');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const editedTime = await page.evaluate((k) => document.querySelector(`[data-key="${k}"] .stime`)?.textContent, origSchedIds[0]);
  check('schedules: inline time edit updates time', editedTime === '22:45', editedTime);

  // 3. Presets: delete -> rename another -> Ctrl+Z restores deleted AND preserves rename
  await page.click('[data-view="presets"]');
  await page.waitForTimeout(200);
  const origPresets = await page.evaluate(() => [...document.querySelectorAll('[data-key^="p-"]')].map((r) => ({ id: r.dataset.key.slice(2), name: r.querySelector('.pname')?.textContent })));

  // Delete p1 via Delete key on focused row
  await page.focus(`[data-key="p-${origPresets[0].id}"]`);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(320);

  // Rename p2 via F2
  await page.focus(`[data-key="p-${origPresets[1].id}"]`);
  await page.keyboard.press('F2');
  await page.waitForTimeout(100);
  await page.fill(`[data-rename-input="${origPresets[1].id}"]`, 'Tên đã đổi giữa undo');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);

  // Now Ctrl+Z -> should restore p1 at index 0 AND keep p2's new name!
  await page.focus('body');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  const afterUndoPresets = await page.evaluate(() => [...document.querySelectorAll('[data-key^="p-"]')].map((r) => ({ id: r.dataset.key.slice(2), name: r.querySelector('.pname')?.textContent })));
  check('undo after rename restores deleted preset at index 0 and preserves rename',
    afterUndoPresets[0]?.id === origPresets[0].id && afterUndoPresets[1]?.id === origPresets[1].id && afterUndoPresets[1]?.name === 'Tên đã đổi giữa undo',
    afterUndoPresets.slice(0, 3));

  // 4. Undo stack: 2 separate deletes (toast closed between) -> 2x Ctrl+Z restores both
  await page.focus(`[data-key="p-${origPresets[0].id}"]`);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(320);
  await page.click('[data-toast-close]');
  await page.waitForTimeout(100);
  await page.focus(`[data-key="p-${origPresets[1].id}"]`);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(320);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const afterStackUndo = await page.evaluate(() => [...document.querySelectorAll('[data-key^="p-"]')].map((r) => r.dataset.key.slice(2)));
  check('undo stack: repeated Ctrl+Z pops multiple separate deletes', afterStackUndo[0] === origPresets[0].id && afterStackUndo[1] === origPresets[1].id, afterStackUndo.slice(0, 3));

  // 5. Command palette (Ctrl+K)
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(150);
  const palInfo = await page.evaluate(() => {
    const groups = [...document.querySelectorAll('.pal-group')].map((g) => g.textContent);
    const metaCount = document.querySelectorAll('.pal-meta').length;
    const badKbd = [...document.querySelectorAll('.pal-item kbd')].filter((k) => /Tạm ngưng|Âm thanh|Cài đặt/.test(k.textContent)).length;
    const hasSearchIco = !!document.querySelector('.pal-search-ico svg');
    const placeholder = document.querySelector('.pal-in')?.placeholder;
    const moreVisible = !document.querySelector('.pal-more')?.hidden;
    return { groups, metaCount, badKbd, hasSearchIco, placeholder, moreVisible };
  });
  check('palette: search icon, groups, caption meta (no kbd for meta), overflow indicator',
    palInfo.hasSearchIco && palInfo.placeholder === 'Tìm lệnh…' && palInfo.groups.includes('Điều hướng') && palInfo.groups.includes('Preset') && palInfo.metaCount > 0 && palInfo.badKbd === 0 && palInfo.moreVisible,
    palInfo);

  await page.fill('.pal-in', 'zzzzz-khong-co');
  await page.waitForTimeout(100);
  const emptyPal = await page.locator('.pal-empty').textContent();
  check('palette: empty copy matches query', emptyPal === 'Không có lệnh khớp "zzzzz-khong-co"', emptyPal);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);

  // 6. Help overlay (?)
  await page.keyboard.press('Shift+?');
  await page.waitForTimeout(150);
  const helpInfo = await page.evaluate(() => {
    const closeBtn = document.querySelector('[data-pal-close]')?.getBoundingClientRect();
    const kbds = [...document.querySelectorAll('.pal-keys kbd')].map((k) => k.textContent);
    return { closeW: closeBtn ? Math.round(closeBtn.width) : 0, closeH: closeBtn ? Math.round(closeBtn.height) : 0, kbds };
  });
  check('help overlay: close >= 32x32 and includes ?, Delete, Ctrl+.',
    helpInfo.closeW >= 32 && helpInfo.closeH >= 32 && helpInfo.kbds.includes('?') && helpInfo.kbds.includes('Delete') && helpInfo.kbds.includes('Ctrl+.'),
    helpInfo);
  await page.keyboard.press('Escape');

  check('zero console/page errors', errors.length === 0, errors);

  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();
