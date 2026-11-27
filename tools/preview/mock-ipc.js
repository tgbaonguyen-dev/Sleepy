// Giả lập IPC của Tauri để xem trước giao diện trong trình duyệt thường (không cần build Rust).
// Nạp TRƯỚC ui/js/bridge.js. Cấu hình qua window.__MOCK__ = { theme, job, dryRun, history }.
(() => {
  const cfg = Object.assign({ theme: 'dark', job: null, history: 6 }, window.__MOCK__ || {});
  const listeners = {};
  const now = () => Date.now();
  const id = () => Math.random().toString(16).slice(2, 12);
  const actions = ['shutdown', 'reboot', 'suspend', 'hibernate', 'lock', 'logout'];
  const st = {
    settings: { warnMinutes: 2, graceSeconds: 60, sound: true, dryRun: !!cfg.dryRun, closeToTray: true, autostart: false,
      startMinimized: false, theme: cfg.theme, preCommand: '' },
    presets: [
      { id: 'p1', name: 'Ngủ trưa', action: 'suspend', trigger: { type: 'countdown', seconds: 1800 } },
      { id: 'p2', name: 'Xem phim rồi ngủ', action: 'shutdown', trigger: { type: 'countdown', seconds: 7200 } },
      { id: 'p3', name: 'Tải xong thì tắt', action: 'shutdown', trigger: { type: 'net', kbps: 50, minutes: 3 } },
      { id: 'p4', name: 'Rời máy thì khoá', action: 'lock', trigger: { type: 'idle', minutes: 10 } },
    ],
    schedules: [{ id: 's1', time: '23:30', days: [0, 1, 2, 3, 4, 5, 6], action: 'shutdown', enabled: true, lastArmed: 0 },
      { id: 's2', time: '07:00', days: [1, 2, 3, 4, 5], action: 'lock', enabled: false, lastArmed: 0 }],
    history: Array.from({ length: cfg.history }, (_, i) => ({ id: id(), at: now() - i * 3.6e6, action: actions[i % 6],
      trigger: { type: 'countdown', seconds: 1800 * (i + 1) }, source: i % 2 ? 'manual' : 'preset:p1', result: ['done', 'cancel', 'dry', 'error'][i % 4],
      note: i % 4 === 3 ? 'Không có quyền' : null })),
    draft: { action: 'shutdown', trigger: { type: 'countdown', seconds: 3600 } },
    caps: { shutdown: 'yes', reboot: 'yes', suspend: 'yes', hibernate: 'no', lock: 'yes', logout: 'yes' },
    hasBattery: true, user: 'camellya', job: null,
    sensors: { cpu: 12, net: 38, battery: { percent: 64, charging: false, status: 'Discharging' }, idle: 4, process: null },
    next: [],
  };
  let job = null;
  const mkJob = (action, trigger, source) => {
    const t = now();
    const timed = trigger.type === 'countdown' || trigger.type === 'at';
    let deadline = null;
    if (trigger.type === 'countdown') deadline = t + trigger.seconds * 1000;
    if (trigger.type === 'at') { const [h, m] = trigger.time.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); if (d <= t) d.setDate(d.getDate() + 1); deadline = d.getTime(); }
    return { id: id(), action, trigger, source: source || 'manual', startedAt: t, phase: timed ? 'countdown' : 'watching',
      deadline, totalMs: deadline ? deadline - t : null, warned: false, satisfiedSince: null, fromCondition: false, need: 180000 };
  };
  if (cfg.job) job = mkJob(cfg.job.action || 'shutdown', cfg.job.trigger || { type: 'countdown', seconds: 95 }, 'manual');
  const snapshot = () => ({
    job: job ? { ...job, remaining: job.deadline ? Math.max(0, job.deadline - now()) : null, satisfiedMs: job.phase === 'watching' ? 72000 : 0 } : null,
    sensors: { ...st.sensors, cpu: 8 + Math.random() * 10, net: 20 + Math.random() * 40 },
    next: st.schedules.map((s) => ({ id: s.id, at: s.enabled ? now() + 3.6e6 : null })),
  });
  const full = () => ({ ...st, ...snapshot() });
  const emit = (ch, payload) => (listeners[ch] || []).forEach((f) => f({ payload }));
  const changed = () => emit('state', full());
  const handlers = {
    state_get: () => full(),
    job_start: ({ action, trigger, source }) => { job = mkJob(action, trigger, source); st.draft = { action, trigger }; setTimeout(changed); return { ok: true }; },
    job_cancel: () => { job = null; setTimeout(changed); },
    job_postpone: ({ minutes }) => { if (job && job.deadline) { job.deadline += minutes * 60000; job.totalMs += minutes * 60000; } setTimeout(changed); },
    job_now: () => { job = null; setTimeout(changed); },
    draft_set: ({ draft }) => { st.draft = draft; },
    settings_set: ({ patch }) => { Object.assign(st.settings, patch); setTimeout(changed); },
    presets_set: ({ list }) => { st.presets = list; setTimeout(changed); },
    schedules_set: ({ list }) => { st.schedules = list; setTimeout(changed); },
    history_clear: () => { st.history = []; setTimeout(changed); },
    proc_list: () => ['firefox', 'obs', 'code', 'steam', 'zsh'],
    proc_check: ({ name }) => ['firefox', 'obs', 'code', 'steam'].includes(name),
    win_action: () => {},
  };
  window.__TAURI__ = {
    core: { invoke: (cmd, args) => Promise.resolve(handlers[cmd] ? handlers[cmd](args || {}) : null) },
    event: { listen: (ch, fn) => { (listeners[ch] = listeners[ch] || []).push(fn); return Promise.resolve(() => {}); } },
  };
  setInterval(() => emit('tick', snapshot()), 1000);
})();
