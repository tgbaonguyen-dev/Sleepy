// Kiểm tra rằng giao diện được "vá" tại chỗ chứ không dựng lại: nút DOM phải sống sót qua các thao tác
// chỉ đổi trạng thái, và chỉ bị thay khi đổi màn.
// node tools/preview/check-morph.js [--theme dark|light]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const args = process.argv.slice(2);
const theme = args.includes('--theme') ? args[args.indexOf('--theme') + 1] : 'dark';

(async () => {
  const browser = await chromium.launch();
  const results = [], errors = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, ...(detail !== undefined ? { detail } : {}) });

  async function open(job) {
    const p = await browser.newPage({ viewport: { width: 1060, height: 760 } });
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const mock = fs.readFileSync(path.join(__dirname, 'mock-ipc.js'), 'utf8');
    await p.addInitScript(`window.__MOCK__ = ${JSON.stringify({ theme, job: job ? { action: 'shutdown', trigger: { type: 'countdown', seconds: 95 } } : null })};\n${mock}`);
    await p.goto('file://' + path.resolve(__dirname, '../../ui/index.html'));
    await p.waitForTimeout(800);
    // Ghi lại các nút cần theo dõi, và đếm số phần tử bị gỡ khỏi #main.
    await p.evaluate(() => {
      window.__probe = (sels) => { window.__nodes = Object.fromEntries(sels.map((s) => [s, document.querySelector(s)])); window.__removed = 0; };
      window.__alive = () => Object.fromEntries(Object.entries(window.__nodes).map(([s, n]) => [s, !!n && n.isConnected]));
      new MutationObserver((ms) => { for (const m of ms) window.__removed += [...m.removedNodes].filter((n) => n.nodeType === 1).length; })
        .observe(document.querySelector('#main'), { childList: true, subtree: true });
    });
    return p;
  }
  const allAlive = (o) => Object.values(o).every(Boolean);
  const sideBounds = (page) => page.evaluate(() => Object.fromEntries(['side-actions', 'side-mode', 'side-detail'].map((id) => {
    const rect = document.getElementById(id).getBoundingClientRect();
    return [id, [rect.x, rect.y, rect.width, rect.height].map(Math.round)];
  })));
  const SETUP = ['#main > section.view', '.act[data-action=shutdown]', '.act[data-action=reboot]', '.seg.wide', '#dial', '#dial-svg', '[data-do=start]', '#rail button[data-view=timer]'];

  // ----- Màn thiết lập -----
  const p = await open(false);
  const sky0 = await p.evaluate(() => document.querySelector('#sky').toDataURL());
  await p.waitForTimeout(240);
  const sky1 = await p.evaluate(() => document.querySelector('#sky').toDataURL());
  check('sky respects theme and animates in dark mode', theme === 'light'
    ? await p.evaluate(() => getComputedStyle(document.querySelector('#sky')).display === 'none')
    : sky0 !== sky1);
  await p.evaluate((s) => window.__probe(s), SETUP);
  await p.click('[data-action=shutdown]'); await p.waitForTimeout(50);
  let alive = await p.evaluate(() => window.__alive());
  check('reselect active action keeps nodes', allAlive(alive), alive);
  check('reselect active action starts no animation', await p.evaluate(() => !document.querySelector('[data-action=shutdown]').getAnimations({ subtree: true }).length));
  check('reselect active action removes no #main elements', (await p.evaluate(() => window.__removed)) === 0, await p.evaluate(() => window.__removed));
  const setupSideBounds = await sideBounds(p);
  await p.click('[data-mode=countdown]');
  await p.click('[data-chip="60"]');
  await p.waitForTimeout(50);
  check('reselect active mode and chip remove no #main elements', (await p.evaluate(() => window.__removed)) === 0, await p.evaluate(() => window.__removed));

  await p.evaluate((s) => window.__probe(s), SETUP);
  await p.click('[data-action=reboot]'); await p.waitForTimeout(250);
  alive = await p.evaluate(() => window.__alive());
  check('select action keeps nodes', allAlive(alive), alive);
  check('select action toggles .on in place', await p.evaluate(() => window.__nodes['.act[data-action=reboot]'].classList.contains('on') && !window.__nodes['.act[data-action=shutdown]'].classList.contains('on')));
  check('select action removed no #main elements', (await p.evaluate(() => window.__removed)) === 0, await p.evaluate(() => window.__removed));

  await p.evaluate((s) => window.__probe(s), SETUP);
  await p.click('[data-mode=at]'); await p.waitForTimeout(250);
  alive = await p.evaluate(() => window.__alive());
  check('switch trigger mode keeps nodes', allAlive(alive), alive);
  check('switch trigger mode updates seg in place', await p.evaluate(() => window.__nodes['.seg.wide'].querySelector('.on').dataset.mode === 'at'));
  check('setup column stays fixed in at mode', JSON.stringify(await sideBounds(p)) === JSON.stringify(setupSideBounds), await sideBounds(p));

  await p.evaluate((s) => window.__probe(s), SETUP);
  await p.click('[data-mode=cond]'); await p.waitForTimeout(150);
  await p.click('[data-type=cpu]'); await p.waitForTimeout(250);
  alive = await p.evaluate(() => window.__alive());
  check('switch condition tab keeps nodes', allAlive(alive), alive);
  check('setup column stays fixed across conditions', JSON.stringify(await sideBounds(p)) === JSON.stringify(setupSideBounds), await sideBounds(p));

  // Sự kiện state từ backend (settings_set phát lại state) trong lúc đang gõ ở ô số
  await p.click('[data-mode=countdown]'); await p.waitForTimeout(200);
  await p.evaluate((s) => window.__probe(s), [...SETUP, '[data-dial="countdown.m"]']);
  await p.click('[data-dial="countdown.m"]'); await p.keyboard.type('4');
  await p.evaluate(() => sleepy.setSettings({ sound: false })); await p.waitForTimeout(250);
  alive = await p.evaluate(() => window.__alive());
  check('backend state event keeps nodes', allAlive(alive), alive);
  check('backend state event keeps focused input + typed value', await p.evaluate(() => document.activeElement === window.__nodes['[data-dial="countdown.m"]'] && document.activeElement.value === '4'),
    await p.evaluate(() => document.activeElement.value));
  await p.keyboard.press('Tab');

  // Tick mỗi giây
  await p.evaluate((s) => window.__probe(s), SETUP);
  await p.waitForTimeout(2200);
  alive = await p.evaluate(() => window.__alive());
  check('ticks keep setup nodes', allAlive(alive), alive);

  // Đổi màn: nội dung phải được thay
  await p.evaluate((s) => window.__probe(s), SETUP);
  await p.click('[data-view=presets]'); await p.waitForTimeout(450);
  const sw = await p.evaluate(() => ({ old: window.__nodes['#main > section.view'].isConnected, key: document.querySelector('#main > section.view').dataset.key, rail: window.__nodes['#rail button[data-view=timer]'].isConnected }));
  check('switching view swaps content', !sw.old && sw.key === 'v-presets', sw);
  check('switching view keeps sidebar buttons', sw.rail);
  await p.keyboard.press('Control+3'); await p.waitForTimeout(450);
  await p.evaluate((s) => window.__probe(s), ['#main > section.view', '.switch[data-stoggle=s2]', '.item[data-key=s-s1]']);
  await p.click('.switch[data-stoggle=s2]'); await p.waitForTimeout(250);
  alive = await p.evaluate(() => window.__alive());
  check('toggle schedule switch keeps nodes', allAlive(alive) && await p.evaluate(() => window.__nodes['.switch[data-stoggle=s2]'].classList.contains('on')), alive);
  await p.keyboard.press('Control+1'); await p.waitForTimeout(450);
  // Thiết lập → đang chạy
  await p.evaluate((s) => window.__probe(s), SETUP);
  await p.click('[data-do=start]'); await p.waitForTimeout(500);
  const run = await p.evaluate(() => ({ old: window.__nodes['#main > section.view'].isConnected, key: document.querySelector('#main > section.view').dataset.key }));
  check('start swaps setup → running view', !run.old && run.key === 'v-running', run);
  await p.close();

  // ----- Màn đang chạy -----
  const q = await open(true);
  const RUN = ['#main > section.view', '#orb', '#orb-svg', '#big', '.cel-run', '#controls', '[data-do=cancel]', '[data-post="5"]', '#mini svg'];
  await q.evaluate((s) => window.__probe(s), RUN);
  const arc0 = await q.getAttribute('#run-arc', 'd');
  await q.waitForTimeout(120);
  const arc1 = await q.getAttribute('#run-arc', 'd');
  check('countdown arc moves smoothly between backend ticks', arc0 !== arc1, { arc0, arc1 });
  const t0 = await q.evaluate(() => document.querySelector('#big').textContent);
  await q.waitForTimeout(2200);
  alive = await q.evaluate(() => window.__alive());
  const t1 = await q.evaluate(() => document.querySelector('#big').textContent);
  check('ticks keep running nodes', allAlive(alive), alive);
  check('ticks still update the clock', t0 !== t1, { t0, t1 });
  await q.click('.awake-pill'); await q.waitForTimeout(250);
  check('keep-awake control updates in place', await q.evaluate(() => !document.querySelector('.awake-pill').classList.contains('on')));
  await q.evaluate((s) => window.__probe(s), RUN);
  await q.click('[data-post="5"]'); await q.waitForTimeout(300);
  alive = await q.evaluate(() => window.__alive());
  check('postpone (backend state) keeps running nodes', allAlive(alive), alive);
  await q.click('[data-do=cancel]'); await q.waitForTimeout(500);
  check('cancel swaps running → setup view', await q.evaluate(() => document.querySelector('#main > section.view').dataset.key === 'v-setup'));
  await q.close();

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ theme, passed: results.length - failed.length, failed: failed.length, errors, results }, null, 1));
  process.exit(failed.length || errors.length ? 1 : 0);
})();
