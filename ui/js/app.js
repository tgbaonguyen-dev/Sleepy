/* global Shared, Icons, nghi */
const S = Shared;
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = S.pad;
const TAU = Math.PI * 2;

let st = null, snap = null, view = 'timer', draft = null;
let procList = [], procRunning = null, savingPreset = false, renaming = null;
const spark = { cpu: [], net: [] };
const sched = { h: 23, m: 30, days: [1, 2, 3, 4, 5], action: 'shutdown' };

const VIEWS = [['timer', 'Hẹn giờ', 'timer'], ['presets', 'Preset', 'bookmark'], ['schedules', 'Lịch lặp', 'repeat'], ['history', 'Nhật ký', 'history'], ['settings', 'Cài đặt', 'gear']];
const ORDER = ['shutdown', 'reboot', 'suspend', 'hibernate', 'lock', 'logout'];
const CONDS = [['idle', 'Không đụng máy'], ['net', 'Tải xong'], ['cpu', 'Máy hết bận'], ['process', 'Tắt một app'], ['battery', 'Pin sắp cạn']];
const isCond = (t) => !['countdown', 'at'].includes(t);

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
function saveDraft() { clearTimeout(draftTimer); draftTimer = setTimeout(() => nghi.setDraft(draft), 400); }

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
  if (!src || src === 'manual') return 'Hẹn thủ công';
  const [k, id] = src.split(':');
  if (k === 'preset') return `Preset “${st.presets.find((p) => p.id === id)?.name || '—'}”`;
  if (k === 'schedule') { const s = st.schedules.find((x) => x.id === id); return `Lịch lặp ${s ? s.time : ''}`; }
  return src;
}
function capOk(a) { const c = st.caps?.[a]; return !c || c === 'yes' || c === 'challenge' || c === 'unknown'; }
function greet() {
  const d = new Date(), h = d.getHours();
  const part = h < 5 ? 'Khuya rồi' : h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  return `${part} · ${S.DAY_LONG[d.getDay()]} ${S.hhmm(d)}`;
}
function roll(el, text) {
  if (!el) return;
  const prev = el.dataset.t || '';
  if (prev === text) return;
  const same = prev.length === text.length;
  el.innerHTML = [...text].map((ch, i) => `<span class="ch${same && prev[i] !== ch ? ' roll' : ''}">${esc(ch)}</span>`).join('');
  el.dataset.t = text;
}

// ---------- Khung ----------
function renderRail() {
  const active = st.schedules.filter((s) => s.enabled).length;
  $('#rail').innerHTML = VIEWS.map(([k, label, ic]) => `<button data-view="${k}" class="${view === k ? 'on' : ''}" title="${label} (Ctrl+${VIEWS.findIndex((v) => v[0] === k) + 1})">
    ${Icons[ic]}<span>${label}</span>${k === 'schedules' && active ? `<span class="badge">${active}</span>` : ''}</button>`).join('') + `<div class="mini" id="mini" data-view="timer"></div>`;
  renderMini();
}
function renderMini() {
  const el = $('#mini'); if (!el) return;
  const j = snap?.job;
  if (!j) {
    el.className = 'mini idle';
    el.innerHTML = `<svg viewBox="0 0 46 46"><circle cx="23" cy="23" r="19" fill="none" stroke-width="3" class="track"/></svg><div class="v">Nghỉ</div><div class="d">chưa hẹn</div>`;
    return;
  }
  el.className = 'mini';
  const f = j.phase === 'countdown' && j.totalMs ? Math.max(0, j.remaining / j.totalMs) : (j.satisfiedMs && j.need ? Math.min(1, j.satisfiedMs / j.need) : 0);
  const hot = j.phase === 'countdown' && j.remaining <= 60000;
  const v = j.phase === 'countdown' ? S.clock(j.remaining) : watchValue(j).main;
  el.innerHTML = `<svg viewBox="0 0 46 46">${DEFS}<circle cx="23" cy="23" r="19" fill="none" stroke-width="3" class="track"/>
    <path d="${arc(23, 19, 0, f)}" fill="none" stroke-width="3" stroke-linecap="round" stroke="url(#${hot ? 'gHot' : 'gMoon'})"/></svg>
    <div class="v num">${esc(v)}</div><div class="d">${esc(S.ACTIONS[j.action].label)}</div>`;
}
function render() {
  if (!st) return;
  applyTheme(); renderRail();
  const main = $('#main');
  main.innerHTML = { timer: () => (snap?.job ? viewRunning() : viewSetup()), presets: viewPresets, schedules: viewSchedules, history: viewHistory, settings: viewSettings }[view]();
  if (view === 'timer' && !snap?.job) { renderDial(); updateSummary(); bindDial(); }
  if (view === 'timer' && snap?.job) updateRunning();
  const r = $('[data-rename-input]'); if (r) { r.focus(); r.select(); }
  const p = $('#preset-name'); if (p) p.focus();
}

// ---------- 01 Hẹn giờ: thiết lập ----------
function viewSetup() {
  const d = draft, mode = isCond(d.type) ? 'cond' : d.type;
  const acts = ORDER.map((k) => {
    const ok = capOk(k);
    return `<button class="act ${d.action === k ? 'on' : ''}" data-action="${k}" ${ok ? '' : 'disabled title="Hệ thống không cho phép"'} title="${S.ACTIONS[k].hint}"><span class="ring-i">${Icons[k]}</span>${S.ACTIONS[k].label}</button>`;
  }).join('');
  const quick = st.presets.slice(0, 5);
  let chips = '';
  if (d.type === 'countdown') {
    const tot = d.countdown.h * 60 + d.countdown.m;
    chips = [[15, '15 phút'], [30, '30 phút'], [45, '45 phút'], [60, '1 giờ'], [90, '1 giờ 30'], [120, '2 giờ'], [180, '3 giờ']]
      .map(([v, l]) => `<button class="chip ${tot === v && !d.countdown.s ? 'on' : ''}" data-chip="${v}">${l}</button>`).join('');
  } else if (d.type === 'at') {
    const cur = `${pad(d.at.h)}:${pad(d.at.m)}`;
    chips = ['22:00', '22:30', '23:00', '23:30', '00:00', '00:30', '01:00'].map((v) => `<button class="chip ${cur === v ? 'on' : ''}" data-chip-at="${v}">${v}</button>`).join('');
  }
  return `<section class="view">
    <div class="head"><div><div class="eyebrow" id="greet">${greet()}</div><h1>Khi nào cho máy nghỉ?</h1></div></div>
    <div class="setup">
      <div class="stage">
        <div class="dial ${isCond(d.type) ? '' : 'drag'}" id="dial"><svg viewBox="0 0 330 330" id="dial-svg"></svg><div class="center" id="dial-center"></div></div>
        ${chips ? `<div class="chips" style="justify-content:center">${chips}</div>` : `<svg id="spark" viewBox="0 0 280 48" style="width:280px;height:48px;overflow:visible"></svg>`}
      </div>
      <div class="side">
        <div><div class="label">Muốn làm gì</div><div class="acts">${acts}</div></div>
        <div><div class="label">Lúc nào</div>
          <div class="seg wide"><button class="${mode === 'countdown' ? 'on' : ''}" data-mode="countdown">Sau bao lâu</button><button class="${mode === 'at' ? 'on' : ''}" data-mode="at">Đúng giờ</button><button class="${mode === 'cond' ? 'on' : ''}" data-mode="cond">Khi xong việc</button></div></div>
        ${mode === 'cond' ? condCard() : `<p class="note">${mode === 'countdown' ? 'Kéo chấm tròn quanh vòng để chỉnh phút, vòng qua đỉnh là thêm một giờ. Hoặc lăn chuột lên các con số.' : 'Kéo chấm tròn tới giờ bạn muốn. Nếu giờ đó đã qua, Nghỉ hiểu là ngày mai.'}</p>`}
        ${quick.length ? `<div><div class="label">Hay dùng</div><div class="quick">${quick.slice(0, 3).map((p) => `<button class="q" data-run="${p.id}" title="${esc(S.describe(p.action, p.trigger))}">
          <span class="qi">${Icons[p.action]}</span><span class="qt"><b>${esc(p.name)}</b><small>${esc(quickDesc(p))}</small></span><span class="qa">${Icons.play}</span></button>`).join('')}</div></div>` : ''}
      </div>
    </div>
  </section>
  <div class="bar">
    <div class="summary" id="summary"></div>
    ${savingPreset
      ? `<input id="preset-name" class="inline-input" placeholder="Tên preset…" maxlength="40"><button class="btn" data-do="preset-save">Lưu</button><button class="btn ghost" data-do="preset-cancel">Thôi</button>`
      : `<button class="btn ghost" data-do="preset-new">${Icons.bookmark} Lưu làm preset</button>`}
    <button class="btn primary big" data-do="start">${Icons.play} Bắt đầu</button>
  </div>`;
}

function quickDesc(p) {
  const t = p.trigger, a = S.ACTIONS[p.action].label;
  if (t.type === 'countdown') return `${a} sau ${S.human(t.seconds * 1000)}`;
  if (t.type === 'at') return `${a} lúc ${t.time}`;
  return `${a} khi ${S.TRIGGERS[t.type].toLowerCase()}`;
}
function condCard() {
  const d = draft, c = d[d.type];
  const tabs = CONDS.map(([k, l]) => {
    const dis = k === 'battery' && !st.hasBattery;
    return `<button class="chip ${d.type === k ? 'on' : ''}" data-type="${k}" ${dis ? 'disabled title="Máy không có pin" style="opacity:.4"' : ''}>${l}</button>`;
  }).join('');
  let s = '', note = '';
  switch (d.type) {
    case 'idle': s = `Khi bạn không đụng tới chuột hay bàn phím trong <input class="num" data-field="idle.minutes" value="${c.minutes}"> phút`; note = 'Hợp lúc xem phim dễ ngủ quên. Bạn chạm chuột là Nghỉ đếm lại từ đầu.'; break;
    case 'battery': s = `Khi pin còn dưới <input class="num" data-field="battery.percent" value="${c.percent}">% mà chưa cắm sạc`; note = 'Cho máy nghỉ trước khi sập nguồn giữa chừng.'; break;
    case 'net': s = `Khi mạng chậm dưới <input class="num" data-field="net.kbps" value="${c.kbps}" style="width:4ch"> KB/s suốt <input class="num" data-field="net.minutes" value="${c.minutes}"> phút`; note = 'Đang tải game, phim hay bản cập nhật? Tải xong là máy tự nghỉ.'; break;
    case 'cpu': s = `Khi máy chỉ dùng dưới <input class="num" data-field="cpu.percent" value="${c.percent}">% CPU suốt <input class="num" data-field="cpu.minutes" value="${c.minutes}"> phút`; note = 'Để máy render video, build code hay nén file, xong việc thì nghỉ.'; break;
    case 'process': s = `Khi <input class="wide" data-field="process.name" value="${esc(c.name)}" list="procs" placeholder="firefox" spellcheck="false"> đóng lại<datalist id="procs">${procList.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>`; note = 'Gõ tên app như trong System Monitor, ví dụ firefox hay obs.'; break;
  }
  return `<div class="card cond"><div class="chips">${tabs}</div><div class="sentence">${s}</div>
    <p class="note">${note ? note + ' ' : ''}Đến lúc đó, Nghỉ vẫn chờ thêm ${st.settings.graceSeconds} giây và báo trước để bạn kịp đổi ý.</p></div>`;
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
function updateSummary() { const el = $('#summary'); if (el) el.innerHTML = summaryHtml(); }

// Vòng quay thiết lập
const DC = 165, DR = 138;
function renderDial() {
  const svg = $('#dial-svg'), center = $('#dial-center'); if (!svg) return;
  const d = draft, s = snap?.sensors || {};
  let body = '', cHtml = '';
  if (d.type === 'countdown') {
    const { h, m } = d.countdown, tot = h * 60 + m;
    const f = tot === 0 ? 0 : (m === 0 ? 1 : m / 60), hf = tot === 0 ? 0 : m / 60;
    const [hx, hy] = pt(DC, DR, hf);
    body = ticks(DC, DR - 20, 60, 5) +
      `<circle cx="${DC}" cy="${DC}" r="${DR}" fill="none" stroke-width="16" class="track"/>` +
      (h > 0 ? `<circle cx="${DC}" cy="${DC}" r="${DR + 14}" fill="none" stroke-width="2" style="stroke:var(--moon);opacity:.35" stroke-dasharray="${Math.min(h, 12) > 0 ? '2 6' : ''}"/>` : '') +
      `<path class="arc" d="${arc(DC, DR, 0, f)}" fill="none" stroke-width="16" stroke-linecap="round"/>` +
      celestial(hx, hy, isDay(new Date(Date.now() + tot * 60000).getHours()));
    const end = Date.now() + tot * 60000;
    cHtml = `<div class="time-in v"><div class="tu"><input class="num" data-dial="countdown.h" data-max="23" value="${h}" maxlength="2" inputmode="numeric" aria-label="Giờ"><span>giờ</span></div>
      <span class="sep">:</span><div class="tu"><input class="num" data-dial="countdown.m" data-max="59" value="${pad(m)}" maxlength="2" inputmode="numeric" aria-label="Phút"><span>phút</span></div></div>
      <div class="sub" id="dial-sub">${tot ? `${S.ACTIONS[d.action].label.toLowerCase()} lúc ${S.hhmm(end)} ${S.dayWord(end)}` : 'chưa chọn'}</div>`;
  } else if (d.type === 'at') {
    const tm = d.at.h * 60 + d.at.m, now = new Date(), nm = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    let f0 = nm / 1440, f1 = tm / 1440; if (f1 <= f0) f1 += 1;
    const [hx, hy] = pt(DC, DR, tm / 1440), [nx, ny] = pt(DC, DR, nm / 1440);
    body = ticks(DC, DR - 20, 96, 4) + [[0, '0h'], [12, '12h']].map(([v, l]) => { const [x, y] = pt(DC, DR - 42, v / 24); return `<text class="tick-l" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${l}</text>`; }).join('') +
      `<circle cx="${DC}" cy="${DC}" r="${DR}" fill="none" stroke-width="16" class="track"/>` +
      `<path class="arc" d="${arc(DC, DR, f0, f1)}" fill="none" stroke-width="16" stroke-linecap="round"/>` +
      `<circle cx="${nx}" cy="${ny}" r="4" style="fill:var(--ink-2)"/>` + celestial(hx, hy, isDay(d.at.h));
    const end = S.atDeadline(trigger().time);
    cHtml = `<div class="time-in v"><input class="num" data-dial="at.h" data-max="23" value="${pad(d.at.h)}" maxlength="2" inputmode="numeric" aria-label="Giờ"><span class="sep">:</span>
      <input class="num" data-dial="at.m" data-max="59" value="${pad(d.at.m)}" maxlength="2" inputmode="numeric" aria-label="Phút"></div>
      <div class="sub" id="dial-sub">${S.dayWord(end)}, còn ${S.human(end - Date.now())}</div>`;
  } else {
    const c = d[d.type]; let v = 0, th = null, val = '—', sub = '', cap = '';
    switch (d.type) {
      case 'idle': cap = 'Bạn đã rời máy'; v = s.idle == null ? 0 : Math.min(1, s.idle / (c.minutes * 60)); val = s.idle == null ? '—' : S.clock(s.idle * 1000); sub = `cần đủ ${c.minutes} phút`; break;
      case 'battery': cap = 'Pin'; v = s.battery ? s.battery.percent / 100 : 0; th = c.percent / 100; val = s.battery ? `${s.battery.percent}%` : '—'; sub = s.battery ? (s.battery.charging ? 'đang cắm sạc' : 'đang dùng pin') : 'không thấy pin'; break;
      case 'net': { cap = 'Tốc độ mạng'; const top = Math.max(c.kbps * 4, ...spark.net, 1); v = Math.min(1, (s.net || 0) / top); th = c.kbps / top; val = S.kb(s.net); sub = `chờ xuống dưới ${c.kbps} KB/s`; break; }
      case 'cpu': cap = 'Máy đang dùng'; v = (s.cpu || 0) / 100; th = c.percent / 100; val = s.cpu == null ? '—' : `${Math.round(s.cpu)}%`; sub = `chờ xuống dưới ${c.percent}%`; break;
      case 'process': cap = 'Ứng dụng'; v = procRunning ? 1 : 0; val = !c.name.trim() ? '—' : procRunning == null ? '…' : procRunning ? 'Đang mở' : 'Chưa mở'; sub = c.name.trim() ? `“${c.name.trim()}”` : 'chưa chọn app'; break;
    }
    const g0 = 0.625, span = 0.75;
    body = `<path d="${arc(DC, DR, g0, g0 + span)}" fill="none" stroke-width="16" stroke-linecap="round" class="track"/>` +
      `<path class="arc" d="${arc(DC, DR, g0, g0 + span * Math.max(0.002, v))}" fill="none" stroke-width="16" stroke-linecap="round"/>`;
    if (th != null) { const [x0, y0] = pt(DC, DR - 16, g0 + span * th), [x1, y1] = pt(DC, DR + 16, g0 + span * th); body += `<line class="th" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>`; }
    cHtml = `<div class="cap">${cap}</div><div class="live num" style="font-size:${val.length > 7 ? 34 : 46}px">${esc(val)}</div><div class="sub">${esc(sub)}</div>`;
    const sp = $('#spark');
    if (sp) {
      const data = d.type === 'net' ? spark.net : d.type === 'cpu' ? spark.cpu : [];
      if (data.length > 1) {
        const top = d.type === 'cpu' ? 100 : Math.max(c.kbps * 4, ...data, 1), thr = d.type === 'cpu' ? c.percent : c.kbps;
        const pts = data.map((y, i) => `${(i / 59) * 280},${46 - (y / top) * 42}`).join(' ');
        const ty = 46 - (thr / top) * 42;
        sp.innerHTML = `${DEFS}<line x1="0" x2="280" y1="${ty}" y2="${ty}" class="th" style="stroke-width:1;stroke-dasharray:3 4"/><polyline points="${pts}" fill="none" stroke="url(#gMoon)" stroke-width="2" stroke-linejoin="round"/>`;
      } else sp.innerHTML = '';
    }
  }
  svg.innerHTML = DEFS + body;
  const focused = center.contains(document.activeElement);
  if (!focused || center.dataset.type !== d.type) { center.innerHTML = cHtml; center.dataset.type = d.type; }
  else { const sub = $('#dial-sub'); const tmp = document.createElement('div'); tmp.innerHTML = cHtml; const ns = tmp.querySelector('#dial-sub'); if (sub && ns) sub.textContent = ns.textContent; }
}

function bindDial() {
  const dial = $('#dial'); if (!dial || !dial.classList.contains('drag')) return;
  let prev = null;
  const angle = (e) => { const r = dial.getBoundingClientRect(); const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2; return { f: (Math.atan2(x, -y) / TAU + 1) % 1, dist: Math.hypot(x, y) / (r.width / 2) }; };
  const apply = (f) => {
    if (draft.type === 'countdown') {
      let { h, m } = draft.countdown;
      let nm = Math.round(f * 12) * 5 % 60;
      if (prev != null) { if (prev > 0.75 && f < 0.25) h = Math.min(23, h + 1); else if (prev < 0.25 && f > 0.75) { if (h > 0) h--; else nm = 0; } }
      if (h === 0 && prev != null && prev < 0.25 && f > 0.75) nm = 0;
      draft.countdown = { h, m: nm, s: 0 };
    } else if (draft.type === 'at') {
      const t = Math.round(f * 288) * 5 % 1440;
      draft.at = { h: Math.floor(t / 60), m: t % 60 };
    }
    prev = f; saveDraft(); renderDial(); updateSummary();
    document.querySelectorAll('.stage .chip').forEach((c) => c.classList.remove('on'));
  };
  dial.addEventListener('pointerdown', (e) => {
    if (e.target.closest('input')) return;
    const a = angle(e); if (a.dist < 0.62) return;
    dial.setPointerCapture(e.pointerId); prev = null;
    if (draft.type === 'countdown') prev = draft.countdown.m / 60;
    apply(a.f);
    const move = (ev) => apply(angle(ev).f);
    const up = () => { dial.removeEventListener('pointermove', move); dial.removeEventListener('pointerup', up); };
    dial.addEventListener('pointermove', move); dial.addEventListener('pointerup', up);
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
  return `<section class="view running">
    <div class="eyebrow rise">${greet()}</div>
    <div class="orb rise d1" id="orb"><svg viewBox="0 0 400 400" id="orb-svg"></svg>
      <div class="center"><div class="icon">${Icons[j.action]}</div><div class="big num" id="big"></div>
        <div class="what" id="what"></div><div class="src">${esc(sourceLabel(j.source))}</div></div></div>
    <div class="status-line" id="status-line"></div>
    <div class="controls rise d2" id="controls"></div>
    ${st.settings.dryRun ? '<div class="dry">Chế độ thử đang bật — đến giờ chỉ báo, máy không tắt thật</div>' : ''}
  </section>`;
}
let lastCtlKey = '';
function updateRunning() {
  const j = snap?.job, svg = $('#orb-svg'); if (!j || !svg) return;
  const orb = $('#orb'), big = $('#big'), what = $('#what'), line = $('#status-line');
  const C = 200, R = 168, a = S.ACTIONS[j.action].label;
  if (j.phase === 'countdown') {
    const f = j.totalMs ? Math.max(0, Math.min(1, j.remaining / j.totalMs)) : 0;
    const hot = j.remaining <= 60000, fin = j.remaining <= 10000;
    orb.classList.toggle('hot', hot && !fin); orb.classList.toggle('final', fin);
    const [ex, ey] = pt(C, R, f);
    svg.innerHTML = DEFS + ticks(C, 188, 60, 5, 4) +
      `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke-width="10" class="track"/>` +
      `<path d="${arc(C, R, 0, f)}" fill="none" stroke-width="10" stroke-linecap="round" stroke="url(#${hot ? 'gHot' : 'gMoon'})" style="filter:drop-shadow(0 0 12px var(--halo))"/>` +
      (f > 0.002 ? celestial(ex, ey, isDay(new Date(j.deadline).getHours()), 0.95, 'cel-run') : '');
    if (big.dataset.mode !== 'c') { big.innerHTML = ''; big.dataset.t = ''; big.dataset.mode = 'c'; }
    roll(big, S.clock(j.remaining));
    what.innerHTML = j.fromCondition ? `<b>${esc(a)}</b> · điều kiện đã thoả` : `<b>${esc(a)}</b> lúc ${S.hhmm(j.deadline)} ${S.dayWord(j.deadline)}`;
    line.textContent = j.fromCondition ? 'Còn dùng máy thì chạm chuột hoặc bấm Huỷ' : `còn ${S.human(j.remaining)}`;
  } else {
    orb.classList.remove('hot', 'final');
    const w = watchValue(j), p = Math.max(0, Math.min(1, w.p));
    svg.innerHTML = DEFS + `<g class="orbit"><circle cx="${C}" cy="${C}" r="188" fill="none" stroke-width="1.5" style="stroke:var(--line-2)" stroke-dasharray="2 10"/><circle cx="${C}" cy="12" r="4" style="fill:var(--moon);filter:drop-shadow(0 0 6px var(--moon))"/></g>` +
      `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke-width="10" class="track"/>` +
      `<path d="${arc(C, R, 0, p)}" fill="none" stroke-width="10" stroke-linecap="round" stroke="url(#gMoon)"/>`;
    big.dataset.mode = 'w'; big.dataset.t = '';
    big.innerHTML = `${esc(w.main)}${w.sub ? `<small>${esc(w.sub)}</small>` : ''}`;
    big.style.fontSize = w.main.length > 8 ? '48px' : '';
    what.innerHTML = `<b>${esc(a)}</b> ${esc(S.triggerText(j.trigger))}`;
    const t = j.trigger;
    line.textContent = (t.type === 'net' || t.type === 'cpu') ? (j.satisfiedMs ? `Đã yên ${S.clock(j.satisfiedMs)} / ${S.clock(j.need)}, sau đó chờ thêm ${st.settings.graceSeconds} giây` : (t.type === 'net' ? 'Mạng vẫn đang chạy' : 'Máy vẫn đang bận'))
      : t.type === 'process' ? 'Đang chờ app đóng lại' : t.type === 'battery' ? (snap.sensors.battery?.charging ? 'Đang cắm sạc nên tạm chờ' : 'Đang chạy bằng pin') : 'Bạn chạm chuột là đếm lại';
  }
  const key = j.id + j.phase;
  if (key !== lastCtlKey) {
    lastCtlKey = key;
    $('#controls').innerHTML = (j.phase === 'countdown' ? `<div class="bgroup"><span>Hoãn</span><button data-post="5">5 phút</button><button data-post="15">15 phút</button><button data-post="60">1 giờ</button></div>` : '') +
      `<button class="btn ghost" data-do="now">${esc(a)} ngay</button><button class="btn danger" data-do="cancel">Huỷ hẹn</button>`;
  }
}

// ---------- 02 Preset ----------
function viewPresets() {
  const rows = st.presets.map((p, i) => `
    <div class="item" style="animation-delay:${i * 40}ms">
      <div class="ico">${Icons[p.action]}</div>
      <div>${renaming === p.id
        ? `<div class="pname"><input data-rename-input="${p.id}" value="${esc(p.name)}" maxlength="40"></div>`
        : `<div class="pname" data-rename="${p.id}" title="Nhấp đúp để đổi tên">${esc(p.name)}</div>`}
        <div class="pdesc">${esc(S.describe(p.action, p.trigger))}</div></div>
      <span class="tag">${S.TRIGGERS[p.trigger.type]}</span>
      <button class="btn small" data-run="${p.id}">${Icons.play} Chạy</button>
      <button class="icon-btn" data-del-preset="${p.id}" title="Xoá">${Icons.trash}</button>
    </div>`).join('');
  return `<section class="view presets">
    <div class="head"><div><div class="eyebrow">Preset</div><h1>Những kiểu hẹn bạn hay dùng</h1></div></div>
    <div class="list">${rows || '<div class="empty">Chưa có preset nào. Hẹn xong ở màn Hẹn giờ thì bấm “Lưu làm preset”.</div>'}</div>
    <p class="note" style="margin-top:16px">Nhấp đúp vào tên để đổi. Preset cũng nằm sẵn trong menu ở khay hệ thống.</p>
  </section>`;
}

// ---------- 03 Lịch lặp ----------
function viewSchedules() {
  const days = (arr, id) => [1, 2, 3, 4, 5, 6, 0].map((d) =>
    `<button class="day ${arr.includes(d) ? 'on' : ''}" ${id ? `data-sday="${id}:${d}"` : `data-nday="${d}"`}>${S.DAYS[d]}</button>`).join('');
  const rows = st.schedules.map((sc, i) => {
    const next = snap?.next?.find((n) => n.id === sc.id)?.at;
    return `<div class="item ${sc.enabled ? '' : 'off'}" style="animation-delay:${i * 40}ms">
      <span class="stime num">${sc.time}</span>
      <div><div class="days" style="margin-bottom:8px">${days(sc.days, sc.id)}</div>
        <div class="pdesc"><b style="color:var(--ink);font-weight:600">${S.ACTIONS[sc.action].label}</b> · ${sc.enabled ? (next ? `lần tới ${S.dayWord(next)} ${S.hhmm(next)}` : 'chưa chọn ngày') : 'đang tắt'}</div></div>
      <button class="switch ${sc.enabled ? 'on' : ''}" data-stoggle="${sc.id}" title="Bật/tắt"></button>
      <button class="icon-btn" data-sdel="${sc.id}" title="Xoá">${Icons.trash}</button>
    </div>`;
  }).join('');
  return `<section class="view sched">
    <div class="head"><div><div class="eyebrow">Lịch lặp</div><h1>Tắt máy đều đặn mỗi tối</h1></div></div>
    <div class="card adder">
      <div><div class="label">Giờ</div><div class="time-in"><input class="num" data-dial="sched.h" data-max="23" value="${pad(sched.h)}" maxlength="2"><span class="sep">:</span><input class="num" data-dial="sched.m" data-max="59" value="${pad(sched.m)}" maxlength="2"></div></div>
      <div><div class="label">Ngày</div><div class="days">${days(sched.days)}</div></div>
      <div><div class="label">Hành động</div><select class="select" data-sact>${ORDER.map((k) => `<option value="${k}" ${sched.action === k ? 'selected' : ''}>${S.ACTIONS[k].label}</option>`).join('')}</select></div>
      <button class="btn primary" data-do="sched-add">${Icons.plus} Thêm lịch</button>
    </div>
    <div class="list">${rows || '<div class="empty">Chưa có lịch nào. Chọn giờ và ngày ở trên rồi bấm Thêm lịch.</div>'}</div>
    <p class="note" style="margin-top:16px">Lịch chỉ chạy khi Nghỉ đang mở, kể cả lúc ẩn dưới khay. Bật “Mở cùng máy” trong Cài đặt cho chắc.</p>
  </section>`;
}

// ---------- 04 Nhật ký ----------
function viewHistory() {
  const badge = { done: '<span class="tag ok">Đã thực hiện</span>', cancel: '<span class="tag">Đã huỷ</span>', dry: '<span class="tag lamp">Thử</span>', error: '<span class="tag err">Lỗi</span>', pending: '<span class="tag">…</span>' };
  const rows = st.history.map((h) => {
    const d = new Date(h.at);
    return `<tr><td class="num">${pad(d.getDate())}/${pad(d.getMonth() + 1)} · ${S.hhmm(h.at)}</td>
      <td><b style="font-weight:600">${S.ACTIONS[h.action]?.label || h.action}</b><div class="sub">${esc(S.triggerText(h.trigger))}</div></td>
      <td class="dim">${esc(sourceLabel(h.source))}</td>
      <td>${badge[h.result] || ''}${h.note && h.note !== 'Đã huỷ' ? `<div class="sub">${esc(h.note)}</div>` : ''}</td></tr>`;
  }).join('');
  return `<section class="view">
    <div class="head"><div><div class="eyebrow">Nhật ký</div><h1>Đã làm gì, lúc nào</h1></div>
      ${st.history.length ? '<button class="btn ghost small" data-do="hist-clear">Xoá nhật ký</button>' : ''}</div>
    ${rows ? `<table class="hist"><thead><tr><th>Thời gian</th><th>Hành động</th><th>Nguồn</th><th>Kết quả</th></tr></thead><tbody>${rows}</tbody></table>`
      : '<div class="empty">Chưa có lần hẹn nào. Hẹn xong sẽ thấy ở đây.</div>'}
  </section>`;
}

// ---------- 05 Cài đặt ----------
function seg(key, opts) {
  const v = st.settings[key];
  return `<div class="seg">${opts.map(([val, l]) => `<button class="${v === val ? 'on' : ''}" data-set="${key}" data-val='${JSON.stringify(val)}'>${l}</button>`).join('')}</div>`;
}
function sw(key) { return `<button class="switch ${st.settings[key] ? 'on' : ''}" data-set="${key}" data-val='${JSON.stringify(!st.settings[key])}'></button>`; }
function setRow(title, desc, ctl) { return `<div class="set"><div><b>${title}</b>${desc ? `<p>${desc}</p>` : ''}</div>${ctl}</div>`; }
function viewSettings() {
  const capWord = { yes: ['Được', 'yes'], challenge: ['Cần mật khẩu', ''], no: ['Không', 'no'], na: ['Không hỗ trợ', 'no'], unknown: ['Chưa rõ', ''] };
  return `<section class="view">
    <div class="head"><div><div class="eyebrow">Cài đặt</div><h1>Tuỳ chỉnh Nghỉ</h1></div></div>
    <div class="card group"><h2>Cảnh báo</h2>
      ${setRow('Báo trước', 'Một cửa sổ nhỏ hiện ở góc màn hình để bạn kịp hoãn hoặc huỷ.', seg('warnMinutes', [[0, 'Không'], [1, '1 phút'], [2, '2 phút'], [5, '5 phút'], [10, '10 phút']]))}
      ${setRow('Chờ thêm sau khi xong việc', 'Với kiểu hẹn “Khi xong việc”, Nghỉ chờ thêm một chút rồi mới làm.', seg('graceSeconds', [[30, '30 giây'], [60, '60 giây'], [120, '2 phút']]))}
      ${setRow('Âm báo', 'Chuông nhẹ lúc báo trước và trong 10 giây cuối.', sw('sound'))}
      ${setRow('Chế độ thử', 'Đến giờ chỉ hiện thông báo, máy không tắt thật. Hợp để thử lịch.', sw('dryRun'))}
    </div>
    <div class="card group"><h2>Ứng dụng</h2>
      ${setRow('Giao diện', 'Đêm có bầu trời sao; Sáng phẳng và gọn cho ban ngày.', seg('theme', [['dark', 'Đêm'], ['light', 'Sáng'], ['system', 'Theo hệ thống']]))}
      ${setRow('Đóng cửa sổ thì ẩn xuống khay', 'Hẹn giờ vẫn chạy. Muốn thoát hẳn thì mở menu ở khay.', sw('closeToTray'))}
      ${setRow('Mở cùng máy', 'Tự mở khi bạn đăng nhập để lịch luôn chạy.', sw('autostart'))}
      ${setRow('Mở lên là ẩn luôn', 'Không hiện cửa sổ, chỉ nằm dưới khay.', sw('startMinimized'))}
    </div>
    <div class="card group"><h2>Nâng cao</h2>
      ${setRow('Lệnh chạy trước', 'Chạy lệnh này ngay trước khi làm, tối đa 30 giây. Ví dụ <span style="font-family:var(--mono)">playerctl pause</span> để dừng nhạc.', `<input class="mono" data-text="preCommand" value="${esc(st.settings.preCommand)}" placeholder="(để trống)" spellcheck="false">`)}
      <div class="set" style="display:block"><b>Ubuntu có cho phép không</b>
        <div class="caps" style="margin-top:10px">${ORDER.map((k) => { const c = capWord[st.caps?.[k]] || capWord.unknown; return `<div><span>${S.ACTIONS[k].label}</span><span class="${c[1]}">${c[0]}</span></div>`; }).join('')}</div></div>
    </div>
    <p class="note">Nghỉ 1.1 · dữ liệu lưu tại ~/.config/Nghỉ/nghi.json</p>
  </section>`;
}

// ---------- Sự kiện ----------
async function start(action, trig, source) {
  const r = await nghi.start(action, trig, source);
  if (!r.ok) toast(r.error, true); else toast(`Đã hẹn: ${S.describe(action, trig)}`);
}
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [data-rename], .mini');
  if (!t) return;
  const ds = t.dataset;
  if (ds.win) return nghi.win(ds.win);
  if (ds.view) { view = ds.view; savingPreset = false; renaming = null; if (view === 'timer' && draft.type === 'process') loadProcs(); return render(); }
  if (ds.action) { draft.action = ds.action; saveDraft(); return render(); }
  if (ds.mode) { draft.type = ds.mode === 'cond' ? (draft.condType || 'idle') : ds.mode; saveDraft(); if (draft.type === 'process') loadProcs(); return render(); }
  if (ds.type) { draft.type = ds.type; draft.condType = ds.type; saveDraft(); if (ds.type === 'process') loadProcs(); return render(); }
  if (ds.chip) { const v = +ds.chip; draft.countdown = { h: Math.floor(v / 60), m: v % 60, s: 0 }; saveDraft(); return render(); }
  if (ds.chipAt) { const [h, m] = ds.chipAt.split(':').map(Number); draft.at = { h, m }; saveDraft(); return render(); }
  if (ds.post) return nghi.postpone(+ds.post);
  if (ds.run) { const p = st.presets.find((x) => x.id === ds.run); if (p) { await start(p.action, p.trigger, `preset:${p.id}`); view = 'timer'; render(); } return; }
  if (ds.delPreset) return nghi.setPresets(st.presets.filter((p) => p.id !== ds.delPreset));
  if (ds.set) return nghi.setSettings({ [ds.set]: JSON.parse(ds.val) });
  if (ds.nday) { const d = +ds.nday; sched.days = sched.days.includes(d) ? sched.days.filter((x) => x !== d) : [...sched.days, d]; return render(); }
  if (ds.sday) {
    const [id, d] = ds.sday.split(':');
    return nghi.setSchedules(st.schedules.map((s) => s.id !== id ? s : { ...s, days: s.days.includes(+d) ? s.days.filter((x) => x !== +d) : [...s.days, +d], lastArmed: 0 }));
  }
  if (ds.stoggle) return nghi.setSchedules(st.schedules.map((s) => s.id === ds.stoggle ? { ...s, enabled: !s.enabled, lastArmed: 0 } : s));
  if (ds.sdel) return nghi.setSchedules(st.schedules.filter((s) => s.id !== ds.sdel));
  switch (ds.do) {
    case 'start': return start(draft.action, trigger(), 'manual');
    case 'cancel': await nghi.cancel(); return toast('Đã huỷ, máy cứ chạy tiếp');
    case 'now': return nghi.now();
    case 'preset-new': savingPreset = true; return render();
    case 'preset-cancel': savingPreset = false; return render();
    case 'preset-save': return savePreset();
    case 'hist-clear': return nghi.clearHistory();
    case 'sched-add': {
      if (!sched.days.length) return toast('Chọn ít nhất một ngày nhé', true);
      const id = Math.random().toString(16).slice(2, 12);
      await nghi.setSchedules([...st.schedules, { id, time: `${pad(sched.h)}:${pad(sched.m)}`, days: [...sched.days].sort(), action: sched.action, enabled: true, lastArmed: 0 }]);
      return toast(`Đã thêm lịch ${pad(sched.h)}:${pad(sched.m)}`);
    }
  }
});
document.addEventListener('dblclick', (e) => { const t = e.target.closest('[data-rename]'); if (t) { renaming = t.dataset.rename; render(); } });
function commitRename(input) {
  const name = input.value.trim(), id = input.dataset.renameInput;
  renaming = null;
  if (name) nghi.setPresets(st.presets.map((p) => p.id === id ? { ...p, name } : p)); else render();
}
async function savePreset() {
  const name = $('#preset-name')?.value.trim();
  if (!name) return toast('Bạn đặt tên cho preset nhé', true);
  const t = trigger();
  if (t.type === 'countdown' && !t.seconds) return toast('Chọn thời gian lớn hơn 0 nhé', true);
  savingPreset = false;
  await nghi.setPresets([...st.presets, { id: Math.random().toString(16).slice(2, 12), name, action: draft.action, trigger: t }]);
  toast(`Đã lưu preset “${name}”`);
}
function setDial(input, val) {
  const [scope, key] = input.dataset.dial.split('.');
  const v = Math.max(0, Math.min(+input.dataset.max, Number.isFinite(val) ? val : 0));
  if (scope === 'sched') sched[key] = v; else { draft[scope][key] = v; if (scope === 'countdown') draft.countdown.s = 0; saveDraft(); }
  return v;
}
const fmtDial = (input, v) => (input.dataset.dial === 'countdown.h' ? String(v) : pad(v));
function dialChanged() { if (view === 'timer') { renderDial(); updateSummary(); document.querySelectorAll('.stage .chip').forEach((c) => c.classList.remove('on')); } }
document.addEventListener('input', (e) => {
  const t = e.target;
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
  if (t.dataset.text) nghi.setSettings({ [t.dataset.text]: t.value });
  if ('sact' in t.dataset) sched.action = t.value;
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
  if (e.ctrlKey && /^[1-5]$/.test(e.key)) { view = VIEWS[+e.key - 1][0]; savingPreset = false; render(); return; }
  if (e.key === 'Enter' && view === 'timer' && !snap?.job && t.tagName !== 'BUTTON') start(draft.action, trigger(), 'manual');
});

// ---------- Tiến trình ----------
async function loadProcs() { procList = await nghi.processes(); const dl = $('#procs'); if (dl) dl.innerHTML = procList.map((p) => `<option value="${esc(p)}">`).join(''); checkProc(); }
let procTimer;
function checkProc() {
  clearTimeout(procTimer);
  procTimer = setTimeout(async () => { const n = draft.process.name.trim(); procRunning = n ? await nghi.checkProcess(n) : null; renderDial(); }, 250);
}

// ---------- Khởi động ----------
(async function boot() {
  const ctl = document.querySelectorAll('.winctl button');
  ctl[0].innerHTML = Icons.min; ctl[1].innerHTML = Icons.max; ctl[2].innerHTML = Icons.close;
  $('#brand-ico').innerHTML = Icons.moon;
  st = await nghi.getState();
  snap = { job: st.job, sensors: st.sensors, next: st.next };
  draft = initDraft(st.draft);
  render();
  if (draft.type === 'process') loadProcs();

  nghi.onState((s) => {
    const hadJob = !!snap?.job;
    st = s; snap = { job: s.job, sensors: s.sensors, next: s.next };
    if (!hadJob && s.job) view = 'timer';
    lastCtlKey = '';
    const active = document.activeElement;
    if (active && active.matches('input.mono')) { renderRail(); return; }
    render();
  });

  let tickN = 0;
  nghi.onTick((s) => {
    const changed = !!snap?.job !== !!s.job || snap?.job?.phase !== s.job?.phase || snap?.job?.id !== s.job?.id;
    snap = s;
    if (s.sensors.cpu != null) { spark.cpu.push(s.sensors.cpu); if (spark.cpu.length > 60) spark.cpu.shift(); }
    if (s.sensors.net != null) { spark.net.push(s.sensors.net); if (spark.net.length > 60) spark.net.shift(); }
    if (changed && view === 'timer') { lastCtlKey = ''; return render(); }
    renderMini();
    tickN++;
    if (view === 'timer') {
      if (s.job) updateRunning();
      else { if (isCond(draft.type) || draft.type === 'at' || tickN % 15 === 0) renderDial(); if (tickN % 15 === 0) { updateSummary(); const g = $('#greet'); if (g) g.textContent = greet(); } }
    }
    if (draft.type === 'process' && view === 'timer' && !s.job && tickN % 3 === 0) checkProc();
  });
})();
