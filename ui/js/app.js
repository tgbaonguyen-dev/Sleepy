/* global Shared, Icons, Dropdown, Ambient, sleepy */
const S = Shared;
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = S.pad;
const TAU = Math.PI * 2;

let st = null, snap = null, view = 'timer', draft = null;
let procList = [], procRunning = null, savingPreset = false, renaming = null, editingSched = null, histFilter = 'all';
const spark = { cpu: [], net: [] };
// Danh sách dài (preset, lịch lặp, nhật ký) không bao giờ cuộn: mỗi trang chỉ chứa số dòng vừa khung,
// số đó được đo lại sau mỗi lần vẽ / đổi cỡ cửa sổ (xem fitPages).
const pages = { presets: { page: 0, per: 8 }, schedules: { page: 0, per: 6 }, history: { page: 0, per: 10 } };
const sched = { h: 23, m: 30, days: [1, 2, 3, 4, 5], action: 'shutdown' };

const VIEWS = [['timer', 'Hẹn giờ', 'timer'], ['sounds', 'Âm thanh', 'sound'], ['presets', 'Preset', 'bookmark'], ['schedules', 'Lịch lặp', 'repeat'], ['history', 'Nhật ký', 'history'], ['settings', 'Cài đặt', 'gear']];
const ORDER = ['shutdown', 'reboot', 'suspend', 'hibernate', 'lock', 'logout'];
const CONDS = [['idle', 'Không hoạt động'], ['net', 'Lưu lượng mạng'], ['cpu', 'Mức sử dụng CPU'], ['process', 'Ứng dụng kết thúc'], ['battery', 'Mức pin']];
const isCond = (t) => !['countdown', 'at'].includes(t);
Dropdown.define('action', ORDER.map((k) => ({ value: k, label: S.ACTIONS[k].label, icon: Icons[k] })));
Dropdown.define('sfilter', [
  { value: 'all', label: 'Tất cả danh mục', icon: Icons.sound },
  { value: 'active', label: 'Đang phát', icon: Icons.play },
  { value: 'rain', label: 'Mưa', icon: Icons.rain },
  { value: 'nature', label: 'Thiên nhiên', icon: Icons.wind },
  { value: 'animals', label: 'Đêm', icon: Icons.crickets },
  { value: 'noise', label: 'Ồn & Não', icon: Icons.brown },
  { value: 'places', label: 'Không gian', icon: Icons.lofi },
]);
const HIST_FILTERS = [
  { value: 'all', label: 'Tất cả', icon: Icons.history },
  { value: 'done', label: 'Đã thực hiện', icon: Icons.check },
  { value: 'cancel', label: 'Đã huỷ', icon: Icons.close },
  { value: 'error', label: 'Lỗi', icon: Icons.alert },
  { value: 'dry', label: 'Chạy thử', icon: Icons.timer },
];
Dropdown.define('hfilter', HIST_FILTERS);

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

// Plain endpoint shared by setup and running dials.
const isDay = (h) => h >= 6 && h < 18;
function celestial(x, y, _day, s = 1, cls = 'handle-g') {
  return `<g class="${cls}" style="transform-origin:${x}px ${y}px"><circle cx="${x}" cy="${y}" r="${7 * s}" class="dial-dot"/></g>`;
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
const UNDO_MAX = 20;
const undoStack = [];
let activeToastBatch = null;
const pendingDeletes = new Set();

function clearToast() {
  const t = $('#toast');
  clearTimeout(t._t);
  t.className = 'toast';
  t._act = null;
  activeToastBatch = null;
}
function toast(msg, opts = false) {
  const o = typeof opts === 'boolean' ? { err: opts } : (opts || {});
  const t = $('#toast');
  if (o.undo && !o._fromStack) {
    undoStack.push({ type: 'custom', run: o.undo });
    if (undoStack.length > UNDO_MAX) undoStack.shift();
  }
  if (!o._keepBatch) activeToastBatch = null;
  const cleanMsg = o.action ? String(msg).replace(/\.$/, '') : String(msg);
  t.setAttribute('role', o.err ? 'alert' : 'status');
  t.innerHTML = `<span class="toast-msg">${esc(cleanMsg)}</span>` +
    (o.action ? `<button class="toast-act" data-toast-act>${esc(o.action)}</button>` : '') +
    `<button class="toast-x" data-toast-close aria-label="Đóng thông báo">×</button>`;
  t._act = o.onAction || (o._fromStack ? () => runUndo() : o.undo) || null;
  t.className = 'toast show' + (o.err ? ' err' : '') + (o.action ? ' has-act' : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.className = 'toast'; t._act = null; activeToastBatch = null; }, o.action ? 6000 : 4000);
}
function pushDeleteUndo(kind, item, index) {
  const op = { type: 'delete', kind, item, index };
  const t = $('#toast');
  const canMerge = t?.classList.contains('show') && activeToastBatch && activeToastBatch.kind === kind && undoStack[undoStack.length - 1] === activeToastBatch.entry;
  let entry;
  if (canMerge) {
    entry = activeToastBatch.entry;
    entry.ops.push(op);
  } else {
    entry = { type: 'delete-batch', kind, ops: [op] };
    undoStack.push(entry);
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    activeToastBatch = { kind, entry };
  }
  const n = entry.ops.length;
  const msg = kind === 'preset'
    ? (n === 1 ? `Đã xoá preset "${item.name}"` : `Đã xoá ${n} preset`)
    : (n === 1 ? `Đã xoá lịch ${item.time}` : `Đã xoá ${n} lịch`);
  toast(msg, { action: 'Hoàn tác', _fromStack: true, _keepBatch: true });
}
async function runUndo() {
  if (!undoStack.length) return false;
  const entry = undoStack.pop();
  clearToast();
  if (entry.type === 'custom') {
    await entry.run();
    return true;
  }
  if (entry.type === 'delete-batch') {
    const { kind, ops } = entry;
    if (kind === 'preset') {
      const next = [...st.presets];
      for (let i = ops.length - 1; i >= 0; i--) {
        const { item, index } = ops[i];
        if (!next.some((x) => x.id === item.id)) {
          const pos = Math.max(0, Math.min(index, next.length));
          next.splice(pos, 0, item);
        }
      }
      st.presets = next;
      await sleepy.setPresets(next);
      render();
      toast(ops.length === 1 ? `Đã khôi phục "${ops[0].item.name}"` : `Đã khôi phục ${ops.length} preset`);
    } else if (kind === 'schedule') {
      const next = [...st.schedules];
      for (let i = ops.length - 1; i >= 0; i--) {
        const { item, index } = ops[i];
        if (!next.some((x) => x.id === item.id)) {
          const pos = Math.max(0, Math.min(index, next.length));
          next.splice(pos, 0, item);
        }
      }
      st.schedules = next;
      await sleepy.setSchedules(next);
      render();
      toast(ops.length === 1 ? `Đã khôi phục lịch ${ops[0].item.time}` : `Đã khôi phục ${ops.length} lịch`);
    }
    return true;
  }
  return false;
}
function collapseRow(sel) {
  const el = $(sel);
  if (!el || reduceMotion.matches) return Promise.resolve();
  el.style.maxHeight = `${el.offsetHeight}px`;
  el.getBoundingClientRect();
  el.classList.add('row-removing');
  return new Promise((r) => setTimeout(r, 200));
}
function focusAfterDelete(kind, nextId, prevId) {
  requestAnimationFrame(() => {
    if (kind === 'preset') {
      const target = (nextId && $(`[data-pmenu="${nextId}"]`)) || (prevId && $(`[data-pmenu="${prevId}"]`)) || $('.presets .empty [data-view="timer"]');
      target?.focus({ preventScroll: true });
    } else if (kind === 'schedule') {
      const target = (nextId && $(`[data-smenu="${nextId}"]`)) || (prevId && $(`[data-smenu="${prevId}"]`)) || $('[data-dial="sched.h"]');
      target?.focus({ preventScroll: true });
    }
  });
}
async function deletePreset(id) {
  const key = `p:${id}`;
  if (pendingDeletes.has(key)) return;
  const curIdx = st.presets.findIndex((p) => p.id === id);
  if (curIdx < 0) return;
  const nextId = st.presets[curIdx + 1]?.id || null;
  const prevId = st.presets[curIdx - 1]?.id || null;
  pendingDeletes.add(key);
  try {
    await collapseRow(`[data-key="p-${id}"]`);
    const idx = st.presets.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const removed = st.presets[idx];
    const next = [...st.presets.slice(0, idx), ...st.presets.slice(idx + 1)];
    st.presets = next;
    await sleepy.setPresets(next);
    render();
    pushDeleteUndo('preset', removed, idx);
    focusAfterDelete('preset', nextId, prevId);
  } finally {
    pendingDeletes.delete(key);
  }
}
async function deleteSchedule(id) {
  const key = `s:${id}`;
  if (pendingDeletes.has(key)) return;
  const curIdx = st.schedules.findIndex((s) => s.id === id);
  if (curIdx < 0) return;
  const nextId = st.schedules[curIdx + 1]?.id || null;
  const prevId = st.schedules[curIdx - 1]?.id || null;
  pendingDeletes.add(key);
  try {
    await collapseRow(`[data-key="s-${id}"]`);
    const idx = st.schedules.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const removed = st.schedules[idx];
    const next = [...st.schedules.slice(0, idx), ...st.schedules.slice(idx + 1)];
    st.schedules = next;
    await sleepy.setSchedules(next);
    render();
    pushDeleteUndo('schedule', removed, idx);
    focusAfterDelete('schedule', nextId, prevId);
  } finally {
    pendingDeletes.delete(key);
  }
}

// Popover xác nhận nhẹ neo vào nút kích hoạt (không dùng window.confirm)
let confirmPop = null;
function closeConfirm(refocus = false) {
  if (!confirmPop) return;
  const { el, trigger } = confirmPop;
  confirmPop = null;
  el.remove();
  if (refocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
}
function placePopover(pop, trigger, preferUp = false) {
  const r = trigger.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  const up = preferUp
    ? (r.top > ph + 16 && (window.innerHeight - r.bottom < ph + 16 || !!trigger.closest('.bar, .controls')))
    : (window.innerHeight - r.bottom < ph + 12 && r.top > ph + 12);
  const top = up ? r.top - ph - 8 : r.bottom + 8;
  const left = Math.max(8, Math.min(r.right - pw, window.innerWidth - pw - 8));
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(Math.max(8, Math.min(top, window.innerHeight - ph - 8)))}px`;
}
function openConfirm(trigger, { title, confirmLabel, danger = true, onConfirm }) {
  closeConfirm(false);
  const pop = document.createElement('div');
  pop.className = 'cpop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-modal', 'false');
  pop.innerHTML = `<div class="cpop-t">${esc(title)}</div><div class="cpop-a">
    <button class="btn ghost small" data-cpop-cancel>Huỷ</button>
    <button class="btn small ${danger ? 'danger-solid' : 'primary'}" data-cpop-ok>${esc(confirmLabel)}</button>
  </div>`;
  document.body.appendChild(pop);
  placePopover(pop, trigger, true);
  confirmPop = { el: pop, trigger, onConfirm };
  pop.querySelector('[data-cpop-cancel]').focus({ preventScroll: true });
  pop.addEventListener('click', (e) => {
    if (e.target.closest('[data-cpop-cancel]')) closeConfirm(true);
    else if (e.target.closest('[data-cpop-ok]')) { const fn = onConfirm; closeConfirm(false); fn(); }
  });
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeConfirm(true); }
    else if (e.key === 'Tab') {
      const btns = [...pop.querySelectorAll('button')];
      const idx = btns.indexOf(document.activeElement);
      e.preventDefault();
      btns[(idx + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
    }
  });
}
function openErrorHelp(trigger, note) {
  closeConfirm(false);
  const pop = document.createElement('div');
  pop.className = 'cpop cpop-help';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Cách khắc phục quyền tắt máy');
  pop.innerHTML = `<div class="cpop-t">Cách cấp quyền tắt máy</div>
    <p class="cpop-p">${note ? `${esc(note)}. ` : ''}Sleepy dùng <code>systemd-logind</code> để thực hiện lệnh nguồn. Hãy chạy trong phiên desktop cục bộ đang hoạt động, hoặc cấp quyền <code>polkit</code> cho <code>org.freedesktop.login1.power-off</code>.</p>
    <div class="cpop-a"><button class="btn small" data-cpop-cancel>Đóng</button></div>`;
  document.body.appendChild(pop);
  placePopover(pop, trigger, false);
  confirmPop = { el: pop, trigger };
  pop.querySelector('[data-cpop-cancel]').focus({ preventScroll: true });
  pop.addEventListener('click', (e) => { if (e.target.closest('[data-cpop-cancel]')) closeConfirm(true); });
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeConfirm(true); }
  });
}
function openActionMenu(trigger, items, onPick) {
  closeConfirm(false);
  const pop = document.createElement('div');
  pop.className = 'cpop pmenu';
  pop.setAttribute('role', 'menu');
  pop.innerHTML = items.map((it) => `<button role="menuitem" class="${it.danger ? 'danger' : ''}" data-pm="${it.id}">${esc(it.label)}</button>`).join('');
  document.body.appendChild(pop);
  placePopover(pop, trigger, false);
  confirmPop = { el: pop, trigger };
  pop.querySelector('button')?.focus({ preventScroll: true });
  pop.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pm]');
    if (!b) return;
    const act = b.dataset.pm;
    closeConfirm(false);
    await onPick(act);
  });
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeConfirm(true); }
    else if (e.key === 'Tab') { e.preventDefault(); closeConfirm(true); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const btns = [...pop.querySelectorAll('button')];
      const i = btns.indexOf(document.activeElement);
      e.preventDefault();
      btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length].focus();
    }
  });
}
function openPresetMenu(trigger, p) {
  openActionMenu(trigger, [
    { id: 'rename', label: 'Đổi tên' },
    { id: 'edit', label: 'Sửa' },
    { id: 'dup', label: 'Nhân bản' },
    { id: 'del', label: 'Xoá', danger: true },
  ], async (act) => {
    if (act === 'rename') { renaming = p.id; render(); }
    else if (act === 'edit') {
      draft = initDraft({ action: p.action, trigger: p.trigger });
      saveDraft();
      view = 'timer';
      render();
      toast(`Đã nạp "${p.name}" vào Hẹn giờ`);
    } else if (act === 'dup') {
      const copy = { ...p, id: Math.random().toString(16).slice(2, 12), name: `${p.name} (bản sao)` };
      await sleepy.setPresets([...st.presets, copy]);
      toast(`Đã nhân bản "${p.name}"`);
    } else if (act === 'del') {
      await deletePreset(p.id);
    }
  });
}
function openScheduleMenu(trigger, sc) {
  openActionMenu(trigger, [
    { id: 'edit', label: 'Sửa giờ' },
    { id: 'dup', label: 'Nhân bản' },
    { id: 'del', label: 'Xoá', danger: true },
  ], async (act) => {
    if (act === 'edit') {
      editingSched = sc.id;
      render();
      const inp = $(`[data-stime-edit="${sc.id}"] input[data-se="h"]`);
      if (inp) { inp.focus({ preventScroll: true }); inp.select(); }
    } else if (act === 'dup') {
      const copy = { ...sc, id: Math.random().toString(16).slice(2, 12), days: [...sc.days], lastArmed: 0 };
      await sleepy.setSchedules([...st.schedules, copy]);
      toast(`Đã nhân bản lịch ${sc.time}`);
    } else if (act === 'del') {
      await deleteSchedule(sc.id);
    }
  });
}
function openHistoryMenu(trigger) {
  openActionMenu(trigger, [
    { id: 'clear', label: 'Xoá nhật ký…', danger: true },
  ], (act) => {
    if (act === 'clear') {
      const n = st.history.length;
      if (!n) return;
      openConfirm(trigger, {
        title: `Xoá ${n} mục nhật ký?`,
        confirmLabel: `Xoá ${n} mục`,
        danger: true,
        onConfirm: () => sleepy.clearHistory().then(() => toast(`Đã xoá ${n} mục nhật ký`)),
      });
    }
  });
}
document.addEventListener('pointerdown', (e) => {
  if (confirmPop && !confirmPop.el.contains(e.target) && !confirmPop.trigger.contains(e.target)) closeConfirm(false);
  const hb = e.target.closest?.('[data-hold-now]');
  if (!hb || e.button !== 0) return;
  const startAt = performance.now();
  const DUR = 800;
  let raf = 0;
  const stop = (done) => {
    cancelAnimationFrame(raf);
    hb.style.removeProperty('--hold');
    hb.classList.remove('holding');
    removeEventListener('pointerup', onEnd);
    removeEventListener('pointercancel', onEnd);
    hb.removeEventListener('pointerleave', onEnd);
    if (done) { hb._heldDone = true; sleepy.now(); }
  };
  const onEnd = () => stop(false);
  hb.classList.add('holding');
  const tick = (now) => {
    const p = Math.min(1, (now - startAt) / DUR);
    hb.style.setProperty('--hold', `${(p * 100).toFixed(1)}%`);
    if (p >= 1) stop(true);
    else raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  addEventListener('pointerup', onEnd);
  addEventListener('pointercancel', onEnd);
  hb.addEventListener('pointerleave', onEnd);
}, true);
function sourceLabel(src) {
  if (!src || src === 'manual') return 'Bắt đầu thủ công';
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
    const activeCh = Ambient.channels.filter((c) => c.active).length;
    if (Ambient.playing && activeCh) {
      el.hidden = false;
      el.dataset.view = 'sounds';
      el.className = 'mini';
      morph(el, `<span class="mini-ico">${Icons.sound}</span><div class="v num">${activeCh} kênh</div><div class="d">Đang phát</div>`);
      return;
    }
    el.hidden = true;
    el.className = 'mini idle';
    morph(el, '');
    return;
  }
  el.hidden = false;
  el.dataset.view = 'timer';
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
function sysBannerHtml() {
  if (!st?.settings?.dryRun) return '';
  return `<div class="sys-banner" data-key="sys-banner" role="status"><span>Chế độ thử đang bật · Hành động sẽ không được thực hiện.</span><button class="sys-banner-btn" data-set="dryRun" data-val="false">Tắt chế độ thử</button></div>`;
}
function draw() {
  renderRail();
  const main = $('#main');
  const html = () => sysBannerHtml() + ({ timer: () => (snap?.job ? viewRunning() : viewSetup()), sounds: viewSounds, presets: viewPresets, schedules: viewSchedules, history: viewHistory, settings: viewSettings }[view]());
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
  const conditionIssue = isCond(d.type) ? conditionError() : '';
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
    <div class="head"><h1>Hẹn giờ</h1><span class="page-meta num" id="greet">${greet()}</span></div>
    <div class="setup">
      <div class="stage">
        <div class="dial ${isCond(d.type) ? '' : 'drag'}" id="dial" ${dialAttrs()} title="${mode === 'countdown' ? 'Kéo vòng, cuộn chuột hoặc dùng phím mũi tên (giữ Shift để bước 5 phút)' : mode === 'at' ? 'Kéo vòng để chọn giờ thực hiện (giờ đã qua áp dụng cho ngày mai)' : ''}"><svg viewBox="0 0 330 330" id="dial-svg" data-own></svg><div class="center" id="dial-center" data-own></div></div>
        ${chips ? `<div class="chips clip-fit">${chips}</div>` : `<svg id="spark" viewBox="0 0 280 48" style="width:280px;height:48px;overflow:visible" data-own></svg>`}
      </div>
      <div class="side">
        <div id="side-actions"><div class="label">Hành động</div><div class="acts">${acts}</div></div>
        <div id="side-mode"><div class="label">Thời điểm</div>
          <div class="seg wide" data-morph-keep="style"><button class="${mode === 'countdown' ? 'on' : ''}" data-mode="countdown">Thời lượng</button><button class="${mode === 'at' ? 'on' : ''}" data-mode="at">Giờ cụ thể</button><button class="${mode === 'cond' ? 'on' : ''}" data-mode="cond">Điều kiện</button></div></div>
        <div id="side-detail">${mode === 'cond' ? condCard() : quickSoundsHtml()}</div>
      </div>
    </div>
  </section>
  <div class="bar" data-key="bar-setup">
    <div class="summary" id="summary">${summaryHtml()}</div>
    ${savingPreset
      ? `<input id="preset-name" class="inline-input" placeholder="Tên preset" maxlength="40"><button class="btn" data-key="preset-save" data-do="preset-save">Lưu</button><button class="btn ghost" data-key="preset-cancel" data-do="preset-cancel">Huỷ</button>`
      : `<button class="btn ghost" data-key="preset-new" data-do="preset-new">${Icons.bookmark} Lưu preset</button>`}
    <button class="btn primary big" data-key="start" data-do="start" ${conditionIssue ? `disabled title="${esc(conditionIssue)}"` : ''}>${Icons.play} Bắt đầu</button>
  </div>`;
}

function conditionError() {
  const c = draft[draft.type];
  if (draft.type === 'process') {
    if (!c.name.trim()) return 'Nhập tên tiến trình.';
    if (procRunning === false) return 'Không thấy tiến trình đang chạy.';
    return '';
  }
  if (draft.type === 'battery' && !st.hasBattery) return 'Thiết bị không có pin.';
  const ranges = {
    idle: [['minutes', 1, 1440]], battery: [['percent', 1, 100]],
    net: [['kbps', 1, 99999], ['minutes', 1, 1440]], cpu: [['percent', 1, 100], ['minutes', 1, 1440]],
  };
  const invalid = (ranges[draft.type] || []).find(([key, min, max]) => !Number.isFinite(c[key]) || c[key] < min || c[key] > max);
  return invalid ? `Giá trị phải từ ${invalid[1]} đến ${invalid[2]}.` : '';
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
  const issue = conditionError();
  return `<div class="card cond"><div class="chips">${tabs}</div><div class="sentence">${s}</div>
    <p class="field-error" ${issue ? '' : 'hidden'}>${esc(issue)}</p>
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
  const arcEl = '<path id="dial-arc" class="arc" fill="none" stroke-width="6" stroke-linecap="round"/>';
  const track = `<circle class="track" cx="${DC}" cy="${DC}" r="${DR}" fill="none" stroke-width="6"/>`;
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
  body = `<path d="${arc(DC, DR, g0, g0 + span)}" fill="none" stroke-width="6" stroke-linecap="round" class="track"/>` +
    `<path class="arc" d="${arc(DC, DR, g0, g0 + span * Math.max(0.002, v))}" fill="none" stroke-width="6" stroke-linecap="round"/>`;
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
    <div class="head running-head"><h1 class="sr-only clip-fit">Đang hẹn giờ</h1>
      <button class="awake-pill awake-meta ${st.settings.keepAwake ? 'on' : ''}" data-set="keepAwake" data-val="${!st.settings.keepAwake}" title="${st.settings.keepAwake ? 'Đang giữ màn hình và hệ thống thức — bấm để tắt' : 'Cho phép màn hình tắt theo hệ thống — bấm để bật giữ thức'}">
        ${Icons.moon}<span>${st.settings.keepAwake ? 'Đang giữ máy thức' : 'Giữ máy thức: Tắt'}</span>
      </button>
    </div>
    <div class="orb rise d1" id="orb" data-morph-keep="class"><svg viewBox="0 0 400 400" id="orb-svg" data-own></svg>
      <div class="center"><div class="icon">${Icons[j.action]}</div><div class="big num" id="big" data-own></div>
        <div class="what" id="what" data-own></div><div class="src">${esc(sourceLabel(j.source))}</div></div></div>
    ${j.phase === 'countdown' ? `<div class="controls rise d2" id="controls"><div class="bgroup"><button data-post="5">+5 phút</button><button data-post="15">+15 phút</button><button data-post="60">+1 giờ</button></div></div>` : '<div class="status-line" id="status-line" data-own></div>'}
  </section>
  <div class="bar bar-run" data-key="bar-run">
    <div class="summary"></div>
    <button class="btn danger-ghost hold-btn" data-key="now" data-hold-now title="Nhấn giữ 0.8 giây (hoặc Enter/Space) để thực hiện ngay">${esc(a)} ngay…</button>
    <button class="btn primary big" data-key="cancel" data-do="cancel" title="Huỷ hẹn giờ (Ctrl+.)">Huỷ hẹn giờ</button>
  </div>`;
}

const runDial = { svg: null, orb: null, deadline: 0, total: 0, raf: 0 };
function runningDialSkeleton() {
  return DEFS + ticks(200, 188, 60, 5, 4) +
    '<circle cx="200" cy="200" r="168" fill="none" stroke-width="6" class="track"/>' +
    '<path id="run-arc" fill="none" stroke-width="6" stroke-linecap="round"/>' +
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
    if (line) line.textContent = '';
  } else {
    orb.classList.remove('hot', 'final');
    const w = watchValue(j), p = Math.max(0, Math.min(1, w.p));
    // morph giữ <g class="orbit"> nên vòng quay chậm không bị giật về đầu mỗi giây
    morph(svg, DEFS + `<g class="orbit"><circle cx="${C}" cy="${C}" r="188" fill="none" stroke-width="1.5" style="stroke:var(--ink-3)" stroke-dasharray="2 10"/><circle cx="${C}" cy="12" r="4" style="fill:var(--moon)"/></g>` +
      `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke-width="6" class="track"/>` +
      `<path d="${arc(C, R, 0, p)}" fill="none" stroke-width="6" stroke-linecap="round" stroke="url(#gMoon)"/>`);
    big.dataset.mode = 'w'; big.dataset.t = '';
    morph(big, `${esc(w.main)}${w.sub ? `<small>${esc(w.sub)}</small>` : ''}`);
    big.classList.toggle('long', w.main.length > 8);
    morph(what, `<b>${esc(a)}</b> ${esc(S.triggerText(j.trigger))}`);
    const t = j.trigger;
    if (line) line.textContent = (t.type === 'net' || t.type === 'cpu') ? (j.satisfiedMs ? `Đã duy trì ${S.clock(j.satisfiedMs)} / ${S.clock(j.need)}; thời gian chờ bổ sung ${st.settings.graceSeconds} giây` : (t.type === 'net' ? 'Đang theo dõi lưu lượng mạng' : 'Đang theo dõi mức sử dụng CPU'))
      : t.type === 'process' ? 'Đang chờ tiến trình kết thúc' : t.type === 'battery' ? (snap.sensors.battery?.charging ? 'Thiết bị đang kết nối nguồn' : 'Thiết bị đang sử dụng pin') : 'Bộ đếm đặt lại khi phát hiện thao tác';
  }
}

// ---------- Âm thanh nền (2-pane layout, không blur/pill, đồng nhất kích thước, 60 FPS) ----------
const FADES = [0, 5, 10, 20, 30];
const SND_TABS = [
  ['sounds', 'Kênh'],
  ['mixes', 'Bộ mix'],
  ['playlist', 'Playlist'],
  ['youtube', 'YouTube'],
];
const SND_FILTERS = [
  ['all', 'Tất cả'],
  ['active', 'Đang phát'],
  ['rain', 'Mưa'],
  ['nature', 'Thiên nhiên'],
  ['animals', 'Đêm'],
  ['noise', 'Ồn & Não'],
  ['places', 'Không gian'],
];
const PRIORITY_IDS = ['rain', 'thunder', 'wind', 'crickets', 'lofi', 'brown'];
const SOUND_ART_IDS = new Set(['binaural', 'brown', 'cat', 'crickets', 'fire', 'lofi', 'mountain', 'pink', 'rain', 'rain-tent', 'river', 'subway', 'thunder', 'waves', 'wind']);
const soundArtImg = (art) => SOUND_ART_IDS.has(art) ? `<img data-image-fallback src="img/${art}.jpg" alt="">` : '';
let sndTab = 'sounds';
let sndFilter = 'all';
let sleepSound = 'none';
let sndPage = 0;
let mixPage = 0;
let playlistFilter = 'all';
let playlistPage = 0;
let focusedSnd = 'rain';
let savingMix = false;
let lastYtTitle = null;

const sndPerPage = () => (window.innerHeight >= 740 ? 10 : window.innerHeight >= 620 ? 8 : window.innerHeight >= 500 ? 6 : 5);

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
  Dropdown.define('sleep-sound', [
    { value: 'none', label: 'Không', icon: Icons.sound },
    ...A.presets.map((p) => ({ value: `preset:${p.id}`, label: p.name, icon: Icons.sound })),
    { value: 'open', label: 'Mở trang Âm thanh ↗', icon: Icons.sound },
  ]);
  return `<div id="side-sounds" class="quick-snd">
    <div class="label">Âm thanh khi ngủ</div>
    ${Dropdown.html({ opts: 'sleep-sound', value: sleepSound, key: 'dd-sleep-sound', attrs: 'data-sleep-sound', labelledby: 'side-sounds' })}
  </div>`;
}

function soundsPaneHtml(A, song) {
  const ordered = [...A.channels].sort((a, b) => {
    const ia = PRIORITY_IDS.indexOf(a.id), ib = PRIORITY_IDS.indexOf(b.id);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const activeCount = ordered.filter((c) => c.active).length;
  const list = sndFilter === 'all' ? ordered
    : sndFilter === 'active' ? ordered.filter((c) => c.active)
      : ordered.filter((c) => c.category === sndFilter);
  const pg = paginateSlice(list, sndPage, sndPerPage());
  sndPage = pg.page;

  const rows = pg.rows.map((x) => {
    const on = x.active, lit = on && A.playing, loading = A.playing && x.loading, v = Math.round(x.volume * 100);
    const sub = loading ? 'Đang tải…' : x.id === 'lofi' && song && on ? esc(song.title) : x.desc;
    const ico = Icons[x.id] || Icons[x.category] || Icons.sound;
    return `<div class="snd-row ${on ? 'on' : ''} ${lit ? 'lit' : ''} ${loading ? 'loading' : ''}" data-key="snd-${x.id}">
      <button class="snd-row-btn" data-snd="${x.id}" aria-pressed="${on}" aria-label="${lit ? 'Tạm dừng' : 'Phát'} ${esc(x.name)}" title="${lit ? 'Tạm dừng' : 'Phát'} ${esc(x.name)}">
        <span class="snd-thumb">${soundArtImg(x.art || x.id)}${ico}</span>
        <span class="snd-state-ico">${lit ? Icons.pause : Icons.play}</span><span class="snd-meta"><b title="${esc(x.name)}">${esc(x.name)}</b><small>${sub}</small></span>
      </button>
      <button class="icon-btn snd-swell ${x.swell ? 'on' : ''}" data-swell="${x.id}" aria-label="Dâng sóng" title="Dâng sóng: ${x.swell ? 'Bật' : 'Tắt'}">${Icons.wave}</button>
      <input type="range" class="vol snd-vol" data-vol="${x.id}" min="0" max="100" value="${v}" style="--v:${v}%" aria-label="Âm lượng ${esc(x.name)}">
    </div>`;
  }).join('');

  const empty = sndFilter !== 'all'
    ? '<div class="empty"><b>Không có kênh khớp</b><button class="btn small" data-sfilter="all">Xoá bộ lọc</button></div>'
    : '<div class="empty"><b>Chưa có kênh âm thanh</b><button class="btn small" data-do="snd-shuffle">Phát ngẫu nhiên</button></div>';
  return `<div class="snd-list">${rows || empty}</div>`;
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
    const artId = m.channels[0]?.[0] || 'lofi';
    return `<div class="mix-row ${on ? 'on' : ''} ${on && A.playing ? 'lit' : ''}">
      <button class="mix-row-btn" ${m.custom ? `data-cmix="${m.id}"` : `data-apreset="${m.id}"`}>
        <span class="snd-thumb">${soundArtImg(artId)}${Icons.sound}</span>
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
        <span class="snd-thumb">${soundArtImg('lofi')}${Icons.lofi}</span>
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

function youtubePaneHtml(A) {
  const yt = A.yt;
  const stYt = yt.status || 'closed';
  const open = stYt !== 'closed';
  const isMusic = yt.source === 'YouTube Music';

  if (stYt === 'error' || stYt === 'offline') {
    const message = yt.error || (stYt === 'offline' ? 'Không có kết nối mạng. Kiểm tra kết nối rồi thử lại.' : 'Không thể tải nội dung YouTube.');
    return `<div class="yt-pane yt-problem" role="status"><div class="yt-status"><i class="yt-dot error"></i><span>${esc(message)}</span></div>
      <button class="btn small" data-yt="retry">Thử lại</button></div>`;
  }

  if (stYt === 'loading') {
    const rows = Array.from({ length: 5 }, () => '<div class="yt-skeleton-row"><span class="yt-skeleton-thumb"></span><span class="yt-skeleton-copy"><i></i><i></i></span></div>').join('');
    return `<div class="yt-pane yt-loading" aria-label="Đang tải nội dung YouTube">${rows}</div>`;
  }

  if (!open) {
    return `<div class="yt-pane">
      <div class="yt-status"><i class="yt-dot closed"></i><span>Mở YouTube để đăng nhập và chọn nhạc — bài đang phát sẽ tự đồng bộ lên đĩa nhạc bên phải.</span></div>
      <div class="yt-actions">
        <button class="btn primary" data-yt="music">${Icons.lofi} Mở YouTube Music</button>
        <button class="btn" data-yt="youtube">${Icons.play} Mở YouTube</button>
      </div>
      <p class="note">Đóng cửa sổ YouTube (×) để ẩn chạy nền và chỉ nghe tiếng cùng đĩa nhạc.</p>
    </div>`;
  }

  const titleTxt = yt.title || (stYt === 'hidden' ? 'Đang phát nền (chỉ nghe tiếng)' : 'Cửa sổ YouTube đang mở');
  return `<div class="yt-pane">
    <div class="yt-head">
      <div class="yt-status"><i class="yt-dot ${stYt}"></i><b>${esc(titleTxt)}</b></div>
      <button class="btn ghost small" data-yt="close" title="Dừng và đóng YouTube">Tắt</button>
    </div>
    <div class="yt-opt">
      <div><b>Chỉ nghe tiếng (chạy nền)</b><small>Ẩn cửa sổ YouTube, điều khiển trực tiếp trên đĩa nhạc bên phải</small></div>
      <button class="switch ${stYt === 'hidden' ? 'on' : ''}" data-yt="${stYt === 'visible' ? 'hide' : 'show'}" aria-pressed="${stYt === 'hidden'}" title="Ẩn/hiện cửa sổ YouTube"></button>
    </div>
    <div class="yt-switch-bar">
      <span class="note">Chuyển nguồn:</span>
      <button class="sub-tab ${!isMusic ? 'on' : ''}" data-yt="youtube">YouTube</button>
      <button class="sub-tab ${isMusic ? 'on' : ''}" data-yt="music">YouTube Music</button>
    </div>
  </div>`;
}

function viewSounds() {
  const A = Ambient, song = A.song(), yt = A.yt, activeChannels = A.channels.filter((c) => c.active);
  const activeCount = activeChannels.length;

  if (yt.status !== 'closed' && yt.title && yt.title !== lastYtTitle) {
    lastYtTitle = yt.title;
    focusedSnd = 'youtube';
  } else if (yt.status === 'closed' && focusedSnd === 'youtube') {
    lastYtTitle = null;
    focusedSnd = activeChannels[0]?.id || 'rain';
  }

  const ytSynced = yt.status !== 'closed' && (focusedSnd === 'youtube' || sndTab === 'youtube');
  const stageChannel = A.channels.find((c) => c.id === focusedSnd && c.active)
    || A.channels.find((c) => c.id === focusedSnd)
    || activeChannels[0]
    || A.channels[0]
    || { id: 'rain', name: 'Mưa nhẹ', desc: 'Hạt mưa rơi đều bên hiên', category: 'rain', art: 'rain', volume: 0.75, pan: 0, swell: false };

  const status = A.error ? `<span class="err">${esc(A.error)}</span>`
    : A.stoppedByTimer ? 'Đã tắt theo hẹn giờ'
      : A.playing ? (A.fading ? `Tắt dần · ${Math.round(A.fadeLevel * 100)}%` : `Đang phát · ${activeCount} kênh`)
        : yt.status !== 'closed' ? (yt.source || 'YouTube')
          : activeCount ? `Tạm dừng · ${activeCount} kênh` : 'Sẵn sàng';

  const tabsHtml = SND_TABS.map(([id, label]) =>
    `<button class="snd-tab ${sndTab === id ? 'on' : ''}" data-stab-snd="${id}">${label}</button>`
  ).join('');

  let leftBody = '';
  if (sndTab === 'mixes') leftBody = mixesPaneHtml(A);
  else if (sndTab === 'playlist') leftBody = playlistPaneHtml(A, song);
  else if (sndTab === 'youtube') leftBody = youtubePaneHtml(A);
  else leftBody = soundsPaneHtml(A, song);

  const mv = Math.round(A.master * 100);
  const stageArt = stageChannel.art || stageChannel.id;
  const stageArtImage = ytSynced
    ? (yt.artwork ? `<img data-image-fallback src="${esc(yt.artwork)}" alt="">` : '')
    : soundArtImg(stageArt);
  const stageIco = ytSynced ? Icons.lofi : (Icons[stageChannel.id] || Icons[stageChannel.category] || Icons.sound);
  const stageTitle = ytSynced ? (yt.title || yt.source || 'YouTube Audio')
    : (stageChannel.id === 'lofi' && song ? song.title : stageChannel.name);
  const stageSub = ytSynced ? `${yt.source || 'YouTube'} · ${yt.status === 'hidden' ? 'Đang chạy nền' : 'Đã đồng bộ'}`
    : (stageChannel.id === 'lofi' && song ? `${song.artist} · Nhạc Lo-Fi` : stageChannel.desc);
  const discLit = ytSynced ? (yt.status !== 'closed') : (A.playing && activeCount > 0);
  const fadeLabel = A.fade ? `Nhỏ dần ${A.fade} phút cuối` : 'Không nhỏ dần';
  const loopMode = A.lofiLoopMode || 'all';
  const loopIcon = loopMode === 'one' ? Icons.repeatOne : loopMode === 'shuffle' ? Icons.shuffle : Icons.repeat;
  const loopLabel = loopMode === 'one' ? 'Lặp 1 bài' : loopMode === 'shuffle' ? 'Phát ngẫu nhiên' : 'Lặp danh sách';
  const panPct = Math.round((stageChannel.pan || 0) * 100);
  const panLabel = panPct === 0 ? 'Vừa' : panPct < 0 ? `Trái ${Math.abs(panPct)}%` : `Phải ${panPct}%`;
  const seekPct = Math.round(A.lofiProgress * 100);

  const subCtl = ytSynced
    ? `<div class="stage-subctl yt-sync-bar">
        <div class="stage-vol-meta"><span>Nguồn: ${esc(yt.source || 'YouTube')}</span><button class="stage-fade-btn" data-yt="${yt.status === 'visible' ? 'hide' : 'show'}">${yt.status === 'visible' ? 'Ẩn cửa sổ' : 'Hiện cửa sổ'}</button></div>
      </div>`
    : stageChannel.id === 'lofi'
      ? `<div class="stage-subctl">
          <input type="range" class="vol" data-seek min="0" max="100" value="${seekPct}" style="--v:${seekPct}%" aria-label="Tua bài nhạc">
          <div class="stage-vol-meta num"><span>Tua bài · ${loopLabel}</span><span>${seekPct}%</span></div>
        </div>`
      : `<div class="stage-subctl">
          <input type="range" class="vol pan-slider" data-pan="${stageChannel.id}" min="-100" max="100" value="${panPct}" style="--v:${(panPct + 100) / 2}%" aria-label="Cân bằng Trái/Phải">
          <div class="stage-vol-meta num"><span>Không gian: ${panLabel}</span><button class="stage-fade-btn ${stageChannel.swell ? 'on' : ''}" data-swell="${stageChannel.id}">Dâng sóng: ${stageChannel.swell ? 'Bật' : 'Tắt'}</button></div>
        </div>`;

  const mixerRows = activeChannels.map((channel) => {
    const volume = Math.round(channel.volume * 100);
    return `<div class="mixer-row"><span title="${esc(channel.name)}">${esc(channel.name)}</span>
      <input type="range" class="vol" data-vol="${channel.id}" min="0" max="100" value="${volume}" style="--v:${volume}%" aria-label="Âm lượng ${esc(channel.name)}">
      <button class="icon-btn" data-snd="${channel.id}" aria-label="Gỡ ${esc(channel.name)}" title="Gỡ khỏi mixer">×</button></div>`;
  }).join('');
  const mixerPanel = `<aside class="mixer-panel"><h2>Mixer đang phát</h2>
    <div class="mixer-list">${mixerRows || '<div class="empty"><b>Chưa bật âm thanh nào</b><button class="btn small" data-do="snd-shuffle">Phát ngẫu nhiên</button></div>'}</div>
    <div class="mixer-setting"><span>Không gian</span><div class="seg"><button>Hẹp</button><button class="on">Vừa</button><button>Rộng</button></div></div>
    <div class="mixer-setting"><span>Nhỏ dần 10 phút cuối</span><button class="switch ${A.fade === 10 ? 'on' : ''}" data-fade-cycle aria-pressed="${A.fade === 10}"></button></div>
  </aside>`;
  const playerPanel = `<div class="snd-stage">
    <div class="stage-disc-wrap clip-fit ${discLit ? 'lit' : ''}"><div class="stage-art ${discLit ? 'lit' : ''} ${ytSynced && yt.artwork ? 'yt-art' : ''}">${stageArtImage}<span class="stage-ico">${stageIco}</span></div></div>
    <div class="stage-info"><b title="${esc(stageTitle)}">${esc(stageTitle)}</b><p>${esc(stageSub)}</p></div>${subCtl}
    <div class="stage-vol"><input type="range" class="vol" data-master min="0" max="100" value="${mv}" style="--v:${mv}%" aria-label="Âm lượng chung"><div class="stage-vol-meta num"><span>Âm lượng nền ${mv}%</span><button class="stage-fade-btn ${A.fade ? 'on' : ''}" data-fade-cycle>${fadeLabel}</button></div></div>
    <div class="stage-ctl"><button class="icon-btn ${loopMode !== 'all' ? 'on' : ''}" data-do="snd-loop" aria-label="${loopLabel}" title="${loopLabel}">${loopIcon}</button><button class="icon-btn" data-do="${ytSynced ? 'yt-prev' : 'snd-prev'}" aria-label="Bài trước" title="Bài trước">${Icons.prev}</button><button class="stage-play ${discLit ? 'lit' : ''}" data-key="snd-play" data-do="${ytSynced ? 'yt-toggle' : 'snd-play'}" aria-label="${discLit ? 'Tạm dừng' : 'Phát'}">${discLit ? Icons.pause : Icons.play}</button><button class="icon-btn" data-key="skip" data-do="${ytSynced ? 'yt-next' : 'snd-skip'}" aria-label="Bài tiếp theo" title="Bài tiếp theo">${Icons.skip}</button></div>
  </div>`;

  return `<section class="view sounds" data-key="v-sounds">
    <div class="head sounds-head"><h1>Âm thanh</h1><div class="sounds-page-meta"><span class="page-meta num">${status}</span><button class="icon-btn" data-do="snd-play" aria-label="${A.playing ? 'Tạm dừng tất cả' : 'Phát tất cả'}" title="${A.playing ? 'Tạm dừng tất cả' : 'Phát tất cả'}">${A.playing ? Icons.pause : Icons.play}</button><details class="snd-menu"><summary class="icon-btn" aria-label="Mở menu âm thanh" title="Thêm tuỳ chọn">⋯</summary><div class="pmenu"><button data-do="snd-shuffle">Trộn</button><button class="danger" data-do="snd-clear">Tắt hết</button></div></details></div></div>
    <div class="snd-topbar">
      <div class="snd-tabs">${tabsHtml}</div>
      <div class="snd-tools">
        ${Dropdown.html({ opts: 'sfilter', value: sndFilter, key: 'dd-sfilter', attrs: 'data-sfilter-dd', cls: 'dd-compact', title: 'Lọc theo danh mục âm thanh' })}
        <button class="filter-toggle ${sndFilter === 'active' ? 'on' : ''}" data-sfilter="${sndFilter === 'active' ? 'all' : 'active'}" aria-pressed="${sndFilter === 'active'}"><span class="switch ${sndFilter === 'active' ? 'on' : ''}"></span>Chỉ đang phát</button>
      </div>
    </div>
    <div class="snd-split">
      <div class="snd-list-pane">${leftBody}</div>
      ${sndTab === 'playlist' || sndTab === 'youtube' ? playerPanel : mixerPanel}
    </div>
  </section>`;
}

// ---------- 02 Preset ----------
function viewPresets() {
  const pg = paged('presets', st.presets);
  const rows = pg.rows.map((p, i) => `
    <div class="item" data-row data-key="p-${p.id}" tabindex="0" style="animation-delay:${i * 40}ms">
      <div class="ico">${Icons[p.action]}</div>
      <div class="pmeta">${renaming === p.id
        ? `<div class="pname"><input data-rename-input="${p.id}" value="${esc(p.name)}" maxlength="40" aria-label="Đổi tên preset"></div>`
        : `<div class="pname" data-rename="${p.id}" title="${esc(p.name)}">${esc(p.name)}</div>`}
        <div class="pdesc" title="${esc(S.ACTIONS[p.action].label)} · ${esc(S.triggerText(p.trigger))}">${esc(S.ACTIONS[p.action].label)} · ${esc(S.triggerText(p.trigger))}</div></div>
      <button class="btn ghost small row-act" data-run="${p.id}">${Icons.play} Chạy</button>
      <button class="icon-btn row-more" data-pmenu="${p.id}" aria-label="Tuỳ chọn cho ${esc(p.name)}" title="Tuỳ chọn">⋯</button>
    </div>`).join('');
  return `<section class="view presets" data-key="v-presets">
    <div class="head"><h1>Preset</h1><span class="page-meta num">${st.presets.length} preset</span></div>
    <div class="list fit" data-fit="presets">${rows || '<div class="empty"><b>Chưa có preset</b><p>Thiết lập hẹn giờ rồi chọn Lưu preset để chạy lại nhanh.</p><button class="btn small" data-view="timer">Đi tới Hẹn giờ</button></div>'}</div>
    ${pg.count > 1 ? `<div class="foot">${pager('presets', pg)}</div>` : ''}
  </section>`;
}

// ---------- 03 Lịch lặp ----------
function viewSchedules() {
  const days = (arr, id) => [1, 2, 3, 4, 5, 6, 0].map((d) =>
    `<button class="day ${arr.includes(d) ? 'on' : ''}" ${id ? `data-sday="${id}:${d}"` : `data-nday="${d}"`} aria-pressed="${arr.includes(d)}">${S.DAYS[d]}</button>`).join('');
  const pg = paged('schedules', st.schedules);
  const rows = pg.rows.map((sc, i) => {
    const next = snap?.next?.find((n) => n.id === sc.id)?.at;
    const [sh, sm] = sc.time.split(':');
    const timeEl = editingSched === sc.id
      ? `<div class="time-in stime-edit" data-stime-edit="${sc.id}"><input class="num" data-se="h" data-max="23" value="${esc(sh)}" maxlength="2" aria-label="Giờ"><span class="sep">:</span><input class="num" data-se="m" data-max="59" value="${esc(sm)}" maxlength="2" aria-label="Phút"></div>`
      : `<span class="stime num" data-sedit="${sc.id}" title="Nhấp đúp để sửa giờ">${sc.time}</span>`;
    return `<div class="item ${sc.enabled ? '' : 'off'}" data-row data-key="s-${sc.id}" tabindex="0" style="animation-delay:${i * 40}ms">
      ${timeEl}
      <div class="sinfo"><div class="days">${days(sc.days, sc.id)}</div>
        <div class="pdesc">${sc.enabled ? (next ? `Lần tiếp theo: ${S.dayWord(next)} ${S.hhmm(next)}` : 'Chưa chọn ngày') : 'Đã tắt'}</div></div>
      ${Dropdown.html({ opts: 'action', value: sc.action, key: `dd-s-${sc.id}`, attrs: `data-sact-row="${sc.id}"`, cls: 'dd-row', title: 'Hành động' })}
      <button class="switch ${sc.enabled ? 'on' : ''}" data-stoggle="${sc.id}" aria-pressed="${sc.enabled}" aria-label="${sc.enabled ? 'Tắt' : 'Bật'} lịch ${sc.time}" title="Bật/tắt"></button>
      <button class="icon-btn row-more" data-smenu="${sc.id}" aria-label="Tuỳ chọn cho lịch ${sc.time}" title="Tuỳ chọn">⋯</button>
    </div>`;
  }).join('');
  const notice = st.settings.autostart ? '' : `<div class="inline-notice" role="status">
    <span class="notice-ico" aria-hidden="true">${Icons.alert}</span>
    <span>Sleepy phải đang chạy để thực hiện lịch.</span>
    <button class="btn small" data-set="autostart" data-val="true" data-autostart-cta>Bật khởi động cùng hệ thống</button>
  </div>`;
  return `<section class="view sched" data-key="v-schedules">
    <div class="head"><h1>Lịch lặp</h1><span class="page-meta num">${st.schedules.filter((s) => s.enabled).length} lịch đang bật</span></div>
    ${notice}
    <h2 class="sec-h2">Lịch mới</h2>
    <div class="card adder">
      <div><div class="label">Giờ</div><div class="time-in"><input class="num" data-dial="sched.h" data-max="23" value="${pad(sched.h)}" maxlength="2" aria-label="Giờ lịch mới"><span class="sep">:</span><input class="num" data-dial="sched.m" data-max="59" value="${pad(sched.m)}" maxlength="2" aria-label="Phút lịch mới"></div></div>
      <div><div class="label">Ngày</div><div class="days">${days(sched.days)}</div></div>
      <div><div class="label" id="lbl-sact">Hành động</div>${Dropdown.html({ opts: 'action', value: sched.action, key: 'dd-new', attrs: 'data-sact', labelledby: 'lbl-sact' })}</div>
      <button class="btn primary" data-do="sched-add" title="Thêm lịch">${Icons.plus}<span>Thêm lịch</span></button>
    </div>
    <h2 class="sec-h2">Lịch đã tạo</h2>
    <div class="list fit" data-fit="schedules">${rows || '<div class="empty"><b>Chưa có lịch</b><p>Tự động tắt máy vào giờ cố định mỗi ngày.</p></div>'}</div>
    ${pg.count > 1 ? `<div class="foot">${pager('schedules', pg)}</div>` : ''}
  </section>`;
}

// ---------- 04 Nhật ký ----------
function viewHistory() {
  const badge = {
    done: '<span class="tag ok">✓ Đã thực hiện</span>',
    cancel: '<span class="tag">✕ Đã huỷ</span>',
    dry: '<span class="tag dry-tag">◌ Chạy thử</span>',
    error: '<span class="tag err">! Lỗi</span>',
    pending: '<span class="tag">…</span>',
  };
  const filtered = histFilter === 'all' ? st.history : st.history.filter((h) => h.result === histFilter);
  const filterLabel = HIST_FILTERS.find((f) => f.value === histFilter)?.label || histFilter;
  const pg = paged('history', filtered);
  const rows = pg.rows.map((h) => {
    const d = new Date(h.at);
    const src = sourceLabel(h.source);
    const noteHtml = h.note && h.note !== 'Đã huỷ' ? `<div class="sub" title="${esc(h.note)}">${esc(h.note)}</div>` : '';
    const fixHtml = h.result === 'error' ? `<button class="link-btn err-help" data-err-help="${esc(h.note || '')}">Cách khắc phục</button>` : '';
    return `<tr data-row data-key="h-${h.id}"><td class="num c-time">${pad(d.getDate())}/${pad(d.getMonth() + 1)} · ${S.hhmm(h.at)}</td>
      <td class="c-act"><b>${S.ACTIONS[h.action]?.label || h.action}</b><div class="sub">${esc(S.triggerText(h.trigger))}</div></td>
      <td class="dim c-src" title="${esc(src)}">${esc(src)}</td>
      <td class="c-res">${badge[h.result] || ''}${noteHtml}${fixHtml}</td></tr>`;
  }).join('');
  return `<section class="view" data-key="v-history">
    <div class="head"><h1>Nhật ký</h1>
      <div class="head-actions">
        ${Dropdown.html({ opts: 'hfilter', value: histFilter, key: 'dd-hfilter', attrs: 'data-hfilter-dd', cls: 'dd-compact dd-hfilter', title: 'Lọc theo kết quả' })}
        ${st.history.length ? '<button class="icon-btn row-more" data-hmenu aria-label="Tuỳ chọn nhật ký" title="Tuỳ chọn">⋯</button>' : ''}
      </div></div>
    <div class="fit" data-fit="history">${rows ? `<table class="hist">
      <thead><tr><th class="c-time">Thời gian</th><th class="c-act">Hành động</th><th class="c-src">Nguồn</th><th class="c-res">Kết quả</th></tr></thead><tbody>${rows}</tbody></table>`
      : histFilter !== 'all'
        ? `<div class="empty"><b>Không có mục ${esc(filterLabel)}</b><button class="btn small" data-hfilter="all">Xem tất cả</button></div>`
        : '<div class="empty"><b>Chưa có hoạt động</b><p>Mỗi lần hẹn giờ chạy, bị huỷ hoặc lỗi sẽ hiện ở đây.</p></div>'}</div>
    ${pg.count > 1 ? `<div class="foot">${pager('history', pg)}</div>` : ''}
  </section>`;
}

// ---------- 05 Cài đặt ----------
const DATA_PATH = '~/.config/dev.giabao.sleepy/sleepy.json';
function seg(key, opts) {
  const v = st.settings[key];
  return `<div class="seg" data-morph-keep="style">${opts.map(([val, l]) => `<button class="${v === val ? 'on' : ''}" data-set="${key}" data-val='${JSON.stringify(val)}'>${l}</button>`).join('')}</div>`;
}
function sw(key, label = '') { return `<button class="switch ${st.settings[key] ? 'on' : ''}" data-set="${key}" data-val='${JSON.stringify(!st.settings[key])}' aria-pressed="${!!st.settings[key]}"${label ? ` aria-label="${esc(label)}"` : ''}></button>`; }
function setRow(title, desc, ctl) { return `<div class="set"><div class="set-info"><b>${title}</b>${desc ? `<p>${desc}</p>` : ''}</div><div class="set-ctl">${ctl}</div></div>`; }
function viewSettings() {
  const capWord = { yes: ['Được', 'yes'], challenge: ['Cần mật khẩu', ''], no: ['Không', 'no'], na: ['Không hỗ trợ', 'no'], unknown: ['Chưa rõ', ''] };
  return `<section class="view settings" data-key="v-settings">
    <div class="head"><h1>Cài đặt</h1><span class="page-meta">Sleepy 2.0</span></div>
    <div class="groups" tabindex="0" data-scroll-region aria-label="Danh sách cài đặt">
      <div class="card group" data-g="warn"><h2>Cảnh báo</h2>
        <div class="set set-seg-wide"><div class="set-info"><b>Báo trước</b><p>Hiển thị cửa sổ cảnh báo trước khi thực hiện hành động.</p></div><div class="set-ctl">${seg('warnMinutes', [[0, 'Không'], [1, '1 phút'], [2, '2 phút'], [5, '5 phút'], [10, '10 phút']])}</div></div>
        <div class="set set-seg-wide"><div class="set-info"><b>Thời gian chờ sau điều kiện</b><p>Khoảng trì hoãn sau khi điều kiện được đáp ứng.</p></div><div class="set-ctl">${seg('graceSeconds', [[30, '30 giây'], [60, '60 giây'], [120, '2 phút']])}</div></div>
        ${setRow('Âm báo', 'Phát âm thanh khi cảnh báo và trong 10 giây cuối.', sw('sound', 'Âm báo'))}
      </div>
      <div class="card group" data-g="app"><h2>Ứng dụng</h2>
        ${setRow('Giữ hệ thống hoạt động', 'Ngăn màn hình tắt và máy ngủ khi đang hẹn giờ.', sw('keepAwake', 'Giữ hệ thống hoạt động'))}
        ${setRow('Thu nhỏ vào khay khi đóng', 'Tiếp tục chạy hẹn giờ khi cửa sổ chính đóng.', sw('closeToTray', 'Thu nhỏ vào khay khi đóng'))}
        ${setRow('Khởi động cùng hệ thống', 'Khởi động Sleepy sau khi đăng nhập.', sw('autostart', 'Khởi động cùng hệ thống'))}
        ${setRow('Khởi động ở chế độ thu nhỏ', 'Mở ứng dụng ở trạng thái thu nhỏ vào khay.', sw('startMinimized', 'Khởi động ở chế độ thu nhỏ'))}
      </div>
      <div class="card group" data-g="adv"><h2>Nâng cao</h2>
        <div class="adv-grid">
          <div class="adv-col">
            <div class="set ${st.settings.dryRun ? 'set-warn' : ''}"><div class="set-info"><b>Chế độ thử</b><p>Chỉ hiển thị thông báo, không thực hiện hành động hệ thống.</p></div><div class="set-ctl">${sw('dryRun', 'Chế độ thử')}</div></div>
            ${setRow('Dữ liệu', `<span class="mono-inline mono-path" title="${DATA_PATH}">${DATA_PATH}</span>`, `<button class="btn small" data-do="copy-data-path">${Icons.copy}<span>Sao chép</span></button>`)}
          </div>
          <div class="adv-col">
            ${setRow('Lệnh chạy trước', 'Chạy trước hành động (tối đa 30 giây).', `<input class="mono" data-text="preCommand" value="${esc(st.settings.preCommand)}" placeholder="vd: playerctl pause" spellcheck="false" aria-label="Lệnh chạy trước">`)}
            <div class="set set-block"><b>Quyền thực hiện hành động</b>
              <div class="caps">${ORDER.map((k) => { const c = capWord[st.caps?.[k]] || capWord.unknown; return `<div><span>${S.ACTIONS[k].label}</span><span class="${c[1]}">${c[0]}</span></div>`; }).join('')}</div></div>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

// ---------- Sự kiện ----------
document.addEventListener('error', (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.hasAttribute('data-image-fallback')) return;
  image.parentElement?.classList.add('image-failed');
  image.remove();
}, true);

async function start(action, trig, source) {
  const r = await sleepy.start(action, trig, source);
  if (!r.ok || r.error) toast(r.error, true); else toast(`Đã tạo hẹn giờ: ${S.describe(action, trig)}.`);
}
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [data-rename], .mini');
  if (!t) return;
  const ds = t.dataset;
  if ('toastClose' in ds) { clearToast(); return; }
  if ('toastAct' in ds) { const fn = $('#toast')._act; clearToast(); if (fn) fn(); return; }
  if ('holdNow' in ds) {
    if (t._heldDone) { t._heldDone = false; return; }
    if (e.detail === 0) {
      const a = snap?.job ? S.ACTIONS[snap.job.action].label : 'Thực hiện';
      openConfirm(t, { title: `${a} ngay?`, confirmLabel: a, danger: true, onConfirm: () => sleepy.now() });
    } else {
      toast('Nhấn giữ 0.8 giây để thực hiện ngay.');
    }
    return;
  }
  if (ds.win) return sleepy.win(ds.win);
  if (ds.view) { if (view === ds.view) return; view = ds.view; savingPreset = false; renaming = null; editingSched = null; if (view === 'timer' && draft.type === 'process') loadProcs(); return render(); }
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
  if (ds.stabSnd) { sndTab = ds.stabSnd; return render(); }
  if (ds.sfilter) { sndFilter = ds.sfilter; sndPage = 0; return render(); }
  if (ds.plFilter) { playlistFilter = ds.plFilter; playlistPage = 0; return render(); }
  if (ds.apreset) { focusedSnd = 'rain'; return Ambient.applyPreset(ds.apreset); }
  if (ds.cmix) { focusedSnd = 'rain'; return Ambient.applyCustomMix(ds.cmix); }
  if (ds.delCmix) {
    const m = (st.mixPresets || []).find((x) => x.id === ds.delCmix);
    await Ambient.deleteMix(ds.delCmix);
    if (m) toast(`Đã xoá bộ mix "${m.name}".`);
    return;
  }
  if (ds.yt) {
    try {
      if (ds.yt === 'retry') { focusedSnd = 'youtube'; await Ambient.ytOpen(Ambient.yt.source === 'YouTube Music' ? 'music' : 'youtube'); }
      else if (ds.yt === 'hide') await Ambient.ytHide();
      else if (ds.yt === 'close') await Ambient.ytClose();
      else if (ds.yt === 'show') { focusedSnd = 'youtube'; await Ambient.ytOpen(Ambient.yt.source === 'YouTube Music' ? 'music' : 'youtube'); }
      else { focusedSnd = 'youtube'; await Ambient.ytOpen(ds.yt); }
      return render();
    } catch (err) { return toast(String(err), true); }
  }
  if ('fadeCycle' in ds) { const i = FADES.indexOf(Ambient.fade); return Ambient.setFade(FADES[(i + 1) % FADES.length]); }
  if (ds.fade) return Ambient.setFade(+ds.fade);
  if (ds.hfilter) { histFilter = ds.hfilter; pages.history.page = 0; return render(); }
  if (ds.pmenu) { const p = st.presets.find((x) => x.id === ds.pmenu); if (p) openPresetMenu(t, p); return; }
  if (ds.smenu) { const sc = st.schedules.find((x) => x.id === ds.smenu); if (sc) openScheduleMenu(t, sc); return; }
  if ('hmenu' in ds) { openHistoryMenu(t); return; }
  if ('errHelp' in ds) { openErrorHelp(t, ds.errHelp); return; }
  if (ds.page) { const [k, d] = ds.page.split(':'); pages[k].page += +d; return render(); }
  if (ds.run) { const p = st.presets.find((x) => x.id === ds.run); if (p) { await start(p.action, p.trigger, `preset:${p.id}`); view = 'timer'; render(); } return; }
  if (ds.delPreset) { return deletePreset(ds.delPreset); }
  if (ds.set) {
    try {
      await sleepy.setSettings({ [ds.set]: JSON.parse(ds.val) });
      if ('autostartCta' in ds) toast('Đã bật khởi động cùng hệ thống');
      return;
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
  if (ds.sdel) { return deleteSchedule(ds.sdel); }
  switch (ds.do) {
    case 'start': return start(draft.action, trigger(), 'manual');
    case 'cancel': {
      const prevJob = snap?.job ? { action: snap.job.action, trigger: snap.job.trigger, source: snap.job.source } : null;
      await sleepy.cancel();
      return toast('Đã huỷ hẹn giờ.', prevJob ? {
        action: 'Hoàn tác',
        undo: () => start(prevJob.action, prevJob.trigger, prevJob.source),
      } : false);
    }
    case 'now': return sleepy.now();
    case 'preset-new': savingPreset = true; return render();
    case 'preset-cancel': savingPreset = false; return render();
    case 'preset-save': return savePreset();
    case 'hist-clear': {
      const n = st.history.length;
      if (!n) return;
      return openConfirm(t, {
        title: `Xoá ${n} mục nhật ký?`,
        confirmLabel: `Xoá ${n} mục`,
        danger: true,
        onConfirm: () => sleepy.clearHistory().then(() => toast(`Đã xoá ${n} mục nhật ký.`)),
      });
    }
    case 'snd-play': return Ambient.togglePlay();
    case 'snd-skip': focusedSnd = 'lofi'; return Ambient.skipSong();
    case 'snd-prev': focusedSnd = 'lofi'; return Ambient.prevSong();
    case 'snd-loop': return Ambient.cycleLofiLoop();
    case 'yt-toggle': return Ambient.ytControl('toggle');
    case 'yt-next': return Ambient.ytControl('next');
    case 'yt-prev': return Ambient.ytControl('prev');
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
    case 'copy-data-path': {
      try {
        await navigator.clipboard.writeText(DATA_PATH);
        toast('Đã sao chép đường dẫn dữ liệu');
      } catch {
        toast(`Đường dẫn: ${DATA_PATH}`);
      }
      return;
    }
  }
});
document.addEventListener('dblclick', (e) => {
  const r = e.target.closest('[data-rename]');
  if (r) { renaming = r.dataset.rename; render(); return; }
  const s = e.target.closest('[data-sedit]');
  if (s) {
    editingSched = s.dataset.sedit;
    render();
    const inp = $(`[data-stime-edit="${editingSched}"] input[data-se="h"]`);
    if (inp) { inp.focus({ preventScroll: true }); inp.select(); }
  }
});
function commitRename(input) {
  const name = input.value.trim(), id = input.dataset.renameInput;
  renaming = null;
  if (name) {
    const next = st.presets.map((p) => p.id === id ? { ...p, name } : p);
    st.presets = next;
    sleepy.setPresets(next);
    render();
  } else render();
}
function commitSchedTime(box) {
  const id = box?.dataset.stimeEdit;
  if (!id || editingSched !== id) return;
  const hIn = box.querySelector('input[data-se="h"]');
  const mIn = box.querySelector('input[data-se="m"]');
  const h = Math.max(0, Math.min(23, parseInt(hIn?.value, 10) || 0));
  const m = Math.max(0, Math.min(59, parseInt(mIn?.value, 10) || 0));
  const time = `${pad(h)}:${pad(m)}`;
  editingSched = null;
  const cur = st.schedules.find((s) => s.id === id);
  if (cur && cur.time !== time) {
    const next = st.schedules.map((s) => s.id === id ? { ...s, time, lastArmed: 0 } : s);
    st.schedules = next;
    sleepy.setSchedules(next);
    toast(`Đã đổi giờ lịch thành ${time}`);
  }
  render();
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
  else if (t.dataset.se) { t.value = t.value.replace(/\D/g, '').slice(0, 2); }
  else if (t.dataset.field) {
    const [scope, key] = t.dataset.field.split('.');
    if (key === 'name') { draft[scope][key] = t.value; procRunning = null; checkProc(); }
    else { t.value = t.value.replace(/\D/g, '').slice(0, 5); draft[scope][key] = t.value === '' ? Number.NaN : parseInt(t.value, 10); }
    const issue = conditionError();
    const error = $('.field-error');
    if (error) { error.textContent = issue; error.hidden = !issue; }
    const startButton = $('[data-do="start"]');
    if (startButton) { startButton.disabled = !!issue; startButton.title = issue; }
    if (key === 'name' || !issue) saveDraft();
    updateSummary(); renderDial();
  }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.text) sleepy.setSettings({ [t.dataset.text]: t.value });
  if ('sleepSound' in t.dataset) {
    const value = t.dataset.value;
    if (value === 'open') { view = 'sounds'; render(); return; }
    sleepSound = value;
    if (value === 'none') Ambient.clearAll();
    else Ambient.applyPreset(value.slice('preset:'.length));
  }
  if ('sfilterDd' in t.dataset) { sndFilter = t.dataset.value; sndPage = 0; render(); }
  if ('hfilterDd' in t.dataset) { histFilter = t.dataset.value; pages.history.page = 0; render(); }
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
  if (t.dataset.se) {
    const box = t.closest('[data-stime-edit]');
    setTimeout(() => { if (box?.isConnected && !box.contains(document.activeElement)) commitSchedTime(box); }, 0);
  }
  if (t.dataset.field && t.dataset.field !== 'process.name') { const [a, b] = t.dataset.field.split('.'); t.value = draft[a][b]; }
});
document.addEventListener('focusin', (e) => { if (e.target.dataset.dial || e.target.dataset.se) e.target.select(); });
function stepDial(t, dir) {
  const max = +t.dataset.max;
  let v = (parseInt(t.value, 10) || 0) + dir;
  if (v > max) v = 0; if (v < 0) v = max;
  t.value = fmtDial(t, setDial(t, v)); dialChanged();
}
document.addEventListener('wheel', (e) => {
  const chips = e.target.closest('.stage > .chips');
  if (chips && chips.scrollWidth > chips.clientWidth) { e.preventDefault(); chips.scrollLeft += e.deltaY || e.deltaX; return; }
  const t = e.target.closest('[data-dial]');
  if (!t) return;
  e.preventDefault(); stepDial(t, e.deltaY < 0 ? 1 : -1);
}, { passive: false });
// Command palette (Ctrl+K) & bảng phím tắt (?)
let paletteEl = null;
let palettePrevFocus = null;
function closePalette(restoreFocus = true) {
  if (!paletteEl) return;
  paletteEl.remove();
  paletteEl = null;
  const prev = palettePrevFocus;
  palettePrevFocus = null;
  if (restoreFocus && prev?.isConnected) prev.focus({ preventScroll: true });
}
function openShortcutsHelp() {
  const prev = palettePrevFocus || document.activeElement;
  closePalette(false);
  palettePrevFocus = prev;
  const ov = document.createElement('div');
  ov.className = 'pal-bg';
  ov.innerHTML = `<div class="pal" role="dialog" aria-modal="true" aria-label="Phím tắt">
    <div class="pal-head"><b>Phím tắt</b><button class="toast-x" data-pal-close aria-label="Đóng">×</button></div>
    <div class="pal-keys">
      <div><span>Chuyển màn hình</span><kbd>Ctrl+1…6</kbd></div>
      <div><span>Mở bảng lệnh nhanh</span><kbd>Ctrl+K</kbd></div>
      <div><span>Mở bảng phím tắt</span><kbd>?</kbd></div>
      <div><span>Bắt đầu hẹn giờ</span><kbd>Ctrl+Enter</kbd></div>
      <div><span>Chọn nhanh mốc thời gian</span><kbd>1…7</kbd></div>
      <div><span>Huỷ hẹn giờ đang chạy</span><kbd>Ctrl+.</kbd></div>
      <div><span>Phát / tạm dừng âm thanh</span><kbd>Space</kbd></div>
      <div><span>Hoàn tác lần xoá/huỷ gần nhất</span><kbd>Ctrl+Z</kbd></div>
      <div><span>Đổi tên preset đang chọn</span><kbd>F2</kbd></div>
      <div><span>Xoá mục đang chọn</span><kbd>Delete</kbd></div>
    </div>
  </div>`;
  document.body.appendChild(ov);
  paletteEl = ov;
  const closeBtn = ov.querySelector('[data-pal-close]');
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-pal-close]')) closePalette(true); });
  ov.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closePalette(true); }
    else if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus(); }
  });
  closeBtn.focus({ preventScroll: true });
}
function openCommandPalette() {
  if (paletteEl) { closePalette(true); return; }
  palettePrevFocus = document.activeElement;
  const items = [
    ...VIEWS.map(([k, l], i) => ({ group: 'Điều hướng', label: `Đi tới ${l}`, kbd: `Ctrl+${i + 1}`, run: () => { view = k; savingPreset = false; renaming = null; editingSched = null; render(); } })),
    { group: 'Điều hướng', label: 'Xem bảng phím tắt', kbd: '?', run: () => openShortcutsHelp() },
    ...(snap?.job
      ? [{ group: 'Hẹn giờ', label: 'Huỷ hẹn giờ đang chạy', kbd: 'Ctrl+.', run: () => {
        const prevJob = { action: snap.job.action, trigger: snap.job.trigger, source: snap.job.source };
        sleepy.cancel().then(() => toast('Đã huỷ hẹn giờ', { action: 'Hoàn tác', undo: () => start(prevJob.action, prevJob.trigger, prevJob.source) }));
      } }]
      : [{ group: 'Hẹn giờ', label: 'Bắt đầu hẹn giờ', kbd: 'Ctrl+Enter', run: () => { view = 'timer'; render(); start(draft.action, trigger(), 'manual'); } }]),
    ...(st?.presets || []).map((p) => ({ group: 'Preset', label: p.name, meta: S.ACTIONS[p.action]?.label || '', run: () => { start(p.action, p.trigger, `preset:${p.id}`); view = 'timer'; render(); } })),
    { group: 'Âm thanh', label: Ambient.playing ? 'Tạm dừng âm thanh nền' : 'Phát âm thanh nền', kbd: 'Space', run: () => Ambient.togglePlay() },
    { group: 'Âm thanh', label: 'Trộn ngẫu nhiên 3 âm thanh', meta: 'Âm thanh', run: () => { Ambient.shuffle(); view = 'sounds'; render(); } },
    { group: 'Âm thanh', label: 'Tắt hết âm thanh nền', meta: 'Âm thanh', run: () => Ambient.clearAll() },
  ];
  const groupOrder = ['Điều hướng', 'Hẹn giờ', 'Preset', 'Âm thanh'];
  const ov = document.createElement('div');
  ov.className = 'pal-bg';
  ov.innerHTML = `<div class="pal" role="dialog" aria-modal="true" aria-label="Bảng lệnh nhanh">
    <div class="pal-search"><span class="pal-search-ico" aria-hidden="true">${Icons.search}</span><input class="pal-in" placeholder="Tìm lệnh…" autocomplete="off" aria-label="Tìm lệnh"></div>
    <div class="pal-list-wrap"><div class="pal-list" role="listbox"></div></div>
    <div class="pal-more" hidden></div>
  </div>`;
  document.body.appendChild(ov);
  paletteEl = ov;
  const input = ov.querySelector('.pal-in');
  const wrapEl = ov.querySelector('.pal-list-wrap');
  const listEl = ov.querySelector('.pal-list');
  const moreEl = ov.querySelector('.pal-more');
  let active = 0, filtered = [];
  const updateMore = () => {
    const btns = [...listEl.querySelectorAll('.pal-item')];
    const bottom = listEl.scrollTop + listEl.clientHeight;
    let below = 0;
    for (const b of btns) { if (b.offsetTop + b.offsetHeight > bottom + 6) below++; }
    wrapEl.classList.toggle('has-more', below > 0);
    moreEl.hidden = below === 0;
    if (below > 0) moreEl.textContent = `Còn ${below} lệnh bên dưới`;
  };
  const paint = () => {
    const rawQ = input.value.trim();
    const q = rawQ.toLowerCase();
    const matched = q ? items.filter((it) => `${it.group} ${it.label} ${it.meta || ''} ${it.kbd || ''}`.toLowerCase().includes(q)) : items;
    filtered = [];
    let html = '';
    for (const g of groupOrder) {
      const grp = matched.filter((it) => it.group === g);
      if (!grp.length) continue;
      html += `<div class="pal-group">${esc(g)}</div>`;
      for (const it of grp) {
        const idx = filtered.length;
        filtered.push(it);
        const right = it.kbd ? `<kbd>${esc(it.kbd)}</kbd>` : (it.meta ? `<span class="pal-meta">${esc(it.meta)}</span>` : '');
        html += `<button class="pal-item ${idx === active ? 'on' : ''}" role="option" aria-selected="${idx === active}" data-pi="${idx}"><span class="pal-label">${esc(it.label)}</span>${right}</button>`;
      }
    }
    if (!filtered.length) {
      active = 0;
      listEl.innerHTML = `<div class="pal-empty">Không có lệnh khớp "${esc(rawQ)}"</div>`;
      updateMore();
      return;
    }
    active = Math.max(0, Math.min(active, filtered.length - 1));
    listEl.innerHTML = html;
    const onBtn = listEl.querySelector(`[data-pi="${active}"]`);
    if (onBtn) {
      listEl.querySelectorAll('.pal-item.on').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-selected', 'false'); });
      onBtn.classList.add('on');
      onBtn.setAttribute('aria-selected', 'true');
      onBtn.scrollIntoView({ block: 'nearest' });
    }
    updateMore();
  };
  paint();
  input.focus({ preventScroll: true });
  input.addEventListener('input', () => { active = 0; paint(); });
  listEl.addEventListener('scroll', updateMore);
  listEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pi]');
    if (!b) return;
    const it = filtered[+b.dataset.pi];
    closePalette(false);
    if (it) it.run();
  });
  ov.addEventListener('click', (e) => { if (e.target === ov) closePalette(true); });
  ov.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closePalette(true); }
    else if (e.key === 'Tab') { e.preventDefault(); input.focus(); }
    else if (e.key === 'ArrowDown' && filtered.length) { e.preventDefault(); active = (active + 1) % filtered.length; paint(); }
    else if (e.key === 'ArrowUp' && filtered.length) { e.preventDefault(); active = (active - 1 + filtered.length) % filtered.length; paint(); }
    else if (e.key === 'Enter' && filtered[active]) { e.preventDefault(); const it = filtered[active]; closePalette(false); it.run(); }
  });
}

document.addEventListener('keydown', (e) => {
  const t = e.target;
  const inInput = ['INPUT', 'TEXTAREA'].includes(t.tagName);
  if (e.ctrlKey && e.key.toLowerCase() === 'k') { e.preventDefault(); openCommandPalette(); return; }
  if (paletteEl) { if (e.key === 'Escape') { e.preventDefault(); closePalette(true); } return; }
  if (t.dataset?.dial && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); stepDial(t, e.key === 'ArrowUp' ? 1 : -1); return; }
  if (t.dataset?.renameInput) { if (e.key === 'Enter') t.blur(); if (e.key === 'Escape') { renaming = null; render(); } return; }
  if (t.dataset?.se) {
    const box = t.closest('[data-stime-edit]');
    if (e.key === 'Enter') { e.preventDefault(); commitSchedTime(box); return; }
    if (e.key === 'Escape') { e.preventDefault(); editingSched = null; render(); return; }
    return;
  }
  if (t.id === 'preset-name') { if (e.key === 'Enter') savePreset(); if (e.key === 'Escape') { savingPreset = false; render(); } return; }
  if (t.id === 'mix-name') { if (e.key === 'Enter') $('[data-do="mix-save"]')?.click(); if (e.key === 'Escape') { savingMix = false; render(); } return; }
  if (e.ctrlKey && e.key.toLowerCase() === 'z' && !inInput) {
    if (undoStack.length) { e.preventDefault(); runUndo(); return; }
  }
  if (!inInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key === '?') { e.preventDefault(); openShortcutsHelp(); return; }
    if (e.key === ' ' && view === 'sounds' && t.tagName !== 'BUTTON') { e.preventDefault(); Ambient.togglePlay(); return; }
    if (view === 'timer' && !snap?.job && /^[1-7]$/.test(e.key)) {
      const chip = document.querySelectorAll('.stage .chips .chip')[+e.key - 1];
      if (chip) { e.preventDefault(); chip.click(); return; }
    }
    if (e.key === 'F2' && view === 'presets') {
      const row = t.closest?.('[data-key^="p-"]');
      if (row) { e.preventDefault(); renaming = row.dataset.key.slice(2); render(); return; }
    }
    if (e.key === 'Delete' && view === 'presets') {
      const row = t.closest?.('[data-key^="p-"]');
      if (row) { e.preventDefault(); deletePreset(row.dataset.key.slice(2)); return; }
    }
    if (e.key === 'Delete' && view === 'schedules') {
      const row = t.closest?.('[data-key^="s-"]');
      if (row) { e.preventDefault(); deleteSchedule(row.dataset.key.slice(2)); return; }
    }
  }
  if (e.ctrlKey && e.key === '.' && view === 'timer' && snap?.job && !confirmPop && !Dropdown.isOpen()) {
    e.preventDefault();
    const prevJob = { action: snap.job.action, trigger: snap.job.trigger, source: snap.job.source };
    sleepy.cancel().then(() => toast('Đã huỷ hẹn giờ.', {
      action: 'Hoàn tác',
      undo: () => start(prevJob.action, prevJob.trigger, prevJob.source),
    }));
    return;
  }
  if (e.ctrlKey && /^[1-6]$/.test(e.key)) { view = VIEWS[+e.key - 1][0]; savingPreset = false; render(); return; }
  if ((e.key === 'Enter' && e.ctrlKey || (e.key === 'Enter' && t.tagName !== 'BUTTON')) && view === 'timer' && !snap?.job) {
    start(draft.action, trigger(), 'manual');
  }
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
