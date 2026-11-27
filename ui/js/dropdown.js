/* global window, document */
// Dropdown: ô chọn tự vẽ thay cho <select> (WebKitGTK vẽ <select> bằng popup GTK thô, không theo theme).
//
// Mẫu HTML (để morph vá tại chỗ):
//   Dropdown.html({ opts: 'action', value: 'shutdown', key: 'dd-new', attrs: 'data-sact', labelledby: 'lbl-x' })
// Danh sách lựa chọn đăng ký một lần: Dropdown.define('action', [{ value, label, icon }]).
//
// Giá trị nằm ở thuộc tính data-value của phần tử gốc .dd. Chọn xong: data-value đổi, nút hiển thị đổi theo và
// phần tử gốc phát sự kiện `change` (nổi bọt) — trình xử lý đọc e.target.dataset.value (hoặc e.target.value).
//
// Menu mở ra được gắn thẳng vào <body> (position: fixed) nên không bị khung cha cắt, và không nằm trong vùng
// morph vẽ lại: vẽ lại lúc menu đang mở không làm mất menu. Nút mở được nhận diện lại qua data-key nếu morph
// có thay nút mới; nút biến mất hẳn thì menu tự đóng.
window.Dropdown = (() => {
  const sets = Object.create(null);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CHEV = '<svg class="dd-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
  const CHECK = '<svg class="dd-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5.5 12.5 4 4 9-9.5"/></svg>';
  const GAP = 6, EDGE = 8;
  let uid = 0;

  function define(name, list) { sets[name] = list; }
  const optsOf = (root) => sets[root?.dataset.ddOpts] || [];
  const find = (root, v) => optsOf(root).find((o) => o.value === v) || optsOf(root)[0];

  function face(o) {
    return `<span class="dd-ico" aria-hidden="true">${o?.icon || ''}</span><span class="dd-text">${esc(o?.label || '')}</span>${CHEV}`;
  }
  function html({ opts, value, key, attrs = '', labelledby = '', cls = '', title = '' }) {
    const o = (sets[opts] || []).find((x) => x.value === value) || (sets[opts] || [])[0];
    return `<div class="dd ${cls}" data-dd-opts="${esc(opts)}" data-value="${esc(o?.value)}" data-key="${esc(key)}" ${attrs}>` +
      `<button type="button" class="dd-btn" aria-haspopup="listbox" aria-expanded="false" data-morph-keep="aria-expanded aria-controls"` +
      `${labelledby ? ` aria-labelledby="${esc(labelledby)} ${esc(key)}-v"` : ''}${title ? ` title="${esc(title)}"` : ''}>` +
      `<span class="dd-face" id="${esc(key)}-v">${face(o)}</span></button></div>`;
  }

  // ----- Trạng thái menu đang mở (chỉ một menu mở cùng lúc) -----
  let cur = null; // { root, key, btn, menu, active }
  let typed = '', typedAt = 0;

  const fold = (s) => s.toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const rootOf = () => {
    if (!cur) return null;
    if (cur.root.isConnected) return cur.root;
    // morph đã thay phần tử: tìm lại theo data-key
    const again = document.querySelector(`.dd[data-key="${CSS.escape(cur.key)}"]`);
    if (again) { cur.root = again; cur.btn = again.querySelector('.dd-btn'); syncExpanded(true); }
    return again;
  };
  function syncExpanded(open) {
    const b = cur?.btn; if (!b) return;
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) b.setAttribute('aria-controls', cur.menu.id); else b.removeAttribute('aria-controls');
  }

  function build(root) {
    const list = optsOf(root), v = root.dataset.value, id = `dd-menu-${++uid}`;
    const menu = document.createElement('ul');
    menu.className = 'dd-menu';
    menu.id = id;
    menu.setAttribute('role', 'listbox');
    menu.tabIndex = -1;
    const lb = root.querySelector('.dd-btn').getAttribute('aria-labelledby');
    if (lb) menu.setAttribute('aria-labelledby', lb.split(' ')[0]);
    menu.innerHTML = list.map((o, i) => `<li role="option" id="${id}-${i}" data-value="${esc(o.value)}" aria-selected="${o.value === v}">` +
      `<span class="dd-ico" aria-hidden="true">${o.icon || ''}</span><span class="dd-text">${esc(o.label)}</span>${CHECK}</li>`).join('');
    return menu;
  }

  function place() {
    const root = rootOf(); if (!root || !cur) return;
    const m = cur.menu, r = cur.btn.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    m.style.minWidth = `${Math.round(r.width)}px`;
    m.style.maxHeight = '';
    const w = m.offsetWidth, h = m.offsetHeight;
    const below = H - r.bottom - GAP - EDGE, above = r.top - GAP - EDGE;
    const up = h > below && above > below;
    const room = up ? above : below;
    if (h > room) m.style.maxHeight = `${Math.max(80, room)}px`;
    const hh = Math.min(h, Math.max(80, room));
    const top = up ? r.top - GAP - hh : r.bottom + GAP;
    const left = Math.max(EDGE, Math.min(r.left, W - w - EDGE));
    m.style.left = `${Math.round(left)}px`;
    m.style.top = `${Math.round(Math.max(EDGE, Math.min(top, H - hh - EDGE)))}px`;
    m.dataset.side = up ? 'top' : 'bottom';
  }

  function setActive(i, scroll = true) {
    if (!cur) return;
    const items = [...cur.menu.children];
    if (!items.length) return;
    i = Math.max(0, Math.min(items.length - 1, i));
    cur.active = i;
    items.forEach((li, k) => li.classList.toggle('active', k === i));
    cur.menu.setAttribute('aria-activedescendant', items[i].id);
    if (scroll) { // cuộn trong menu (chỉ khi menu bị giới hạn chiều cao), không bao giờ cuộn trang
      const m = cur.menu, li = items[i];
      if (li.offsetTop < m.scrollTop) m.scrollTop = li.offsetTop;
      else if (li.offsetTop + li.offsetHeight > m.scrollTop + m.clientHeight) m.scrollTop = li.offsetTop + li.offsetHeight - m.clientHeight;
    }
  }

  function open(root, { focusLast = false } = {}) {
    if (cur && cur.root === root) return;
    close({ focus: false, instant: true });
    const btn = root.querySelector('.dd-btn');
    const menu = build(root);
    document.body.appendChild(menu);
    cur = { root, key: root.dataset.key, btn, menu, active: 0 };
    syncExpanded(true);
    place();
    const sel = optsOf(root).findIndex((o) => o.value === root.dataset.value);
    setActive(focusLast ? optsOf(root).length - 1 : Math.max(0, sel), false);
    menu.focus({ preventScroll: true });
    // Khung hình kế tiếp mới thêm .in để transition mở chạy
    if (reduce.matches) menu.classList.add('in');
    else requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('in')));
    menu.addEventListener('pointermove', (e) => {
      const li = e.target.closest('[role=option]'); if (li) setActive([...menu.children].indexOf(li), false);
    });
    menu.addEventListener('click', (e) => {
      const li = e.target.closest('[role=option]'); if (li) choose(li.dataset.value);
    });
    menu.addEventListener('keydown', onMenuKey);
    menu.addEventListener('focusout', (e) => {
      // Focus rời menu sang chỗ khác (không phải về nút mở): đóng
      if (cur?.menu === menu && !menu.contains(e.relatedTarget) && e.relatedTarget && e.relatedTarget !== cur.btn) close({ focus: false });
    });
  }

  function close({ focus = true, instant = false } = {}) {
    if (!cur) return;
    const c = cur; cur = null;
    const btn = c.root.isConnected ? c.btn : document.querySelector(`.dd[data-key="${CSS.escape(c.key)}"] .dd-btn`);
    if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.removeAttribute('aria-controls'); }
    if (focus && btn) btn.focus({ preventScroll: true });
    const m = c.menu;
    m.removeAttribute('aria-activedescendant');
    if (instant || reduce.matches || !m.classList.contains('in')) { m.remove(); return; }
    m.classList.remove('in');
    m.classList.add('out');
    let done = false;
    const fin = () => { if (!done) { done = true; m.remove(); } };
    m.addEventListener('transitionend', fin, { once: true });
    setTimeout(fin, 220);
  }

  function choose(v) {
    const root = rootOf(); if (!root) return close();
    const changed = root.dataset.value !== v;
    if (changed) {
      root.dataset.value = v;
      const faceEl = root.querySelector('.dd-face');
      if (faceEl) faceEl.innerHTML = face(find(root, v));
    }
    close();
    if (changed) root.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function typeahead(ch) {
    const now = Date.now();
    typed = now - typedAt > 700 ? ch : typed + ch;
    typedAt = now;
    const list = optsOf(cur.root), n = list.length;
    const same = typed.length > 1 && [...typed].every((c) => c === typed[0]);
    const q = same ? typed[0] : typed;
    // Gõ lặp một chữ: đi vòng qua các mục cùng chữ đầu; gõ nhiều chữ: tìm mục khớp tiền tố
    const start = q.length === 1 ? cur.active + 1 : cur.active;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (fold(list[i].label).startsWith(fold(q))) return setActive(i);
    }
  }

  function onMenuKey(e) {
    if (!cur) return;
    const n = cur.menu.children.length, k = e.key;
    if (k === 'ArrowDown') { e.preventDefault(); setActive(cur.active + 1); }
    else if (k === 'ArrowUp') { e.preventDefault(); setActive(cur.active - 1); }
    else if (k === 'Home' || k === 'PageUp') { e.preventDefault(); setActive(0); }
    else if (k === 'End' || k === 'PageDown') { e.preventDefault(); setActive(n - 1); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); choose(cur.menu.children[cur.active].dataset.value); }
    else if (k === 'Escape' || k === 'Tab') { e.preventDefault(); close(); }
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); typeahead(k); }
    e.stopPropagation();
  }

  // ----- Nút mở: dùng uỷ quyền sự kiện nên phần tử do morph tạo mới vẫn chạy -----
  let keyOpened = false;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.dd-btn'); if (!btn) return;
    if (keyOpened) { keyOpened = false; return; } // click giả do Enter/Space đã được xử lý ở keydown
    const root = btn.closest('.dd');
    if (cur && cur.root === root) close(); else open(root);
  });
  document.addEventListener('keydown', (e) => {
    const btn = e.target.closest?.('.dd-btn'); if (!btn) return;
    const k = e.key;
    if (k === 'Enter' || k === ' ' || k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      keyOpened = k === 'Enter' || k === ' ';
      open(btn.closest('.dd'), { focusLast: k === 'ArrowUp' });
    }
  }, true);
  document.addEventListener('keyup', () => { if (keyOpened) setTimeout(() => { keyOpened = false; }); }, true);

  // ----- Đóng khi bấm ra ngoài, cuộn, đổi cỡ cửa sổ -----
  document.addEventListener('pointerdown', (e) => {
    if (!cur) return;
    if (cur.menu.contains(e.target) || e.target.closest?.('.dd-btn') === cur.btn) return;
    close({ focus: false });
  }, true);
  window.addEventListener('scroll', (e) => { if (cur && !cur.menu.contains(e.target)) close({ focus: false }); }, true);
  window.addEventListener('resize', () => close({ focus: false }));
  window.addEventListener('blur', () => close({ focus: false }));
  // morph thay / gỡ nút mở lúc menu đang mở: theo lại nút mới, hoặc đóng nếu nút không còn
  new MutationObserver(() => {
    if (!cur) return;
    if (!cur.root.isConnected && !rootOf()) close({ focus: false, instant: true });
  }).observe(document.documentElement, { childList: true, subtree: true });

  return { define, html, close, isOpen: () => !!cur };
})();
