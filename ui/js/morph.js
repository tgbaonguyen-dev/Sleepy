/* global window */
// morph(container, html): cập nhật DOM tại chỗ thay vì thay cả innerHTML.
//
// Thay innerHTML là xoá rồi tạo lại mọi nút: hoạt ảnh vào chạy lại, transition CSS mất (nút cũ đã
// biến mất), hover/focus bị reset — đó là cái "chớp" mỗi lần bấm. Hàm này so cây mới với cây cũ
// và chỉ sửa phần khác: giữ nguyên nút cùng thẻ ở cùng vị trí, đổi thuộc tính/chữ, thêm/bớt nút thừa.
//
// Quy ước trong HTML:
//   data-key="…" (hoặc id)   khoá nhận diện con trong danh sách; nút đổi chỗ vẫn được giữ, khác khoá thì tạo mới.
//   data-own                  nút do JS tự quản lý nội dung (vd. #dial-svg): morph giữ nguyên, không đụng vào.
//   data-morph-keep="style"   các thuộc tính JS tự đặt (cách nhau bằng dấu cách) mà morph không được xoá/ghi đè.
//
// Ô nhập đang focus luôn giữ nguyên value người dùng đang gõ. Nút SVG được trình phân tích HTML tạo
// đúng namespace; khi container chính là một phần tử SVG, chuỗi được bọc trong <svg> để phân tích.
(() => {
  const SVG = 'http://www.w3.org/2000/svg';

  /** Phân tích chuỗi HTML thành một nút cha tạm (cùng ngữ cảnh namespace với container). */
  function parse(container, html) {
    const tpl = document.createElement('template');
    const inSvg = container.namespaceURI === SVG && container.localName !== 'foreignObject';
    tpl.innerHTML = inSvg ? `<svg xmlns="${SVG}">${html}</svg>` : html;
    return inSvg ? tpl.content.firstChild : tpl.content;
  }

  const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute('data-key') || n.id || null : null);
  const same = (a, b) => a.nodeType === b.nodeType &&
    (a.nodeType !== 1 || (a.localName === b.localName && a.namespaceURI === b.namespaceURI));

  /** Đưa danh sách con của `parent` về giống `from`, tái dùng nút cũ khi có thể. */
  function patchChildren(parent, from) {
    const keyed = new Map();
    for (let c = parent.firstChild; c; c = c.nextSibling) { const k = keyOf(c); if (k) keyed.set(k, c); }
    let cur = parent.firstChild; // nút cũ đầu tiên chưa xử lý; mọi nút đứng trước nó đã đúng chỗ
    for (const n of [...from.childNodes]) {
      const k = keyOf(n);
      let match = null;
      if (k) { const m = keyed.get(k); if (m && same(m, n)) { match = m; keyed.delete(k); } }
      else if (cur && !keyOf(cur) && same(cur, n)) match = cur;
      if (match) {
        if (match === cur) cur = cur.nextSibling; else parent.insertBefore(match, cur);
        patch(match, n);
      } else {
        parent.insertBefore(n, cur); // nút mới: chuyển thẳng từ cây tạm sang (đã đúng namespace)
      }
    }
    while (cur) { const nx = cur.nextSibling; parent.removeChild(cur); cur = nx; }
  }

  /** Đồng bộ thuộc tính; bỏ qua những thuộc tính được khai báo trong data-morph-keep. */
  function syncAttrs(old, n) {
    const keep = (old.getAttribute('data-morph-keep') || '').split(/\s+/).filter(Boolean);
    for (const a of [...old.attributes]) {
      if (!keep.includes(a.name) && !n.hasAttributeNS(a.namespaceURI, a.localName)) old.removeAttributeNS(a.namespaceURI, a.localName);
    }
    for (const a of n.attributes) {
      if (keep.includes(a.name) && old.hasAttribute(a.name)) continue;
      if (old.getAttributeNS(a.namespaceURI, a.localName) !== a.value) old.setAttributeNS(a.namespaceURI, a.name, a.value);
    }
  }

  function patch(old, n) {
    if (old.nodeType !== 1) { if (old.nodeValue !== n.nodeValue) old.nodeValue = n.nodeValue; return; }
    if (old.hasAttribute('data-own')) return;
    const editing = old === document.activeElement;
    if (old.localName === 'input') {
      // Chỉ đẩy value mới vào khi bản mẫu thật sự đổi giá trị và người dùng không đang gõ ở đó.
      const prev = old.getAttribute('value'), next = n.getAttribute('value');
      syncAttrs(old, n);
      if (!editing && prev !== next) old.value = next ?? '';
      if (old.type === 'checkbox' || old.type === 'radio') old.checked = n.hasAttribute('checked');
      return;
    }
    syncAttrs(old, n);
    patchChildren(old, n);
    if (old.localName === 'select' && !editing) {
      const sel = n.querySelector('option[selected]');
      if (sel) old.value = sel.getAttribute('value') ?? sel.textContent;
    }
  }

  window.morph = function morph(container, html) {
    if (!container) return;
    patchChildren(container, parse(container, html));
  };
})();
