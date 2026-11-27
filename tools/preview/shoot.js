// Chụp giao diện bằng Playwright với IPC giả lập.
// node tools/preview/shoot.js <out.png> [--theme dark|light] [--size 1060x760] [--page warning] [--job] [--history 40] [--extra 8] [--steps "click:[data-view=presets];wait:400"]
// Bước: click:<sel> · wait:<ms> · key:<phím> · eval:<js> · hover:<sel> · shot:<file.png> (chụp giữa chừng) · log:<js> (ghi kết quả vào "logs")
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const args = process.argv.slice(2);
const out = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(k);
(async () => {
  const [w, h] = opt('--size', '1060x760').split('x').map(Number);
  const theme = opt('--theme', 'dark');
  const page = opt('--page', 'index');
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: Number(opt('--scale', '1')) });
  const errors = [], logs = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const mock = fs.readFileSync(path.join(__dirname, 'mock-ipc.js'), 'utf8');
  await p.addInitScript(`window.__MOCK__ = ${JSON.stringify({ theme, job: flag('--job') ? { action: 'shutdown', trigger: { type: 'countdown', seconds: 95 } } : null, dryRun: true,
    history: Number(opt('--history', '6')), extra: Number(opt('--extra', '0')) })};\n${mock}`);
  await p.goto('file://' + path.resolve(__dirname, '../../ui', page + '.html'));
  await p.waitForTimeout(1200);
  for (const s of (opt('--steps', '') || '').split(';').filter(Boolean)) {
    const [k, ...rest] = s.split(':'); const v = rest.join(':');
    if (k === 'click') await p.click(v);
    else if (k === 'wait') await p.waitForTimeout(Number(v));
    else if (k === 'key') await p.keyboard.press(v);
    else if (k === 'eval') await p.evaluate(v);
    else if (k === 'hover') await p.hover(v);
    else if (k === 'shot') await p.screenshot({ path: v });
    else if (k === 'log') logs.push(await p.evaluate(v));
  }
  await p.waitForTimeout(300);
  const scroll = await p.evaluate(() => {
    const m = document.querySelector('#main') || document.body;
    return { docOverflow: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1,
      mainOverflow: m.scrollHeight > m.clientHeight + 1 };
  });
  await p.screenshot({ path: out });
  console.log(JSON.stringify({ out, errors, ...scroll, ...(logs.length ? { logs } : {}) }));
  await browser.close();
})();
