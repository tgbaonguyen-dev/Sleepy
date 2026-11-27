// Dùng chung cho main process và giao diện.
(function (root) {
  const ACTIONS = {
    shutdown: { label: 'Tắt máy', verb: 'Tắt máy', hint: 'Tắt hoàn toàn' },
    reboot: { label: 'Khởi động lại', verb: 'Khởi động lại', hint: 'Tắt rồi bật lại' },
    suspend: { label: 'Ngủ', verb: 'Cho máy ngủ', hint: 'Suspend vào RAM' },
    hibernate: { label: 'Ngủ đông', verb: 'Ngủ đông', hint: 'Lưu ra ổ đĩa' },
    lock: { label: 'Khoá màn hình', verb: 'Khoá màn hình', hint: 'Giữ nguyên mọi thứ' },
    logout: { label: 'Đăng xuất', verb: 'Đăng xuất', hint: 'Đóng phiên làm việc' }
  };

  const TRIGGERS = {
    countdown: 'Sau bao lâu',
    at: 'Đúng giờ',
    idle: 'Không đụng máy',
    battery: 'Pin sắp cạn',
    net: 'Tải xong',
    cpu: 'Máy hết bận',
    process: 'Tắt một app'
  };

  const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const DAY_LONG = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

  const pad = (n) => String(n).padStart(2, '0');

  function clock(ms) { // 1:05:09 hoặc 05:09
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(x)}` : `${pad(m)}:${pad(x)}`;
  }

  function human(ms) { // "1 giờ 30 phút"
    const totalMin = Math.round(ms / 60000);
    if (ms < 60000) return `${Math.max(0, Math.ceil(ms / 1000))} giây`;
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    if (h && m) return `${h} giờ ${m} phút`;
    if (h) return `${h} giờ`;
    return `${m} phút`;
  }

  function hhmm(ts) { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

  function dayWord(ts) {
    const d = new Date(ts), now = new Date();
    const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((start(d) - start(now)) / 86400000);
    if (diff === 0) return 'hôm nay';
    if (diff === 1) return 'ngày mai';
    return DAY_LONG[d.getDay()].toLowerCase();
  }

  function atDeadline(time, now = Date.now()) {
    const [h, m] = String(time || '0:0').split(':').map(Number);
    const d = new Date(now); d.setHours(h || 0, m || 0, 0, 0);
    if (d.getTime() <= now + 1000) d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  function triggerText(t) {
    switch (t.type) {
      case 'countdown': return `sau ${human(t.seconds * 1000)}`;
      case 'at': return `lúc ${t.time}`;
      case 'idle': return `khi bạn rời máy ${t.minutes} phút`;
      case 'battery': return `khi pin còn dưới ${t.percent}%`;
      case 'net': return `khi tải xong (mạng dưới ${t.kbps} KB/s suốt ${t.minutes} phút)`;
      case 'cpu': return `khi máy hết bận (CPU dưới ${t.percent}% suốt ${t.minutes} phút)`;
      case 'process': return `khi “${t.name}” đóng lại`;
      default: return '';
    }
  }

  function describe(action, trigger) {
    return `${ACTIONS[action]?.verb || action} ${triggerText(trigger)}`;
  }

  function kb(v) {
    if (v == null) return '—';
    if (v >= 1024) return `${(v / 1024).toFixed(v >= 10240 ? 0 : 1)} MB/s`;
    return `${Math.round(v)} KB/s`;
  }

  const api = { ACTIONS, TRIGGERS, DAYS, DAY_LONG, pad, clock, human, hhmm, dayWord, atDeadline, triggerText, describe, kb };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Shared = api;
})(typeof window !== 'undefined' ? window : globalThis);
