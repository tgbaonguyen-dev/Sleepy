/* global Shared, Icons, Dropdown, Ambient, sleepy */
const S = Shared;
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = S.pad;
const TAU = Math.PI * 2;

let st = null, snap = null, view = 'timer', draft = null;
let procList = [], procRunning = null, savingPreset = false, renaming = null;
const spark = { cpu: [], net: [] };
// Danh sách dài (preset, lịch lặp, nhật ký) không bao giờ cuộn: mỗi trang chỉ chứa số dòng vừa khung,
// số đó được đo lại sau mỗi lần vẽ / đổi cỡ cửa sổ (xem fitPages).
let setTab = 'warn'; // nhóm cài đặt đang mở khi cửa sổ nhỏ (rộng thì cả ba nhóm hiện cùng lúc)
const pages = { presets: { page: 0, per: 8 }, schedules: { page: 0, per: 6 }, history: { page: 0, per: 10 } };
const sched = { h: 23, m: 30, days: [1, 2, 3, 4, 5], action: 'shutdown' };

const VIEWS = [['timer', 'Hẹn giờ', 'timer'], ['sounds', 'Âm thanh', 'sound'], ['presets', 'Preset', 'bookmark'], ['schedules', 'Lịch lặp', 'repeat'], ['history', 'Nhật ký', 'history'], ['settings', 'Cài đặt', 'gear']];
const ORDER = ['shutdown', 'reboot', 'suspend', 'hibernate', 'lock', 'logout'];
const CONDS = [['idle', 'Không hoạt động'], ['net', 'Lưu lượng mạng'], ['cpu', 'Mức sử dụng CPU'], ['process', 'Ứng dụng kết thúc'], ['battery', 'Mức pin']];
const isCond = (t) => !['countdown', 'at'].includes(t);
Dropdown.define('action', ORDER.map((k) => ({ value: k, label: S.ACTIONS[k].label, icon: Icons[k] })));

// ---------- Hình học vòng tròn ----------
const pt = (c, r, f) => [c + r * Math.sin(f * TAU), c - r * Math.cos(f * TAU)];
function arc(c, r, f0, f1) {
  if (f1 - f0 <= 0.0005) return '';
  if (f1 - f0 >= 0.9995) return `M${c} ${c - r} A${r} ${r} 0 1 1 ${c - 0.01} ${c - r}`;
  const [x0, y0] = pt(c, r, f0), [x1, y1] = pt(c, r, f1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${f1 - f0 > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
const DEFS = `<defs>
  <linearGradient id="gMoon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--moon)"/><stop offset="1" style="stop-color:var(--moon-2)"/></linearGradient>
  <linearGradient id="gHot" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--lamp)"/><stop offset="1" style="stop-color:var(--danger)"/></linearGradient>
</defs>`;
function ticks(c, r, n, major, len = 6) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const f = i / n, big = i % major === 0;
    const [x0, y0] = pt(c, r, f), [x1, y1] = pt(c, r - (big ? len + 4 : len), f);
    s += `<line class="tick" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" style="opacity:${big ? 1 : .5}"/>`;
  }
  return s;
}

// Mặt trời ban ngày (6h–18h), mặt trăng ban đêm — dùng làm núm kéo và điểm cuối vòng đếm
const isDay = (h) => h >= 6 && h < 18;
function celestial(x, y, day, s = 1, cls = 'handle-g') {
  const R = 17 * s;
  let inner = '';
  if (day) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU, r0 = 8.5 * s, r1 = 12 * s;
      inner += `<line x1="${(x + r0 * Math.cos(a)).toFixed(2)}" y1="${(y + r0 * Math.sin(a)).toFixed(2)}" x2="${(x + r1 * Math.cos(a)).toFixed(2)}" y2="${(y + r1 * Math.sin(a)).toFixed(2)}" stroke="#F5A524" stroke-width="${2 * s}" stroke-linecap="round"/>`;
    }
    inner += `<circle cx="${x}" cy="${y}" r="${5.6 * s}" fill="#FFB938" stroke="#F29A1D" stroke-width="${s}"/>`;
  } else {
    inner = `<circle cx="${x}" cy="${y}" r="${8.5 * s}" class="cel-moon"/><circle cx="${x + 4.6 * s}" cy="${y - 3.4 * s}" r="${7.4 * s}" class="cel-bg"/>` +
      `<circle cx="${x + 7.5 * s}" cy="${y + 4.5 * s}" r="${1 * s}" class="cel-moon"/>`;
  }
  return `<g class="${cls}" style="transform-origin:${x}px ${y}px"><circle cx="${x}" cy="${y}" r="${R}" class="cel-bg cel-disc"/>${inner}</g>`;
}

// ---------- Bản nháp ----------
function initDraft(d) {
  const b = {
    action: 'shutdown', type: 'countdown', condType: 'idle',
    countdown: { h: 1, m: 0, s: 0 }, at: { h: 23, m: 30 }, idle: { minutes: 20 }, battery: { percent: 15 },
    net: { kbps: 50, minutes: 3 }, cpu: { percent: 10, minutes: 3 }, process: { name: '' }
  };
  if (!d) return b;
  if (d.type) return { ...b, ...d };
  if (d.action) b.action = d.action;
  const t = d.trigger;
  if (t) {
    b.type = t.type;
    if (t.type === 'countdown') b.countdown = { h: Math.floor(t.seconds / 3600), m: Math.floor((t.seconds % 3600) / 60), s: t.seconds % 60 };
    else if (t.type === 'at') { const [h, m] = t.time.split(':').map(Number); b.at = { h, m }; }
    else if (b[t.type]) { const { type, ...rest } = t; b[t.type] = { ...b[t.type], ...rest }; b.condType = t.type; }
  }
  return b;
}
function trigger(d = draft) {
  const c = d[d.type];
  switch (d.type) {
    case 'countdown': return { type: 'countdown', seconds: c.h * 3600 + c.m * 60 + (c.s || 0) };
    case 'at': return { type: 'at', time: `${pad(c.h)}:${pad(c.m)}` };
    case 'process': return { type: 'process', name: c.name.trim() };
    default: return { type: d.type, ...c };
  }
}
let draftTimer;
function saveDraft() { clearTimeout(draftTimer); draftTimer = setTimeout(() => sleepy.setDraft(draft), 400); }

// ---------- Tiện ích ----------
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(t._t); t._t = setTimeout(() => { t.className = 'toast'; }, 2600);
}
function applyTheme() {
  const pref = st?.settings.theme || 'dark';
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
function sourceLabel(src) {
  if (!src || src === 'manual') return 'Thủ công';
  const [k, id] = src.split(':');
  if (k === 'preset') return `Preset "${st.presets.find((p) => p.id === id)?.name || '—'}"`;
  if (k === 'schedule') { const s = st.schedules.find((x) => x.id === id); return `Lịch lặp ${s ? s.time : ''}`; }
  return src;
}
function capOk(a) { const c = st.caps?.[a]; return !c || c === 'yes' || c === 'challenge' || c === 'unknown'; }
function greet() {
  const d = new Date();
  return `${S.DAY_LONG[d.getDay()]} · ${S.hhmm(d)}`;
}
function roll(el, text) {
  if (!el) return;
  const prev = el.dataset.t || '';
  if (prev === text) return;
  el.dataset.t = text;
  const spans = el.children;
  if (prev.length === text.length && spans.length === text.length) {
    // Chỉ thay chữ số đổi; các chữ số khác giữ nguyên nút
    [...text].forEach((ch, i) => {
      if (prev[i] === ch) return;
      const n = document.createElement('span'); n.className = 'ch roll'; n.textContent = ch;
      spans[i].replaceWith(n);
    });
    return;
  }
  el.innerHTML = [...text].map((ch) => `<span class="ch">${esc(ch)}</span>`).join('');
}

// ---------- Khung ----------
function renderRail() {
  const active = st.schedules.filter((s) => s.enabled).length;
  morph($('#rail'), VIEWS.map(([k, label, ic]) => `<button data-view="${k}" class="${view === k ? 'on' : ''}" title="${label} (Ctrl+${VIEWS.findIndex((v) => v[0] === k) + 1})">
    ${Icons[ic]}<span>${label}</span>${k === 'schedules' && active ? `<span class="badge">${active}</span>` : ''}${k === 'sounds' && Ambient.playing ? '<span class="eq" aria-label="Đang phát"><i></i><i></i><i></i></span>' : ''}</button>`).join('') + `<div class="mini" id="mini" data-view="timer" data-own></div>`);
  renderMini();
}
function renderMini() {
  const el = $('#mini'); if (!el) return;
  const j = snap?.job;
  if (!j) {
    el.className = 'mini idle';
    morph(el, `<svg viewBox="0 0 46 46"><circle cx="23" cy="23" r="19" fill="none" stroke-width="3" class="track"/></svg><div class="v">Sleepy</div><div class="d">Không có hẹn giờ</div>`);
    return;
  }
  el.className = 'mini';
  const f = j.phase === 'countdown' && j.totalMs ? Math.max(0, j.remaining / j.totalMs) : (j.satisfiedMs && j.need ? Math.min(1, j.satisfiedMs / j.need) : 0);
  const hot = j.phase === 'countdown' && j.remaining <= 60000;
  const v = j.phase === 'countdown' ? S.clock(j.remaining) : watchValue(j).main;
  morph(el, `<svg viewBox="0 0 46 46">${DEFS}<circle cx="23" cy="23" r="19" fill="none" stroke-width="3" class="track"/>
    <path d="${arc(23, 19, 0, f)}" fill="none" stroke-width="3" stroke-linecap="round" stroke="url(#${hot ? 'gHot' : 'gMoon'})"/></svg>
    <div class="v num">${esc(v)}</div><div class="d">${esc(S.ACTIONS[j.action].label)}</div>`);
}
// Mọi lần vẽ lại đều "vá" DOM tại chỗ (xem morph.js): nút giữ nguyên nên transition CSS chạy
// mượt. Chỉ khi thật sự đổi màn (trang ở thanh bên, hoặc thiết lập ↔ đang chạy) mới có chuyển cảnh:
// màn mới mờ dần lên bằng Web Animations. Không dùng View Transitions API: WebKitGTK 2.52 bị
// segfault khi chuyển cảnh kiểu này.
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let shownKey = null;
const viewKey = () => (view === 'timer' ? (snap?.job ? 'running' : 'setup') : view);
function render() {
  if (!st) return;
  const key = viewKey(), first = shownKey === null, swap = !first && key !== shownKey;
  shownKey = key;
  const motion = !reduceMotion.matches;
  draw();
  if ((swap || first) && motion) {
    $('#main').firstElementChild?.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
      { duration: 240, easing: 'cubic-bezier(.22, .9, .25, 1)' });
  }
}
function draw() {
  applyTheme(); renderRail();
  const main = $('#main');
  const html = () => ({ timer: () => (snap?.job ? viewRunning() : viewSetup()), sounds: viewSounds, presets: viewPresets, schedules: viewSchedules, history: viewHistory, settings: viewSettings }[view]());
  morph(main, html());
  for (let i = 0; i < 3 && fitPages(); i++) morph(main, html());
  if (view === 'timer' && !snap?.job) { renderDial(); bindDial(); }
  if (view === 'timer' && snap?.job) updateRunning();
  const r = $('[data-rename-input]'); if (r && document.activeElement !== r) { r.focus(); r.select(); }
  const p = $('#preset-name'); if (p && document.activeElement !== p) p.focus();
  syncIndicators();
}

// Chỉ báo trượt (thanh bên, nút phân đoạn): ghi vị trí nút đang chọn vào biến CSS, phần trượt do
// transition CSS lo. Lần đầu gán thì tắt transition để chỉ báo không bay từ góc vào.
function slide(el, vars) {
  const init = !el.style.getPropertyValue('--ind-on');
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  if (!init) return;
  el.style.setProperty('--ind-on', '1'); el.style.setProperty('--ind-d', '0s');
  requestAnimationFrame(() => requestAnimationFrame(() => el.style.removeProperty('--ind-d')));
}
function syncIndicators() {
  const rail = $('#rail'), on = rail.querySelector('button.on');
  if (on) slide(rail, { '--ind-y': `${on.offsetTop}px`, '--ind-h': `${on.offsetHeight}px` });
  document.querySelectorAll('.seg').forEach((sg) => {
    const b = sg.querySelector('button.on');
    slide(sg, { '--ind-x': `${b ? b.offsetLeft : 0}px`, '--ind-w': `${b ? b.offsetWidth : 0}px` });
  });
}
let resizeRaf = 0;
addEventListener('resize', () => { if (!st) return; cancelAnimationFrame(resizeRaf); resizeRaf = requestAnimationFrame(() => draw()); });
document.fonts?.ready.then(() => st && syncIndicators());

// ---------- Phân trang ----------
function paged(name, items) {
  const pg = pages[name], count = Math.max(1, Math.ceil(items.length / pg.per));
  pg.page = Math.max(0, Math.min(pg.page, count - 1));
  return { rows: items.slice(pg.page * pg.per, (pg.page + 1) * pg.per), first: pg.page * pg.per, page: pg.page, count };
}
function pager(name, info) {
  if (info.count < 2) return '';
  return `<div class="pager" data-key="pg-${name}"><button class="icon-btn" data-page="${name}:-1" ${info.page ? '' : 'disabled'} title="Trang trước">${Icons.chevL}</button>
    <span class="num">${info.page + 1}/${info.count}</span><button class="icon-btn" data-page="${name}:1" ${info.page < info.count - 1 ? '' : 'disabled'} title="Trang sau">${Icons.chevR}</button></div>`;
}
const offsetIn = (n, root) => { let y = 0; while (n && n !== root) { y += n.offsetTop; n = n.offsetParent; } return y; };
// Đo khung [data-fit] vừa vẽ: còn dư / thiếu bao nhiêu dòng [data-row]. Trả về true nếu số dòng mỗi trang đổi
// (khi đó vẽ lại). Giữ dòng đầu trang hiện tại vẫn nằm trong trang mới.
function fitPages() {
  let changed = false;
  document.querySelectorAll('#main [data-fit]').forEach((box) => {
    const pg = pages[box.dataset.fit], rows = [...box.querySelectorAll('[data-row]')];
    if (!pg || !rows.length) return;
    const rowH = Math.max(...rows.map((r) => r.offsetHeight)), last = rows[rows.length - 1];
    const slack = box.clientHeight - (offsetIn(last, box) + last.offsetHeight);
    const per = Math.max(1, rows.length + Math.floor(slack / rowH));
    if (per !== pg.per) { pg.page = Math.floor((pg.page * pg.per) / per); pg.per = per; changed = true; }
  });
  return changed;
}

// ---------- 01 Hẹn giờ: thiết lập ----------
function viewSetup() {
  const d = draft, mode = isCond(d.type) ? 'cond' : d.type;
  const acts = ORDER.map((k) => {
    const ok = capOk(k);
    return `<button class="act ${d.action === k ? 'on' : ''}" data-action="${k}" ${ok ? '' : 'disabled title="Hành động không được hệ thống hỗ trợ"'} title="${S.ACTIONS[k].hint}"><span class="ring-i">${Icons[k]}</span>${S.ACTIONS[k].label}</button>`;
  }).join('');
  let chips = '';
  if (d.type === 'countdown') {
    const tot = d.countdown.h * 60 + d.countdown.m;
    chips = [[15, '15 phút'], [30, '30 phút'], [45, '45 phút'], [60, '1 giờ'], [90, '1 giờ 30'], [120, '2 giờ'], [180, '3 giờ']]
      .map(([v, l]) => `<button class="chip ${tot === v && !d.countdown.s ? 'on' : ''}" data-chip="${v}">${l}</button>`).join('');
  } else if (d.type === 'at') {
    const cur = `${pad(d.at.h)}:${pad(d.at.m)}`;
    chips = ['22:00', '22:30', '23:00', '23:30', '00:00', '00:30', '01:00'].map((v) => `<button class="chip ${cur === v ? 'on' : ''}" data-chip-at="${v}">${v}</button>`).join('');
  }
  return `<section class="view" data-key="v-setup">
    <div class="head"><div><div class="eyebrow" id="greet">${greet()}</div><h1>Thiết lập hẹn giờ</h1></div></div>
    <div class="setup">
      <div class="stage">
        <div class="dial ${isCond(d.type) ? '' : 'drag'}" id="dial" ${dialAttrs()}><svg viewBox="0 0 330 330" id="dial-svg" data-own></svg><div class="center" id="dial-center" data-own></div></div>
        ${chips ? `<div class="chips clip-fit">${chips}</div>` : `<svg id="spark" viewBox="0 0 280 48" style="width:280px;height:48px;overflow:visible" data-own></svg>`}
      </div>
      <div class="side">
        <div id="side-actions"><div class="label">Hành động</div><div class="acts">${acts}</div></div>
        <div id="side-mode"><div class="label">Thời điểm</div>
          <div class="seg wide" data-morph-keep="style"><button class="${mode === 'countdown' ? 'on' : ''}" data-mode="countdown">Thời lượng</button><button class="${mode === 'at' ? 'on' : ''}" data-mode="at">Giờ cụ thể</button><button class="${mode === 'cond' ? 'on' : ''}" data-mode="cond">Điều kiện</button></div></div>
        <div id="side-detail">${mode === 'cond' ? condCard() : `<p class="note">${mode === 'countdown' ? 'Kéo vòng để đặt thời lượng. Dùng con lăn hoặc phím mũi tên để điều chỉnh; giữ Shift để thay đổi theo bước 5 phút.' : 'Kéo vòng để chọn giờ thực hiện. Giờ đã qua sẽ được áp dụng cho ngày hôm sau.'}</p>`}</div>
        ${mode === 'cond' ? '' : quickSoundsHtml()}
      </div>
    </div>
  </section>
  <div class="bar" data-key="bar-setup">
    <div class="summary" id="summary">${summaryHtml()}</div>
    ${savingPreset
      ? `<input id="preset-name" class="inline-input" placeholder="Tên preset" maxlength="40"><button class="btn" data-key="preset-save" data-do="preset-save">Lưu</button><button class="btn ghost" data-key="preset-cancel" data-do="preset-cancel">Huỷ</button>`
      : `<button class="btn ghost" data-key="preset-new" data-do="preset-new">${Icons.bookmark} Lưu làm preset</button>`}
    <button class="btn primary big" data-key="start" data-do="start">${Icons.play} Bắt đầu hẹn giờ</button>
  </div>`;
}

function condCard() {
  const d = draft, c = d[d.type];
  const tabs = CONDS.map(([k, l]) => {
    const dis = k === 'battery' && !st.hasBattery;
    return `<button class="chip ${d.type === k ? 'on' : ''}" data-type="${k}" ${dis ? 'disabled title="Không phát hiện pin" style="opacity:.4"' : ''}>${l}</button>`;
  }).join('');
  let s = '', note = '';
  switch (d.type) {
    case 'idle': s = `Sau <input class="num" data-field="idle.minutes" value="${c.minutes}"> phút không có thao tác chuột hoặc bàn phím`; note = 'Bộ đếm được đặt lại khi phát hiện thao tác.'; break;
    case 'battery': s = `Khi pin dưới <input class="num" data-field="battery.percent" value="${c.percent}">% và thiết bị không kết nối nguồn`; note = 'Điều kiện không được kích hoạt trong lúc sạc.'; break;
    case 'net': s = `Khi lưu lượng mạng dưới <input class="num" data-field="net.kbps" value="${c.kbps}" style="width:4ch"> KB/s trong <input class="num" data-field="net.minutes" value="${c.minutes}"> phút`; note = 'Ngưỡng được đánh giá liên tục trong khoảng thời gian đã chọn.'; break;
    case 'cpu': s = `Khi CPU dưới <input class="num" data-field="cpu.percent" value="${c.percent}">% trong <input class="num" data-field="cpu.minutes" value="${c.minutes}"> phút`; note = 'Mức sử dụng CPU phải duy trì dưới ngưỡng trong toàn bộ khoảng thời gian.'; break;
    case 'process': s = `Khi tiến trình <input class="wide" data-field="process.name" value="${esc(c.name)}" list="procs" placeholder="firefox" spellcheck="false"> kết thúc<datalist id="procs">${procList.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>`; note = 'Nhập tên tiến trình như hiển thị trong System Monitor.'; break;
  }
  return `<div class="card cond"><div class="chips">${tabs}</div><div class="sentence">${s}</div>
    <p class="note">${note ? note + ' ' : ''}Sau khi điều kiện được đáp ứng, hệ thống chờ thêm ${st.settings.graceSeconds} giây trước khi thực hiện hành động.</p></div>`;
}

function summaryHtml() {
  const a = `<b>${S.ACTIONS[draft.action].label}</b>`, t = trigger();
  switch (t.type) {
    case 'countdown': {
      if (!t.seconds) return 'Kéo chấm tròn để chọn thời gian.';
      const end = Date.now() + t.seconds * 1000;
      return `${a} sau <b>${S.human(t.seconds * 1000)}</b> · khoảng ${S.hhmm(end)} ${S.dayWord(end)}`;
    }
    case 'at': { const end = S.atDeadline(t.time); return `${a} lúc <b>${t.time}</b> ${S.dayWord(end)} · còn ${S.human(end - Date.now())}`; }
    default: return `${a} ${esc(S.triggerText(t))}`;
  }
}
function updateSummary() { const el = $('#summary'); morph(el, summaryHtml()); }

// Vòng quay thiết lập
const DC = 165, DR = 138;
// Vòng "Sau bao lâu" / "Đúng giờ" là một núm vặn: khung SVG (vạch, rãnh, cung, núm) chỉ dựng một lần mỗi kiểu,
// sau đó mỗi khung hình (requestAnimationFrame) chỉ đổi thuộc tính `d` của cung và `transform` của núm.
// dv.vis là giá trị đang HIỂN THỊ (phút, số thực): lúc kéo nó bám theo con trỏ liên tục, lúc giá trị đổi từ
// ngoài (chip, ô số, đổi kiểu) nó trượt từ giá trị cũ sang mới. Bản nháp (draft) luôn giữ giá trị đã làm tròn.
const dv = { svg: null, key: '', vis: 0, target: 0, anim: null, raf: 0, drag: null };
const CD_MAX = 23 * 60 + 59, DAY = 1440;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mod = (v, n) => ((v % n) + n) % n;
const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60; };
const dialVal = (d = draft) => (d.type === 'countdown' ? d.countdown.h * 60 + d.countdown.m : d.at.h * 60 + d.at.m);
function setDialVal(v) {
  if (draft.type === 'countdown') draft.countdown = { h: Math.floor(v / 60), m: v % 60, s: 0 };
  else draft.at = { h: Math.floor(v / 60), m: v % 60 };
}
const hm = (v) => { const h = Math.floor(v / 60), m = v % 60; return h && m ? `${h} giờ ${m} phút` : h ? `${h} giờ` : `${m} phút`; };
// Thuộc tính slider cho trình đọc màn hình; dùng cả trong mẫu HTML (viewSetup) lẫn khi kéo (syncDialAria)
function dialAria(d = draft) {
  if (d.type === 'countdown') return { role: 'slider', tabindex: '0', 'aria-label': 'Thời gian chờ', 'aria-valuemin': '0', 'aria-valuemax': String(CD_MAX), 'aria-valuenow': String(dialVal(d)), 'aria-valuetext': hm(dialVal(d)) };
  if (d.type === 'at') return { role: 'slider', tabindex: '0', 'aria-label': 'Giờ hẹn', 'aria-valuemin': '0', 'aria-valuemax': String(DAY - 1), 'aria-valuenow': String(dialVal(d)), 'aria-valuetext': `${d.at.h} giờ ${d.at.m} phút` };
  return {};
}
const dialAttrs = () => Object.entries(dialAria()).map(([k, v]) => `${k}="${esc(v)}"`).join(' ');
function syncDialAria() { const el = $('#dial'); if (el) for (const [k, v] of Object.entries(dialAria())) if (el.getAttribute(k) !== v) el.setAttribute(k, v); }
function syncChips() {
  const cur = draft.type === 'countdown' ? dialVal() : null, at = draft.type === 'at' ? `${pad(draft.at.h)}:${pad(draft.at.m)}` : null;
  document.querySelectorAll('.stage [data-chip]').forEach((c) => c.classList.toggle('on', cur === +c.dataset.chip && !draft.countdown.s));
  document.querySelectorAll('.stage [data-chip-at]').forEach((c) => c.classList.toggle('on', at === c.dataset.chipAt));
}

function dialSkeleton(type) {
  const hand = `<g id="dial-hand">${celestial(0, 0, true, 1, 'handle-g cel-day')}${celestial(0, 0, false, 1, 'handle-g cel-night')}</g>`;
  const arcEl = '<path id="dial-arc" class="arc" fill="none" stroke-width="10" stroke-linecap="round"/>';
  const track = `<circle class="track" cx="${DC}" cy="${DC}" r="${DR}" fill="none" stroke-width="10"/>`;
  if (type === 'countdown') {
    return DEFS + ticks(DC, DR - 20, 60, 5) + track +
      `<circle id="dial-hours" cx="${DC}" cy="${DC}" r="${DR + 14}" fill="none" stroke-width="2" stroke-dasharray="2 6" style="stroke:var(--moon);opacity:.35"/>` + arcEl + hand;
  }
  return DEFS + ticks(DC, DR - 20, 96, 4) + [[0, '0h'], [12, '12h']].map(([v, l]) => { const [x, y] = pt(DC, DR - 42, v / 24); return `<text class="tick-l" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${l}</text>`; }).join('') +
    track + arcEl + `<circle id="dial-now" r="4" style="fill:var(--ink-2)"/>` + hand;
}
const setA = (el, k, v) => { if (el && el.getAttribute(k) !== v) el.setAttribute(k, v); };
// Vẽ một khung hình từ dv.vis: chỉ chạm các thuộc tính thật sự đổi
function paintDial() {
  const svg = dv.svg; if (!svg?.isConnected) return;
  const hand = svg.querySelector('#dial-hand'), arcEl = svg.querySelector('#dial-arc');
  let f0 = 0, f1, hf, day;
  if (dv.key === 'countdown') {
    const v = clamp(dv.vis, 0, CD_MAX);
    let frac = (v % 60) / 60;
    if (v > 0.01 && frac < 1e-4) frac = 1; // đúng tròn giờ: cả vòng
    f1 = v < 0.01 ? 0 : frac; hf = frac % 1;
    setA(svg.querySelector('#dial-hours'), 'display', v >= 60 ? 'inline' : 'none');
    day = isDay(new Date(Date.now() + v * 60000).getHours());
  } else {
    const v = mod(dv.vis, DAY), nm = nowMin();
    f0 = nm / DAY; f1 = v / DAY; if (f1 <= f0) f1 += 1; hf = v / DAY;
    const [nx, ny] = pt(DC, DR, nm / DAY), now = svg.querySelector('#dial-now');
    setA(now, 'cx', nx.toFixed(2)); setA(now, 'cy', ny.toFixed(2));
    day = isDay(Math.floor(v / 60));
  }
  setA(arcEl, 'd', arc(DC, DR, f0, f1));
  const [hx, hy] = pt(DC, DR, hf);
  setA(hand, 'transform', `translate(${hx.toFixed(2)} ${hy.toFixed(2)})`);
  setA(hand.querySelector('.cel-day'), 'display', day ? 'inline' : 'none');
  setA(hand.querySelector('.cel-night'), 'display', day ? 'none' : 'inline');
}
const easeOut = (t) => 1 - (1 - t) ** 3;
function dialFrame(ts) {
  dv.raf = 0;
  const a = dv.anim;
  if (a) {
    const t = clamp((ts - a.t0) / a.dur, 0, 1);
    dv.vis = a.from + (a.to - a.from) * easeOut(t);
    if (t >= 1) { dv.vis = dv.key === 'at' ? mod(a.to, DAY) : a.to; dv.anim = null; } else dv.raf = requestAnimationFrame(dialFrame);
  }
  paintDial();
}
const dialSchedule = () => { if (!dv.raf) dv.raf = requestAnimationFrame(dialFrame); };
// Trượt từ dv.vis tới `to`. Kiểu "Đúng giờ" đi đường ngắn nhất quanh mặt 24 giờ.
function dialAnimate(to, dur = 180) {
  if (dv.key === 'at') to = dv.vis + (mod(to - dv.vis + DAY / 2, DAY) - DAY / 2);
  if (reduceMotion.matches || dur <= 0 || Math.abs(to - dv.vis) < 1e-3) { dv.anim = null; dv.vis = dv.key === 'at' ? mod(to, DAY) : to; paintDial(); return; }
  dv.anim = { from: dv.vis, to, t0: performance.now(), dur };
  dialSchedule();
}
function dialCenter() {
  const d = draft;
  if (d.type === 'countdown') {
    const { h, m } = d.countdown, tot = h * 60 + m, end = Date.now() + tot * 60000;
    return `<div class="time-in v"><div class="tu"><input class="num" data-dial="countdown.h" data-max="23" value="${h}" maxlength="2" inputmode="numeric" aria-label="Giờ"><span>giờ</span></div>
      <span class="sep">:</span><div class="tu"><input class="num" data-dial="countdown.m" data-max="59" value="${pad(m)}" maxlength="2" inputmode="numeric" aria-label="Phút"><span>phút</span></div></div>
      <div class="sub" id="dial-sub">${tot ? `${S.ACTIONS[d.action].label.toLowerCase()} lúc ${S.hhmm(end)} ${S.dayWord(end)}` : 'Chưa đặt thời gian'}</div>`;
  }
  const end = S.atDeadline(trigger().time);
  return `<div class="time-in v"><input class="num" data-dial="at.h" data-max="23" value="${pad(d.at.h)}" maxlength="2" inputmode="numeric" aria-label="Giờ"><span class="sep">:</span>
    <input class="num" data-dial="at.m" data-max="59" value="${pad(d.at.m)}" maxlength="2" inputmode="numeric" aria-label="Phút"></div>
    <div class="sub" id="dial-sub">${S.dayWord(end)}, còn ${S.human(end - Date.now())}</div>`;
}
// dur: thời gian trượt khi giá trị đổi (0 = nhảy ngay)
function renderDial({ dur = 180 } = {}) {
  const svg = $('#dial-svg'), center = $('#dial-center'); if (!svg) return;
  const d = draft, s = snap?.sensors || {};
  if (d.type === 'countdown' || d.type === 'at') {
    const target = dialVal();
    if (svg !== dv.svg || svg.dataset.k !== d.type) {
      // Kiểu mới (hoặc vừa quay lại màn này): dựng khung, cung mọc lên từ 0 / từ "bây giờ"
      morph(svg, dialSkeleton(d.type));
      svg.dataset.k = d.type; dv.svg = svg; dv.key = d.type; dv.anim = null; dv.drag = null;
      dv.vis = d.type === 'at' ? nowMin() : 0;
      dv.target = target;
      document.documentElement.classList.remove('dragging-dial');
      const from = dv.vis, to = d.type === 'at' ? from + mod(target - from, DAY) : target; // "Đúng giờ" luôn quét xuôi từ bây giờ
      if (reduceMotion.matches) dv.vis = d.type === 'at' ? mod(to, DAY) : to;
      else { dv.anim = { from, to, t0: performance.now(), dur: 260 }; dialSchedule(); }
    } else if (!dv.drag && target !== dv.target) { dv.target = target; dialAnimate(target, dur); }
    paintDial();
    morph(center, dialCenter());
    syncDialAria();
    return;
  }
  dv.svg = null; svg.dataset.k = 'cond';
  let body = '', cHtml = '';
  const c = d[d.type]; let v = 0, th = null, val = '—', sub = '', cap = '';
  switch (d.type) {
    case 'idle': cap = 'Thời gian không hoạt động'; v = s.idle == null ? 0 : Math.min(1, s.idle / (c.minutes * 60)); val = s.idle == null ? '—' : S.clock(s.idle * 1000); sub = `ngưỡng ${c.minutes} phút`; break;
    case 'battery': cap = 'Mức pin'; v = s.battery ? s.battery.percent / 100 : 0; th = c.percent / 100; val = s.battery ? `${s.battery.percent}%` : '—'; sub = s.battery ? (s.battery.charging ? 'đang kết nối nguồn' : 'đang sử dụng pin') : 'không có dữ liệu pin'; break;
    case 'net': { cap = 'Lưu lượng mạng'; const top = Math.max(c.kbps * 4, ...spark.net, 1); v = Math.min(1, (s.net || 0) / top); th = c.kbps / top; val = S.kb(s.net); sub = `ngưỡng dưới ${c.kbps} KB/s`; break; }
    case 'cpu': cap = 'Mức sử dụng CPU'; v = (s.cpu || 0) / 100; th = c.percent / 100; val = s.cpu == null ? '—' : `${Math.round(s.cpu)}%`; sub = `ngưỡng dưới ${c.percent}%`; break;
    case 'process': cap = 'Tiến trình'; v = procRunning ? 1 : 0; val = !c.name.trim() ? '—' : procRunning == null ? '…' : procRunning ? 'Đang chạy' : 'Không hoạt động'; sub = c.name.trim() ? `"${c.name.trim()}"` : 'chưa chọn tiến trình'; break;
  }
  const g0 = 0.625, span = 0.75;
  body = `<path d="${arc(DC, DR, g0, g0 + span)}" fill="none" stroke-width="10" stroke-linecap="round" class="track"/>` +
    `<path class="arc" d="${arc(DC, DR, g0, g0 + span * Math.max(0.002, v))}" fill="none" stroke-width="10" stroke-linecap="round"/>`;
  if (th != null) { const [x0, y0] = pt(DC, DR - 10, g0 + span * th), [x1, y1] = pt(DC, DR + 10, g0 + span * th); body += `<line class="th" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>`; }
  cHtml = `<div class="cap">${cap}</div><div class="live num${val.length > 7 ? ' long' : ''}">${esc(val)}</div><div class="sub">${esc(sub)}</div>`;
  const sp = $('#spark');
  if (sp) {
    const data = d.type === 'net' ? spark.net : d.type === 'cpu' ? spark.cpu : [];
    if (data.length > 1) {
      const top = d.type === 'cpu' ? 100 : Math.max(c.kbps * 4, ...data, 1), thr = d.type === 'cpu' ? c.percent : c.kbps;
      const pts = data.map((y, i) => `${(i / 59) * 280},${46 - (y / top) * 42}`).join(' ');
      const ty = 46 - (thr / top) * 42;
      morph(sp, `${DEFS}<line x1="0" x2="280" y1="${ty}" y2="${ty}" class="th" style="stroke-width:1;stroke-dasharray:3 4"/><polyline points="${pts}" fill="none" stroke="url(#gMoon)" stroke-width="2" stroke-linejoin="round"/>`);
    } else morph(sp, '');
  }
  morph(svg, DEFS + body);
  morph(center, cHtml);
}

// Kéo núm: nắm ở rãnh thì núm nhảy tới chỗ con trỏ rồi bám theo; nắm ở mặt (kể cả trên các con số) thì
// sau khi con trỏ đi quá vài px mới tính là kéo và vòng xoay theo độ lệch góc như vặn một núm thật.
// Ấn một cái lên con số (không kéo) vẫn đặt con trỏ vào ô để gõ.
// U là góc tích luỹ tính bằng vòng: Sau bao lâu thì 1 vòng = 60 phút, qua đỉnh là sang giờ kế; Đúng giờ thì 1 vòng = 24 giờ.
const RING = 0.62, DRAG_SLOP = 3;
function dialStep(shift) { return dv.key === 'countdown' ? (shift ? 5 : 1) : 5; }
function dragApply() {
  const g = dv.drag;
  let raw;
  if (dv.key === 'countdown') {
    // Lùi quá 0 thì dừng ở 0 (không quay vòng); dư tối đa một vòng để núm vẫn khớp con trỏ khi kéo trở lại
    if (g.U < -1) g.U += 1; if (g.U > 25) g.U -= 1;
    raw = clamp(g.U * 60, 0, CD_MAX);
  } else raw = mod(g.U * DAY, DAY);
  dv.vis = raw;
  const st5 = dialStep(g.shift);
  const v = dv.key === 'countdown' ? clamp(Math.round(raw / st5) * st5, 0, CD_MAX) : mod(Math.round(raw / st5) * st5, DAY);
  if (v !== dialVal()) {
    setDialVal(v); dv.target = v; saveDraft();
    morph($('#dial-center'), dialCenter()); updateSummary(); syncChips(); syncDialAria();
  }
  dialSchedule();
}
function bindDial() {
  // #dial được giữ qua các lần vẽ lại nên chỉ gắn sự kiện một lần
  const dial = $('#dial'); if (!dial || dial._bound) return;
  dial._bound = true;
  const geo = (e) => { const r = dial.getBoundingClientRect(); const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2; return { f: (Math.atan2(x, -y) / TAU + 1) % 1, dist: Math.hypot(x, y) / (r.width / 2) }; };
  const active = () => dial.classList.contains('drag') && (draft.type === 'countdown' || draft.type === 'at') && dv.svg;
  let pend = null; // nhấn ở mặt vòng, chưa đủ xa để tính là kéo
  const begin = (e, g, absolute) => {
    let U;
    const v = dv.vis; dv.anim = null;
    if (dv.key === 'countdown') {
      // Nắm ở rãnh: chọn số giờ sao cho giá trị mới gần giá trị cũ nhất
      if (absolute) { U = g.f + Math.round(v / 60 - g.f); if (U < -0.02) U += 1; } else U = v / 60; // sát bên trái đỉnh khi < 1 giờ: hiểu là 0
    } else U = absolute ? g.f : v / DAY;
    dv.drag = { id: e.pointerId, last: g.f, U, shift: e.shiftKey };
    document.documentElement.classList.add('dragging-dial');
    dragApply();
  };
  const finish = () => {
    if (!dv.drag) return;
    dv.drag = null;
    document.documentElement.classList.remove('dragging-dial');
    dialAnimate(dv.target, 100); // thả tay: núm trượt nhẹ về đúng vạch đang hiện
  };
  dial.addEventListener('pointerdown', (e) => {
    if (!active() || e.button !== 0 || dv.drag) return;
    const g = geo(e); if (g.dist > 1.15) return;
    const input = e.target.closest('input');
    if (!input && g.dist >= RING) { e.preventDefault(); dial.focus({ preventScroll: true }); dial.setPointerCapture(e.pointerId); begin(e, g, true); return; }
    pend = { id: e.pointerId, x: e.clientX, y: e.clientY, input };
    if (!input) dial.setPointerCapture(e.pointerId);
  });
  dial.addEventListener('pointermove', (e) => {
    if (pend && e.pointerId === pend.id) {
      if (Math.hypot(e.clientX - pend.x, e.clientY - pend.y) < DRAG_SLOP) return;
      const { input, x, y } = pend; pend = null;
      if (input) { input.blur(); getSelection()?.removeAllRanges(); }
      if (!dial.hasPointerCapture(e.pointerId)) dial.setPointerCapture(e.pointerId);
      dial.focus({ preventScroll: true });
      begin(e, geo({ clientX: x, clientY: y }), false);
    }
    const g0 = dv.drag; if (!g0 || e.pointerId !== g0.id) return;
    e.preventDefault();
    const g = geo(e); g0.shift = e.shiftKey;
    if (g.dist < 0.08) return; // sát tâm thì góc nhảy loạn: bỏ qua
    let df = g.f - g0.last; if (df > 0.5) df -= 1; else if (df < -0.5) df += 1;
    g0.last = g.f; g0.U += df;
    dragApply();
  });
  const end = (e) => { if (pend && e.pointerId === pend.id) pend = null; if (dv.drag && e.pointerId === dv.drag.id) finish(); };
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) dial.addEventListener(t, end);

  // Lăn chuột / phím mũi tên trên vòng (trên từng ô số thì vẫn chỉnh riêng ô đó, xem stepDial)
  const nudge = (dir, step, dur) => {
    // Ô số đang gõ dở trên mặt vòng: chốt nó trước (focusout ghi vào bản nháp) để không hiện số cũ
    const typing = dial.querySelector('input:focus'); if (typing) { typing.blur(); dial.focus({ preventScroll: true }); }
    const cur = dialVal();
    let v = step * (dir > 0 ? Math.floor(cur / step) + 1 : Math.ceil(cur / step) - 1); // bám lưới bước
    v = dv.key === 'countdown' ? clamp(v, 0, CD_MAX) : mod(v, DAY);
    if (v === cur) return;
    setDialVal(v); saveDraft(); dialChanged({ dur });
  };
  let wheelAcc = 0;
  dial.addEventListener('wheel', (e) => {
    if (!active() || e.target.closest('[data-dial]')) return;
    e.preventDefault();
    wheelAcc += (e.deltaY || e.deltaX) * (e.deltaMode === 1 ? 33 : 1);
    if (Math.abs(wheelAcc) < 40) return;
    const dir = wheelAcc < 0 ? 1 : -1; wheelAcc = 0;
    nudge(dir, dialStep(e.shiftKey), 90);
  }, { passive: false });
  dial.addEventListener('keydown', (e) => {
    if (e.target !== dial || !active()) return;
    const big = 60, k = e.key;
    let dir = 0, step = dialStep(e.shiftKey);
    if (k === 'ArrowUp' || k === 'ArrowRight') dir = 1;
    else if (k === 'ArrowDown' || k === 'ArrowLeft') dir = -1;
    else if (k === 'PageUp') { dir = 1; step = big; } else if (k === 'PageDown') { dir = -1; step = big; }
    else if ((k === 'Home' || k === 'End') && dv.key === 'countdown') { e.preventDefault(); setDialVal(k === 'Home' ? 0 : CD_MAX); saveDraft(); dialChanged(); return; }
    if (!dir) return;
    e.preventDefault(); nudge(dir, step, 90);
  });
}

// ---------- 01 Hẹn giờ: đang chạy ----------
function watchValue(j) {
  const s = snap?.sensors || {}, t = j.trigger;
  switch (t.type) {
    case 'idle': return { main: S.clock((s.idle || 0) * 1000), sub: `/ ${t.minutes}p`, p: Math.min(1, (s.idle || 0) / (t.minutes * 60)) };
    case 'battery': return { main: s.battery ? `${s.battery.percent}%` : '—', sub: `/ ${t.percent}%`, p: s.battery ? s.battery.percent / 100 : 0 };
    case 'net': return { main: S.kb(s.net), sub: '', p: j.need ? j.satisfiedMs / j.need : 0 };
    case 'cpu': return { main: s.cpu == null ? '—' : `${Math.round(s.cpu)}%`, sub: '', p: j.need ? j.satisfiedMs / j.need : 0 };
    case 'process': return { main: t.name, sub: '', p: 0 };
  }
  return { main: '—', sub: '', p: 0 };
}
function viewRunning() {
  const j = snap.job;
  const a = S.ACTIONS[j.action].label;
  return `<section class="view running" data-key="v-running">
    <div class="eyebrow rise">${greet()}</div>
    <button class="awake-pill ${st.settings.keepAwake ? 'on' : ''}" data-set="keepAwake" data-val="${!st.settings.keepAwake}" title="${st.settings.keepAwake ? 'Màn hình và hệ thống được duy trì ở trạng thái hoạt động' : 'Cho phép màn hình tắt theo cài đặt hệ thống'}">
      ${Icons.moon}<span>${st.settings.keepAwake ? 'Đang giữ hệ thống hoạt động' : 'Giữ hệ thống hoạt động'}</span>
    </button>
    <div class="orb rise d1" id="orb" data-morph-keep="class"><svg viewBox="0 0 400 400" id="orb-svg" data-own></svg>
      <div class="center"><div class="icon">${Icons[j.action]}</div><div class="big num" id="big" data-own></div>
        <div class="what" id="what" data-own></div><div class="src">${esc(sourceLabel(j.source))}</div></div></div>
    <div class="status-line" id="status-line" data-own></div>
    <div class="controls rise d2" id="controls">${j.phase === 'countdown' ? `<div class="bgroup"><span>Hoãn</span><button data-post="5">5 phút</button><button data-post="15">15 phút</button><button data-post="60">1 giờ</button></div>` : ''}<button class="btn ghost" data-key="now" data-do="now">Thực hiện ngay</button><button class="btn danger" data-key="cancel" data-do="cancel">Huỷ hẹn</button></div>
    ${st.settings.dryRun ? '<div class="dry">Chế độ thử: chỉ hiển thị cảnh báo, không thực hiện hành động</div>' : ''}
  </section>`;
}

const runDial = { svg: null, orb: null, deadline: 0, total: 0, raf: 0 };
function runningDialSkeleton() {
  return DEFS + ticks(200, 188, 60, 5, 4) +
    '<circle cx="200" cy="200" r="168" fill="none" stroke-width="10" class="track"/>' +
    '<path id="run-arc" fill="none" stroke-width="10" stroke-linecap="round" style="filter:drop-shadow(0 0 8px var(--halo))"/>' +
    `<g id="run-hand" class="cel-run">${celestial(0, 0, true, 0.95, 'run-day')}${celestial(0, 0, false, 0.95, 'run-night')}</g>`;
}
function paintRunningDial() {
  runDial.raf = 0;
  const svg = runDial.svg;
  if (!svg?.isConnected || !runDial.orb?.isConnected || !runDial.deadline || !runDial.total) return;
  const remaining = Math.max(0, runDial.deadline - Date.now());
  const progress = Math.max(0, Math.min(1, remaining / runDial.total));
  const hot = remaining <= 60_000;
  const final = remaining <= 10_000;
  runDial.orb.classList.toggle('hot', hot && !final);
  runDial.orb.classList.toggle('final', final);
  const arcEl = svg.querySelector('#run-arc');
  setA(arcEl, 'd', arc(200, 168, 0, progress));
  setA(arcEl, 'stroke', `url(#${hot ? 'gHot' : 'gMoon'})`);
  const hand = svg.querySelector('#run-hand');
  const [x, y] = pt(200, 168, progress);
  setA(hand, 'transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
  setA(hand, 'display', progress > 0.002 ? 'inline' : 'none');
  const day = isDay(new Date(runDial.deadline).getHours());
  setA(hand?.querySelector('.run-day'), 'display', day ? 'inline' : 'none');
  setA(hand?.querySelector('.run-night'), 'display', day ? 'none' : 'inline');
  if (remaining > 0) runDial.raf = requestAnimationFrame(paintRunningDial);
}
function syncRunningDial(svg, orb, job) {
  if (runDial.svg !== svg) {
    if (runDial.raf) cancelAnimationFrame(runDial.raf);
    morph(svg, runningDialSkeleton());
    runDial.svg = svg;
    runDial.raf = 0;
  }
  runDial.orb = orb;
  runDial.deadline = job.deadline;
  runDial.total = job.totalMs;
  if (!runDial.raf) runDial.raf = requestAnimationFrame(paintRunningDial);
}

function updateRunning() {
  const j = snap?.job, svg = $('#orb-svg'); if (!j || !svg) return;
  const orb = $('#orb'), big = $('#big'), what = $('#what'), line = $('#status-line');
  const C = 200, R = 168, a = S.ACTIONS[j.action].label;
  if (j.phase === 'countdown') {
    syncRunningDial(svg, orb, j);
    if (big.dataset.mode !== 'c') { big.innerHTML = ''; big.dataset.t = ''; big.dataset.mode = 'c'; big.classList.remove('long'); }
    roll(big, S.clock(j.remaining));
    morph(what, j.fromCondition ? `<b>${esc(a)}</b> · điều kiện đã được đáp ứng` : `<b>${esc(a)}</b> lúc ${S.hhmm(j.deadline)} ${S.dayWord(j.deadline)}`);
    line.textContent = `Còn ${S.human(j.remaining)}`;
  } else {
    orb.classList.remove('hot', 'final');
    const w = watchValue(j), p = Math.max(0, Math.min(1, w.p));
    // morph giữ <g class="orbit"> nên vòng quay chậm không bị giật về đầu mỗi giây
    morph(svg, DEFS + `<g class="orbit"><circle cx="${C}" cy="${C}" r="188" fill="none" stroke-width="1.5" style="stroke:var(--line-2)" stroke-dasharray="2 10"/><circle cx="${C}" cy="12" r="4" style="fill:var(--moon);filter:drop-shadow(0 0 6px var(--moon))"/></g>` +
      `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke-width="10" class="track"/>` +
      `<path d="${arc(C, R, 0, p)}" fill="none" stroke-width="10" stroke-linecap="round" stroke="url(#gMoon)"/>`);
    big.dataset.mode = 'w'; big.dataset.t = '';
    morph(big, `${esc(w.main)}${w.sub ? `<small>${esc(w.sub)}</small>` : ''}`);
    big.classList.toggle('long', w.main.length > 8);
    morph(what, `<b>${esc(a)}</b> ${esc(S.triggerText(j.trigger))}`);
    const t = j.trigger;
    line.textContent = (t.type === 'net' || t.type === 'cpu') ? (j.satisfiedMs ? `Đã duy trì ${S.clock(j.satisfiedMs)} / ${S.clock(j.need)}; thời gian chờ bổ sung ${st.settings.graceSeconds} giây` : (t.type === 'net' ? 'Đang theo dõi lưu lượng mạng' : 'Đang theo dõi mức sử dụng CPU'))
      : t.type === 'process' ? 'Đang chờ tiến trình kết thúc' : t.type === 'battery' ? (snap.sensors.battery?.charging ? 'Thiết bị đang kết nối nguồn' : 'Thiết bị đang sử dụng pin') : 'Bộ đếm đặt lại khi phát hiện thao tác';
  }
}

// ---------- Âm thanh nền (2-pane layout, không blur/pill, đồng nhất kích thước, 60 FPS) ----------
const FADES = [0, 5, 10, 20, 30];
const SND_TABS = [
  ['sounds', 'Âm thanh'],
  ['mixes', 'Bộ mix'],
  ['playlist', 'Playlist'],
  ['youtube', 'YouTube'],
];
const SND_FILTERS = [
  ['all', 'Tất cả'],
  ['rain', 'Mưa'],
  ['nature', 'Thiên nhiên'],
  ['animals', 'Đêm'],
  ['noise', 'Ồn & Não'],
  ['places', 'Không gian'],
];
const PRIORITY_IDS = ['rain', 'thunder', 'wind', 'crickets', 'lofi', 'brown'];
let sndTab = 'sounds';
let sndFilter = 'all';
let sndPage = 0;
let mixPage = 0;
let playlistFilter = 'all';
let playlistPage = 0;
let focusedSnd = 'rain';
let savingMix = false;
let ytStatus = 'closed';

const sndPerPage = () => (window.innerHeight <= 620 ? 5 : 6);

function paginateSlice(items, page, per) {
  const count = Math.max(1, Math.ceil(items.length / per));
  const safe = Math.max(0, Math.min(page, count - 1));
  return { rows: items.slice(safe * per, (safe + 1) * per), page: safe, count, start: safe * per };
}

function pagerHtml(attr, pg, label) {
  return `<div class="pl-foot">
    <span class="num">${label}</span>
    ${pg.count > 1 ? `<div class="pager"><button class="icon-btn" ${attr}="-1" ${pg.page ? '' : 'disabled'} title="Trang trước">${Icons.chevL}</button>
      <span class="num">${pg.page + 1}/${pg.count}</span>
      <button class="icon-btn" ${attr}="1" ${pg.page < pg.count - 1 ? '' : 'disabled'} title="Trang sau">${Icons.chevR}</button></div>` : ''}
  </div>`;
}

function quickSoundsHtml() {
  const A = Ambient;
  const presets = A.presets.slice(0, 3).map((p) => {
    const on = A.activePresetId === p.id && A.playing;
    return `<button class="chip ${on ? 'on' : ''}" data-apreset="${p.id}">${esc(p.name)}</button>`;
  }).join('');
  return `<div id="side-sounds" class="quick-snd">
    <div class="label">Âm thanh đi ngủ</div>
    <div class="chips">
      <button class="chip ${A.playing ? 'on' : ''}" data-do="snd-play">${A.playing ? 'Tạm dừng' : 'Phát nhạc'}</button>
      ${presets}
      <button class="chip" data-view="sounds">Tất cả</button>
    </div>
  </div>`;
}

function soundsPaneHtml(A, song) {
  const ordered = [...A.channels].sort((a, b) => {
    const ia = PRIORITY_IDS.indexOf(a.id), ib = PRIORITY_IDS.indexOf(b.id);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const list = sndFilter === 'all' ? ordered : ordered.filter((c) => c.category === sndFilter);
  const pg = paginateSlice(list, sndPage, sndPerPage());
  sndPage = pg.page;

  const filtersHtml = SND_FILTERS.map(([id, label]) =>
    `<button class="sub-tab ${sndFilter === id ? 'on' : ''}" data-sfilter="${id}">${label}</button>`
  ).join('');

  const rows = pg.rows.map((x) => {
    const on = x.active, lit = on && A.playing, loading = A.playing && x.loading, v = Math.round(x.volume * 100);
    const sub = loading ? 'Đang tải…' : x.id === 'lofi' && song && on ? esc(song.title) : x.desc;
    const ico = Icons[x.id] || Icons[x.category] || Icons.sound;
    return `<div class="snd-row ${on ? 'on' : ''} ${lit ? 'lit' : ''} ${loading ? 'loading' : ''}" data-key="snd-${x.id}">
      <button class="snd-row-btn" data-snd="${x.id}" aria-pressed="${on}" title="${on ? 'Tắt' : 'Bật'} ${esc(x.name)}">
        <span class="snd-thumb" style="--art:url('../img/${x.art || x.id}.jpg')">${ico}</span>
        <span class="snd-meta"><b>${esc(x.name)}</b><small>${sub}</small></span>
      </button>
      <button class="icon-btn snd-swell ${x.swell ? 'on' : ''}" data-swell="${x.id}" title="Dao động âm lượng (Swell)">${Icons.wave}</button>
      <input type="range" class="vol snd-vol" data-vol="${x.id}" min="0" max="100" value="${v}" style="--v:${v}%" aria-label="Âm lượng ${esc(x.name)}">
    </div>`;
  }).join('');

  return `<div class="snd-subbar">${filtersHtml}</div>
    <div class="snd-list">${rows}</div>
    ${pagerHtml('data-snd-page', pg, `${list.length} kênh`)}`;
}

function mixesPaneHtml(A) {
  const nameOf = (id) => A.channels.find((c) => c.id === id)?.name || id;
  const customMixes = (st && st.mixPresets) || [];
  const all = [
    ...A.presets.map((p) => ({ ...p, custom: false })),
    ...customMixes.map((m) => ({ ...m, custom: true })),
  ];
  const pg = paginateSlice(all, mixPage, sndPerPage());
  mixPage = pg.page;

  const rows = pg.rows.map((m, idx) => {
    const on = A.activePresetId === m.id;
    const desc = m.channels.map(([id]) => nameOf(id)).join(' · ');
    return `<div class="mix-row ${on ? 'on' : ''} ${on && A.playing ? 'lit' : ''}">
      <button class="mix-row-btn" ${m.custom ? `data-cmix="${m.id}"` : `data-apreset="${m.id}"`}>
        <span class="pl-num num">${on && A.playing ? '▶' : m.custom ? '★' : pg.start + idx + 1}</span>
        <span class="pl-meta"><b>${esc(m.name)}</b><small>${esc(desc)}</small></span>
      </button>
      ${m.custom ? `<button class="cmix-del" data-del-cmix="${m.id}" title="Xoá bộ mix">×</button>` : ''}
    </div>`;
  }).join('');

  const saveCtl = savingMix
    ? `<span class="mix-save"><input id="mix-name" class="inline-input mix-in" placeholder="Tên bộ mix" maxlength="28"><button class="snd-preset on" data-do="mix-save">Lưu</button><button class="snd-preset" data-do="mix-cancel">Huỷ</button></span>`
    : `<button class="snd-preset on" data-do="mix-new" title="Lưu các âm thanh đang bật thành bộ mix mới">+ Lưu mix hiện tại</button>`;

  return `<div class="snd-subbar">${saveCtl}</div>
    <div class="snd-list">${rows}</div>
    ${pagerHtml('data-mix-page', pg, `${all.length} bộ mix`)}`;
}

function playlistPaneHtml(A, song) {
  const all = A.lofiTracks;
  const list = playlistFilter === 'custom' ? all.filter((t) => t.custom) : all;
  const pg = paginateSlice(list, playlistPage, sndPerPage());
  playlistPage = pg.page;
  const lofiOn = A.channels.some((c) => c.id === 'lofi' && c.active);

  const rows = pg.rows.map((t, idx) => {
    const current = song && song.id === t.id;
    const playingNow = current && lofiOn && A.playing;
    return `<div class="pl-row ${current ? 'on' : ''} ${playingNow ? 'lit' : ''}" data-key="pl-${esc(t.id)}">
      <button class="pl-row-btn" data-track="${esc(t.id)}">
        <span class="pl-num num">${playingNow ? '▶' : pg.start + idx + 1}</span>
        <span class="pl-meta"><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></span>
      </button>
      ${t.custom ? `<button class="cmix-del" data-del-track="${esc(t.id)}" title="Gỡ bài khỏi danh sách">×</button>` : ''}
    </div>`;
  }).join('');

  return `<div class="snd-subbar pl-actions">
      <div class="pl-filter">
        <button class="sub-tab ${playlistFilter === 'all' ? 'on' : ''}" data-pl-filter="all">Tất cả (${all.length})</button>
        <button class="sub-tab ${playlistFilter === 'custom' ? 'on' : ''}" data-pl-filter="custom">Nhạc của bạn</button>
      </div>
      <div class="pl-add">
        <button class="sub-tab" data-do="snd-files" title="Chọn các tệp nhạc (.mp3/.ogg/.wav)">+ Thêm bài</button>
        <button class="sub-tab" data-do="snd-folder" title="Thêm cả thư mục nhạc">+ Thư mục</button>
      </div>
    </div>
    <div class="snd-list">${rows || '<div class="empty">Chưa có bài nhạc nào. Bấm "+ Thêm bài" hoặc "+ Thư mục" để nạp nhạc của bạn.</div>'}</div>
    ${pagerHtml('data-pl-page', pg, `${list.length} bài`)}`;
}

function youtubePaneHtml() {
  const statusTxt = ytStatus === 'visible'
    ? 'Cửa sổ YouTube đang mở — bạn có thể đăng nhập và chọn playlist trực tiếp.'
    : ytStatus === 'hidden'
      ? 'Đang phát nền (đã ẩn cửa sổ) — có thể trộn cùng tiếng mưa, gió, dế bên cạnh.'
      : 'Chưa mở — mở YouTube hoặc YouTube Music để tự đăng nhập và phát nhạc nền.';

  return `<div class="yt-pane">
    <div class="yt-status"><i class="yt-dot ${ytStatus}"></i><span>${statusTxt}</span></div>
    <div class="yt-actions">
      <button class="btn primary" data-yt="music">${Icons.lofi} Mở YouTube Music</button>
      <button class="btn" data-yt="youtube">${Icons.play} Mở YouTube</button>
      <button class="btn ghost" data-yt="hide" ${ytStatus === 'visible' ? '' : 'disabled'}>Ẩn cửa sổ (chỉ nghe tiếng)</button>
      <button class="btn ghost" data-yt="close" ${ytStatus === 'closed' ? 'disabled' : ''}>Dừng &amp; đóng YouTube</button>
    </div>
    <p class="note">Mẹo: Khi bấm nút đóng (×) trên cửa sổ YouTube, cửa sổ sẽ tự ẩn để giữ âm thanh chạy nền. Để tắt hẳn tiếng YouTube, bấm "Dừng &amp; đóng YouTube".</p>
  </div>`;
}

function viewSounds() {
  const A = Ambient, song = A.song(), activeChannels = A.channels.filter((c) => c.active);
  const activeCount = activeChannels.length;
  const stageChannel = A.channels.find((c) => c.id === focusedSnd && c.active)
    || A.channels.find((c) => c.id === focusedSnd)
    || activeChannels[0]
    || A.channels[0]
    || { id: 'rain', name: 'Mưa nhẹ', desc: 'Hạt mưa rơi đều bên hiên', category: 'rain', art: 'rain', volume: 0.75, pan: 0, swell: false };

  const status = A.error ? `<span class="err">${esc(A.error)}</span>`
    : A.stoppedByTimer ? 'Đã tắt theo hẹn giờ'
      : A.playing ? (A.fading ? `Tắt dần · ${Math.round(A.fadeLevel * 100)}%` : `Đang phát · ${activeCount} kênh`)
        : activeCount ? `Tạm dừng · ${activeCount} kênh` : 'Sẵn sàng';

  const tabsHtml = SND_TABS.map(([id, label]) =>
    `<button class="snd-tab ${sndTab === id ? 'on' : ''}" data-stab-snd="${id}">${label}</button>`
  ).join('');

  let leftBody = '';
  if (sndTab === 'mixes') leftBody = mixesPaneHtml(A);
  else if (sndTab === 'playlist') leftBody = playlistPaneHtml(A, song);
  else if (sndTab === 'youtube') leftBody = youtubePaneHtml();
  else leftBody = soundsPaneHtml(A, song);

  const mv = Math.round(A.master * 100);
  const stageIco = Icons[stageChannel.id] || Icons[stageChannel.category] || Icons.sound;
  const stageTitle = stageChannel.id === 'lofi' && song ? song.title : stageChannel.name;
  const stageSub = stageChannel.id === 'lofi' && song ? `${song.artist} · Nhạc Lo-Fi` : stageChannel.desc;
  const fadeLabel = A.fade ? `Tắt dần ${A.fade}p cuối` : 'Không tắt dần';
  const panPct = Math.round((stageChannel.pan || 0) * 100);
  const panLabel = panPct === 0 ? 'Giữa' : panPct < 0 ? `Trái ${Math.abs(panPct)}%` : `Phải ${panPct}%`;
  const seekPct = Math.round(A.lofiProgress * 100);

  const subCtl = stageChannel.id === 'lofi'
    ? `<div class="stage-subctl">
        <input type="range" class="vol" data-seek min="0" max="100" value="${seekPct}" style="--v:${seekPct}%" aria-label="Tua bài nhạc">
        <div class="stage-vol-meta num"><span>Tua bài</span><span>${seekPct}%</span></div>
      </div>`
    : `<div class="stage-subctl">
        <input type="range" class="vol pan-slider" data-pan="${stageChannel.id}" min="-100" max="100" value="${panPct}" style="--v:${(panPct + 100) / 2}%" aria-label="Cân bằng Trái/Phải">
        <div class="stage-vol-meta num"><span>Không gian: ${panLabel}</span><button class="stage-fade-btn ${stageChannel.swell ? 'on' : ''}" data-swell="${stageChannel.id}">Swell ${stageChannel.swell ? 'Bật' : 'Tắt'}</button></div>
      </div>`;

  return `<section class="view sounds" data-key="v-sounds">
    <div class="snd-topbar">
      <div class="snd-tabs">${tabsHtml}</div>
      <div class="snd-tools">
        <button class="snd-tool" data-do="snd-shuffle" title="Trộn ngẫu nhiên 3 âm thanh">${Icons.shuffle}<span>Trộn</span></button>
        <button class="snd-tool" data-do="snd-clear" title="Tắt hết âm thanh">${Icons.trash}<span>Tắt hết</span></button>
        <span class="snd-count num">${status}</span>
      </div>
    </div>
    <div class="snd-split">
      <div class="snd-list-pane">${leftBody}</div>
      <div class="snd-stage">
        <div class="stage-art ${A.playing && activeCount ? 'lit' : ''}" style="--art:url('../img/${stageChannel.art || stageChannel.id}.jpg')">
          <span class="stage-ico">${stageIco}</span>
        </div>
        <div class="stage-info">
          <b>${esc(stageTitle)}</b>
          <p>${esc(stageSub)}</p>
        </div>
        ${subCtl}
        <div class="stage-vol">
          <input type="range" class="vol" data-master min="0" max="100" value="${mv}" style="--v:${mv}%" aria-label="Âm lượng chung">
          <div class="stage-vol-meta num"><span>Âm lượng ${mv}%</span><button class="stage-fade-btn" data-fade-cycle title="Tự động giảm dần âm lượng trước khi hẹn giờ tắt máy/ngủ kết thúc">${fadeLabel}</button></div>
        </div>
        <div class="stage-ctl">
          <button class="icon-btn" data-fade-cycle title="Đổi thời gian tắt dần khi hẹn giờ (${fadeLabel})">${Icons.repeat}</button>
          <button class="icon-btn" data-do="snd-prev" title="Bài trước">${Icons.prev}</button>
          <button class="stage-play ${A.playing ? 'lit' : ''}" data-key="snd-play" data-do="snd-play" aria-label="${A.playing ? 'Tạm dừng' : 'Phát'}">${A.playing ? Icons.pause : Icons.play}</button>
          <button class="icon-btn" data-key="skip" data-do="snd-skip" title="Bài tiếp theo">${Icons.skip}</button>
          <button class="icon-btn" data-do="snd-shuffle" title="Trộn ngẫu nhiên">${Icons.shuffle}</button>
        </div>
      </div>
    </div>
  </section>`;
}

// ---------- 02 Preset ----------
function viewPresets() {
  const pg = paged('presets', st.presets);
  const rows = pg.rows.map((p, i) => `
    <div class="item" data-row data-key="p-${p.id}" style="animation-delay:${i * 40}ms">
      <div class="ico">${Icons[p.action]}</div>
      <div>${renaming === p.id
        ? `<div class="pname"><input data-rename-input="${p.id}" value="${esc(p.name)}" maxlength="40"></div>`
        : `<div class="pname" data-rename="${p.id}" title="Nhấp đúp để đổi tên">${esc(p.name)}</div>`}
        <div class="pdesc">${esc(S.describe(p.action, p.trigger))}</div></div>
      <span class="tag">${S.TRIGGERS[p.trigger.type]}</span>
      <button class="btn small" data-run="${p.id}">${Icons.play} Chạy</button>
      <button class="icon-btn" data-del-preset="${p.id}" title="Xoá">${Icons.trash}</button>
    </div>`).join('');
  return `<section class="view presets" data-key="v-presets">
    <div class="head"><div><div class="eyebrow">Preset</div><h1>Preset đã lưu</h1></div></div>
    <div class="list fit" data-fit="presets">${rows || '<div class="empty">Chưa có preset. Tạo preset từ màn Hẹn giờ bằng nút "Lưu làm preset".</div>'}</div>
    <div class="foot"><p class="note">Nhấp đúp vào tên để đổi tên. Preset cũng có thể được khởi chạy từ menu khay hệ thống.</p>${pager('presets', pg)}</div>
  </section>`;
}

// ---------- 03 Lịch lặp ----------
function viewSchedules() {
  const days = (arr, id) => [1, 2, 3, 4, 5, 6, 0].map((d) =>
    `<button class="day ${arr.includes(d) ? 'on' : ''}" ${id ? `data-sday="${id}:${d}"` : `data-nday="${d}"`}>${S.DAYS[d]}</button>`).join('');
  const pg = paged('schedules', st.schedules);
  const rows = pg.rows.map((sc, i) => {
    const next = snap?.next?.find((n) => n.id === sc.id)?.at;
    return `<div class="item ${sc.enabled ? '' : 'off'}" data-row data-key="s-${sc.id}" style="animation-delay:${i * 40}ms">
      <span class="stime num">${sc.time}</span>
      <div class="sinfo"><div class="days">${days(sc.days, sc.id)}</div>
        <div class="pdesc">${sc.enabled ? (next ? `Lần tiếp theo: ${S.dayWord(next)} ${S.hhmm(next)}` : 'Chưa chọn ngày') : 'Đã tắt'}</div></div>
      ${Dropdown.html({ opts: 'action', value: sc.action, key: `dd-s-${sc.id}`, attrs: `data-sact-row="${sc.id}"`, cls: 'dd-row', title: 'Hành động' })}
      <button class="switch ${sc.enabled ? 'on' : ''}" data-stoggle="${sc.id}" title="Bật/tắt"></button>
      <button class="icon-btn" data-sdel="${sc.id}" title="Xoá">${Icons.trash}</button>
    </div>`;
  }).join('');
  return `<section class="view sched" data-key="v-schedules">
    <div class="head"><div><div class="eyebrow">Lịch lặp</div><h1>Lịch tự động</h1></div></div>
    <div class="card adder">
      <div><div class="label">Giờ</div><div class="time-in"><input class="num" data-dial="sched.h" data-max="23" value="${pad(sched.h)}" maxlength="2"><span class="sep">:</span><input class="num" data-dial="sched.m" data-max="59" value="${pad(sched.m)}" maxlength="2"></div></div>
      <div><div class="label">Ngày</div><div class="days">${days(sched.days)}</div></div>
      <div><div class="label" id="lbl-sact">Hành động</div>${Dropdown.html({ opts: 'action', value: sched.action, key: 'dd-new', attrs: 'data-sact', labelledby: 'lbl-sact' })}</div>
      <button class="btn primary" data-do="sched-add" title="Thêm lịch">${Icons.plus}<span>Thêm lịch</span></button>
    </div>
    <div class="list fit" data-fit="schedules">${rows || '<div class="empty">Chưa có lịch. Chọn thời gian, ngày và hành động để tạo lịch mới.</div>'}</div>
    <div class="foot"><p class="note">Sleepy phải đang chạy để thực hiện lịch. Bật "Khởi động cùng hệ thống" nếu cần.</p>${pager('schedules', pg)}</div>
  </section>`;
}

// ---------- 04 Nhật ký ----------
function viewHistory() {
  const badge = { done: '<span class="tag ok">Đã thực hiện</span>', cancel: '<span class="tag">Đã huỷ</span>', dry: '<span class="tag lamp">Thử</span>', error: '<span class="tag err">Lỗi</span>', pending: '<span class="tag">…</span>' };
  const pg = paged('history', st.history);
  const rows = pg.rows.map((h) => {
    const d = new Date(h.at);
    return `<tr data-row data-key="h-${h.id}"><td class="num">${pad(d.getDate())}/${pad(d.getMonth() + 1)} · ${S.hhmm(h.at)}</td>
      <td><b>${S.ACTIONS[h.action]?.label || h.action}</b><div class="sub">${esc(S.triggerText(h.trigger))}</div></td>
      <td class="dim c-src">${esc(sourceLabel(h.source))}</td>
      <td>${badge[h.result] || ''}${h.note && h.note !== 'Đã huỷ' ? `<div class="sub">${esc(h.note)}</div>` : ''}</td></tr>`;
  }).join('');
  return `<section class="view" data-key="v-history">
    <div class="head"><div><div class="eyebrow">Nhật ký</div><h1>Lịch sử hoạt động</h1></div>
      ${st.history.length ? '<button class="btn ghost small" data-do="hist-clear">Xoá nhật ký</button>' : ''}</div>
    <div class="fit" data-fit="history">${rows ? `<table class="hist"><colgroup><col class="c-time"><col><col class="c-src"><col class="c-res"></colgroup>
      <thead><tr><th>Thời gian</th><th>Hành động</th><th class="c-src">Nguồn</th><th>Kết quả</th></tr></thead><tbody>${rows}</tbody></table>`
      : '<div class="empty">Chưa có dữ liệu hoạt động.</div>'}</div>
    ${pg.count > 1 ? `<div class="foot">${pager('history', pg)}</div>` : ''}
  </section>`;
}

// ---------- 05 Cài đặt ----------
function seg(key, opts) {
  const v = st.settings[key];
  return `<div class="seg" data-morph-keep="style">${opts.map(([val, l]) => `<button class="${v === val ? 'on' : ''}" data-set="${key}" data-val='${JSON.stringify(val)}'>${l}</button>`).join('')}</div>`;
}
function sw(key) { return `<button class="switch ${st.settings[key] ? 'on' : ''}" data-set="${key}" data-val='${JSON.stringify(!st.settings[key])}'></button>`; }
function setRow(title, desc, ctl) { return `<div class="set"><div><b>${title}</b>${desc ? `<p>${desc}</p>` : ''}</div>${ctl}</div>`; }
function viewSettings() {
  const capWord = { yes: ['Được', 'yes'], challenge: ['Cần mật khẩu', ''], no: ['Không', 'no'], na: ['Không hỗ trợ', 'no'], unknown: ['Chưa rõ', ''] };
  const g = (k) => `card group${setTab === k ? ' cur' : ''}" data-g="${k}`;
  return `<section class="view settings" data-key="v-settings">
    <div class="head"><div><div class="eyebrow">Sleepy</div><h1>Cài đặt</h1></div>
      <div class="seg stabs" data-morph-keep="style">${[['warn', 'Cảnh báo'], ['app', 'Ứng dụng'], ['adv', 'Nâng cao']]
        .map(([k, l]) => `<button class="${setTab === k ? 'on' : ''}" data-stab="${k}">${l}</button>`).join('')}</div></div>
    <div class="groups">
    <div class="${g('warn')}"><h2>Cảnh báo</h2>
      ${setRow('Báo trước', 'Hiển thị cửa sổ cảnh báo trước khi thực hiện hành động.', seg('warnMinutes', [[0, 'Không'], [1, '1 phút'], [2, '2 phút'], [5, '5 phút'], [10, '10 phút']]))}
      ${setRow('Thời gian chờ sau điều kiện', 'Khoảng trì hoãn sau khi điều kiện được đáp ứng.', seg('graceSeconds', [[30, '30 giây'], [60, '60 giây'], [120, '2 phút']]))}
      ${setRow('Âm báo', 'Phát âm thanh khi cảnh báo và trong 10 giây cuối.', sw('sound'))}
      ${setRow('Chế độ thử', 'Chỉ hiển thị thông báo, không thực hiện hành động hệ thống.', sw('dryRun'))}
    </div>
    <div class="${g('app')}"><h2>Ứng dụng</h2>
      ${setRow('Giao diện', 'Chọn giao diện hiển thị.', seg('theme', [['dark', 'Tối'], ['light', 'Sáng'], ['system', 'Theo hệ thống']]))}
      ${setRow('Giữ hệ thống hoạt động', 'Ngăn màn hình tắt và hệ thống tự chuyển sang chế độ ngủ khi hẹn giờ đang chạy.', sw('keepAwake'))}
      ${setRow('Thu nhỏ vào khay khi đóng', 'Tiếp tục chạy hẹn giờ khi cửa sổ chính đóng.', sw('closeToTray'))}
      ${setRow('Khởi động cùng hệ thống', 'Khởi động Sleepy sau khi đăng nhập.', sw('autostart'))}
      ${setRow('Khởi động ở chế độ thu nhỏ', 'Mở ứng dụng ở trạng thái thu nhỏ vào khay.', sw('startMinimized'))}
    </div>
    <div class="${g('adv')}"><h2>Nâng cao</h2>
      ${setRow('Lệnh chạy trước', 'Thực thi lệnh trước hành động, với thời gian chờ tối đa 30 giây. Ví dụ: <span style="font-family:var(--mono)">playerctl pause</span>.', `<input class="mono" data-text="preCommand" value="${esc(st.settings.preCommand)}" placeholder="Để trống nếu không sử dụng" spellcheck="false">`)}
      <div class="set" style="display:block"><b>Quyền thực hiện hành động</b>
        <div class="caps" style="margin-top:10px">${ORDER.map((k) => { const c = capWord[st.caps?.[k]] || capWord.unknown; return `<div><span>${S.ACTIONS[k].label}</span><span class="${c[1]}">${c[0]}</span></div>`; }).join('')}</div></div>
    </div>
    </div>
    <p class="note ver">Sleepy 2.0 · dữ liệu lưu tại ~/.config/dev.giabao.sleepy/sleepy.json</p>
  </section>`;
}

// ---------- Sự kiện ----------
async function start(action, trig, source) {
  const r = await sleepy.start(action, trig, source);
  if (!r.ok || r.error) toast(r.error, true); else toast(`Đã tạo hẹn giờ: ${S.describe(action, trig)}.`);
}
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [data-rename], .mini');
  if (!t) return;
  const ds = t.dataset;
  if (ds.win) return sleepy.win(ds.win);
  if (ds.view) { if (view === ds.view) return; view = ds.view; savingPreset = false; renaming = null; if (view === 'timer' && draft.type === 'process') loadProcs(); return render(); }
  if (ds.action) { if (draft.action === ds.action) return; draft.action = ds.action; saveDraft(); return render(); }
  if (ds.mode) { const type = ds.mode === 'cond' ? (draft.condType || 'idle') : ds.mode; if (draft.type === type) return; draft.type = type; saveDraft(); if (draft.type === 'process') loadProcs(); return render(); }
  if (ds.type) { if (draft.type === ds.type) return; draft.type = ds.type; draft.condType = ds.type; saveDraft(); if (ds.type === 'process') loadProcs(); return render(); }
  if (ds.chip) { const v = +ds.chip; if (dialVal() === v && !draft.countdown.s) return; draft.countdown = { h: Math.floor(v / 60), m: v % 60, s: 0 }; saveDraft(); return render(); }
  if (ds.chipAt) { const current = `${pad(draft.at.h)}:${pad(draft.at.m)}`; if (current === ds.chipAt) return; const [h, m] = ds.chipAt.split(':').map(Number); draft.at = { h, m }; saveDraft(); return render(); }
  if (ds.post) return sleepy.postpone(+ds.post);
  if (ds.snd) { focusedSnd = ds.snd; return Ambient.toggle(ds.snd); }
  if (ds.swell) { focusedSnd = ds.swell; return Ambient.toggleSwell(ds.swell); }
  if (ds.track) { focusedSnd = 'lofi'; return Ambient.selectSong(ds.track); }
  if (ds.delTrack) { e.stopPropagation(); return Ambient.removeCustomTrack(ds.delTrack); }
  if (ds.sndPage) { sndPage += +ds.sndPage; return render(); }
  if (ds.mixPage) { mixPage += +ds.mixPage; return render(); }
  if (ds.plPage) { playlistPage += +ds.plPage; return render(); }
  if (ds.stabSnd) { sndTab = ds.stabSnd; if (sndTab === 'youtube') Ambient.ytStatus().then((s) => { ytStatus = s; render(); }); return render(); }
  if (ds.sfilter) { sndFilter = ds.sfilter; sndPage = 0; return render(); }
  if (ds.plFilter) { playlistFilter = ds.plFilter; playlistPage = 0; return render(); }
  if (ds.apreset) return Ambient.applyPreset(ds.apreset);
  if (ds.cmix) return Ambient.applyCustomMix(ds.cmix);
  if (ds.delCmix) return Ambient.deleteMix(ds.delCmix);
  if (ds.yt) {
    try {
      ytStatus = ds.yt === 'hide' ? await Ambient.ytHide() : ds.yt === 'close' ? await Ambient.ytClose() : await Ambient.ytOpen(ds.yt);
      return render();
    } catch (err) { return toast(String(err), true); }
  }
  if ('fadeCycle' in ds) { const i = FADES.indexOf(Ambient.fade); return Ambient.setFade(FADES[(i + 1) % FADES.length]); }
  if (ds.fade) return Ambient.setFade(+ds.fade);
  if (ds.stab) { setTab = ds.stab; return render(); }
  if (ds.page) { const [k, d] = ds.page.split(':'); pages[k].page += +d; return render(); }
  if (ds.run) { const p = st.presets.find((x) => x.id === ds.run); if (p) { await start(p.action, p.trigger, `preset:${p.id}`); view = 'timer'; render(); } return; }
  if (ds.delPreset) return sleepy.setPresets(st.presets.filter((p) => p.id !== ds.delPreset));
  if (ds.set) {
    try {
      return await sleepy.setSettings({ [ds.set]: JSON.parse(ds.val) });
    } catch (error) {
      return toast(String(error), true);
    }
  }
  if (ds.nday) { const d = +ds.nday; sched.days = sched.days.includes(d) ? sched.days.filter((x) => x !== d) : [...sched.days, d]; return render(); }
  if (ds.sday) {
    const [id, d] = ds.sday.split(':');
    return sleepy.setSchedules(st.schedules.map((s) => s.id !== id ? s : { ...s, days: s.days.includes(+d) ? s.days.filter((x) => x !== +d) : [...s.days, +d], lastArmed: 0 }));
  }
  if (ds.stoggle) return sleepy.setSchedules(st.schedules.map((s) => s.id === ds.stoggle ? { ...s, enabled: !s.enabled, lastArmed: 0 } : s));
  if (ds.sdel) return sleepy.setSchedules(st.schedules.filter((s) => s.id !== ds.sdel));
  switch (ds.do) {
    case 'start': return start(draft.action, trigger(), 'manual');
    case 'cancel': await sleepy.cancel(); return toast('Đã huỷ hẹn giờ.');
    case 'now': return sleepy.now();
    case 'preset-new': savingPreset = true; return render();
    case 'preset-cancel': savingPreset = false; return render();
    case 'preset-save': return savePreset();
    case 'hist-clear': return sleepy.clearHistory();
    case 'snd-play': return Ambient.togglePlay();
    case 'snd-skip': focusedSnd = 'lofi'; return Ambient.skipSong();
    case 'snd-prev': focusedSnd = 'lofi'; return Ambient.prevSong();
    case 'snd-shuffle': return Ambient.shuffle();
    case 'snd-clear': return Ambient.clearAll();
    case 'snd-files': {
      try {
        const added = await Ambient.pickFiles();
        if (added) { sndTab = 'playlist'; playlistFilter = 'custom'; focusedSnd = 'lofi'; render(); toast(`Đã thêm ${added} bài nhạc của bạn.`); }
      } catch (e) { toast(String(e), true); }
      return;
    }
    case 'snd-folder': {
      try {
        const added = await Ambient.pickFolder();
        if (added) { sndTab = 'playlist'; playlistFilter = 'custom'; focusedSnd = 'lofi'; render(); toast(`Đã thêm ${added} bài nhạc từ thư mục.`); }
      } catch (e) { toast(String(e), true); }
      return;
    }
    case 'mix-new': savingMix = true; render(); $('#mix-name')?.focus(); return;
    case 'mix-cancel': savingMix = false; return render();
    case 'mix-save': {
      const name = $('#mix-name')?.value.trim();
      try {
        await Ambient.saveMix(name || '');
        savingMix = false;
        render();
        toast(`Đã lưu bộ mix "${name}".`);
      } catch (e) { toast(String(e), true); }
      return;
    }
    case 'sched-add': {
      if (!sched.days.length) return toast('Vui lòng chọn ít nhất một ngày.', true);
      const id = Math.random().toString(16).slice(2, 12);
      await sleepy.setSchedules([...st.schedules, { id, time: `${pad(sched.h)}:${pad(sched.m)}`, days: [...sched.days].sort(), action: sched.action, enabled: true, lastArmed: 0 }]);
      return toast(`Đã thêm lịch ${pad(sched.h)}:${pad(sched.m)}`);
    }
  }
});
document.addEventListener('dblclick', (e) => { const t = e.target.closest('[data-rename]'); if (t) { renaming = t.dataset.rename; render(); } });
function commitRename(input) {
  const name = input.value.trim(), id = input.dataset.renameInput;
  renaming = null;
  if (name) sleepy.setPresets(st.presets.map((p) => p.id === id ? { ...p, name } : p)); else render();
}
async function savePreset() {
  const name = $('#preset-name')?.value.trim();
  if (!name) return toast('Vui lòng nhập tên preset.', true);
  const t = trigger();
  if (t.type === 'countdown' && !t.seconds) return toast('Thời gian phải lớn hơn 0.', true);
  savingPreset = false;
  await sleepy.setPresets([...st.presets, { id: Math.random().toString(16).slice(2, 12), name, action: draft.action, trigger: t }]);
  toast(`Đã lưu preset "${name}".`);
}
function setDial(input, val) {
  const [scope, key] = input.dataset.dial.split('.');
  const v = Math.max(0, Math.min(+input.dataset.max, Number.isFinite(val) ? val : 0));
  if (scope === 'sched') sched[key] = v; else { draft[scope][key] = v; if (scope === 'countdown') draft.countdown.s = 0; saveDraft(); }
  return v;
}
const fmtDial = (input, v) => (input.dataset.dial === 'countdown.h' ? String(v) : pad(v));
function dialChanged(opts) { if (view === 'timer') { renderDial(opts); updateSummary(); syncChips(); } }
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.vol || 'master' in t.dataset || t.dataset.pan || 'seek' in t.dataset) {
    if (t.dataset.pan) {
      t.style.setProperty('--v', `${(+t.value + 100) / 2}%`);
      Ambient.setPan(t.dataset.pan, +t.value / 100);
      return;
    }
    t.style.setProperty('--v', `${t.value}%`);
    if (t.dataset.vol) Ambient.setVol(t.dataset.vol, t.value / 100);
    else if ('seek' in t.dataset) Ambient.seekSong(t.value / 100);
    else Ambient.setMaster(t.value / 100);
    return;
  }
  if (t.dataset.dial) { t.value = t.value.replace(/\D/g, '').slice(0, 2); setDial(t, parseInt(t.value, 10)); dialChanged(); }
  else if (t.dataset.field) {
    const [scope, key] = t.dataset.field.split('.');
    if (key === 'name') { draft[scope][key] = t.value; procRunning = null; checkProc(); }
    else { t.value = t.value.replace(/\D/g, '').slice(0, 5); draft[scope][key] = Math.max(1, parseInt(t.value, 10) || 1); }
    saveDraft(); updateSummary(); renderDial();
  }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.text) sleepy.setSettings({ [t.dataset.text]: t.value });
  if ('sact' in t.dataset) sched.action = t.dataset.value;
  if (t.dataset.sactRow) {
    const id = t.dataset.sactRow, action = t.dataset.value;
    sleepy.setSchedules(st.schedules.map((s) => s.id === id ? { ...s, action } : s));
  }
});
document.addEventListener('focusout', (e) => {
  const t = e.target;
  if (t.dataset.dial) { t.value = fmtDial(t, setDial(t, parseInt(t.value, 10))); dialChanged(); }
  if (t.dataset.renameInput) commitRename(t);
  if (t.dataset.field && t.dataset.field !== 'process.name') { const [a, b] = t.dataset.field.split('.'); t.value = draft[a][b]; }
});
document.addEventListener('focusin', (e) => { if (e.target.dataset.dial) e.target.select(); });
function stepDial(t, dir) {
  const max = +t.dataset.max;
  let v = (parseInt(t.value, 10) || 0) + dir;
  if (v > max) v = 0; if (v < 0) v = max;
  t.value = fmtDial(t, setDial(t, v)); dialChanged();
}
document.addEventListener('wheel', (e) => { const t = e.target.closest('[data-dial]'); if (!t) return; e.preventDefault(); stepDial(t, e.deltaY < 0 ? 1 : -1); }, { passive: false });
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t.dataset?.dial && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); stepDial(t, e.key === 'ArrowUp' ? 1 : -1); return; }
  if (t.dataset?.renameInput) { if (e.key === 'Enter') t.blur(); if (e.key === 'Escape') { renaming = null; render(); } return; }
  if (t.id === 'preset-name') { if (e.key === 'Enter') savePreset(); if (e.key === 'Escape') { savingPreset = false; render(); } return; }
  if (t.id === 'mix-name') { if (e.key === 'Enter') $('[data-do="mix-save"]')?.click(); if (e.key === 'Escape') { savingMix = false; render(); } return; }
  if (e.ctrlKey && /^[1-6]$/.test(e.key)) { view = VIEWS[+e.key - 1][0]; savingPreset = false; render(); return; }
  if (e.key === 'Enter' && view === 'timer' && !snap?.job && t.tagName !== 'BUTTON') start(draft.action, trigger(), 'manual');
});

// ---------- Tiến trình ----------
async function loadProcs() { procList = await sleepy.processes(); const dl = $('#procs'); morph(dl, procList.map((p) => `<option value="${esc(p)}">`).join('')); checkProc(); }
let procTimer;
function checkProc() {
  clearTimeout(procTimer);
  procTimer = setTimeout(async () => { const n = draft.process.name.trim(); procRunning = n ? await sleepy.checkProcess(n) : null; renderDial(); }, 250);
}

// ---------- Khởi động ----------
(async function boot() {
  const ctl = document.querySelectorAll('.winctl button');
  ctl[0].innerHTML = Icons.min; ctl[1].innerHTML = Icons.max; ctl[2].innerHTML = Icons.close;
  $('#brand-ico').innerHTML = Icons.moon;
  st = await sleepy.getState();
  snap = { job: st.job, sensors: st.sensors, next: st.next };
  draft = initDraft(st.draft);
  render();
  if (draft.type === 'process') loadProcs();
  Ambient.syncJob(snap.job);
  Ambient.onChange(() => {
    if (!st) return;
    if (view === 'sounds') render();
    else {
      renderRail();
      syncIndicators();
      const qs = $('#side-sounds');
      if (qs) qs.outerHTML = quickSoundsHtml();
    }
  });

  sleepy.onState((s) => {
    const hadJob = !!snap?.job;
    st = s; snap = { job: s.job, sensors: s.sensors, next: s.next };
    Ambient.syncJob(s.job);
    if (!hadJob && s.job) view = 'timer';
    render(); // rẻ nhờ morph; ô đang gõ (vd. Lệnh chạy trước) giữ nguyên giá trị

  });

  let tickN = 0;
  sleepy.onTick((s) => {
    const changed = !!snap?.job !== !!s.job || snap?.job?.phase !== s.job?.phase || snap?.job?.id !== s.job?.id;
    snap = s;
    const wasFading = Ambient.fading;
    Ambient.syncJob(s.job);
    if (view === 'sounds' && (wasFading || Ambient.fading)) render();
    if (s.sensors.cpu != null) { spark.cpu.push(s.sensors.cpu); if (spark.cpu.length > 60) spark.cpu.shift(); }
    if (s.sensors.net != null) { spark.net.push(s.sensors.net); if (spark.net.length > 60) spark.net.shift(); }
    if (changed && view === 'timer') return render();
    renderMini();
    tickN++;
    if (view === 'timer') {
      if (s.job) updateRunning();
      else { if (isCond(draft.type) || draft.type === 'at' || tickN % 15 === 0) renderDial(); if (tickN % 15 === 0) { updateSummary(); const g = $('#greet'); if (g) g.textContent = greet(); } }
    }
    if (draft.type === 'process' && view === 'timer' && !s.job && tickN % 3 === 0) checkProc();
  });
})();
