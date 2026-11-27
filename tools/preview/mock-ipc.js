// Giả lập IPC của Tauri để xem trước giao diện trong trình duyệt thường (không cần build Rust).
// Nạp TRƯỚC ui/js/bridge.js. Cấu hình qua window.__MOCK__ = { theme, job, dryRun, history, extra }.
// extra: số preset và lịch lặp thêm vào để thử phân trang.
(() => {
  const cfg = Object.assign({ theme: 'dark', job: null, history: 6, extra: 0 }, window.__MOCK__ || {});
  const listeners = {};
  const now = () => Date.now();
  const id = () => Math.random().toString(16).slice(2, 12);
  const actions = ['shutdown', 'reboot', 'suspend', 'hibernate', 'lock', 'logout'];
  const st = {
    settings: { warnMinutes: 2, graceSeconds: 60, sound: true, dryRun: !!cfg.dryRun, closeToTray: true, autostart: false,
      startMinimized: false, keepAwake: true, theme: cfg.theme, preCommand: '' },
    presets: [
      { id: 'p1', name: 'Tạm ngưng sau 30 phút', action: 'suspend', trigger: { type: 'countdown', seconds: 1800 } },
      { id: 'p2', name: 'Tắt máy sau 2 giờ', action: 'shutdown', trigger: { type: 'countdown', seconds: 7200 } },
      { id: 'p3', name: 'Tắt máy khi tải hoàn tất', action: 'shutdown', trigger: { type: 'net', kbps: 50, minutes: 3 } },
      { id: 'p4', name: 'Khoá sau 10 phút không hoạt động', action: 'lock', trigger: { type: 'idle', minutes: 10 } },
    ],
    schedules: [{ id: 's1', time: '23:30', days: [0, 1, 2, 3, 4, 5, 6], action: 'shutdown', enabled: true, lastArmed: 0 },
      { id: 's2', time: '07:00', days: [1, 2, 3, 4, 5], action: 'lock', enabled: false, lastArmed: 0 }],
    history: Array.from({ length: cfg.history }, (_, i) => ({ id: id(), at: now() - i * 3.6e6, action: actions[i % 6],
      trigger: { type: 'countdown', seconds: 1800 * (i + 1) }, source: i % 2 ? 'manual' : 'preset:p1', result: ['done', 'cancel', 'dry', 'error'][i % 4],
      note: i % 4 === 3 ? 'Không có quyền' : null })),
    draft: { action: 'shutdown', trigger: { type: 'countdown', seconds: 3600 } },
    mixPresets: [],
    caps: { shutdown: 'yes', reboot: 'yes', suspend: 'yes', hibernate: 'no', lock: 'yes', logout: 'yes' },
    hasBattery: true, user: 'camellya', job: null,
    sensors: { cpu: 12, net: 38, battery: { percent: 64, charging: false, status: 'Discharging' }, idle: 4, process: null },
    next: [],
  };
  for (let i = 0; i < cfg.extra; i++) {
    st.presets.push({ id: `px${i}`, name: `Preset ${i + 5}`, action: actions[i % 6], trigger: { type: 'countdown', seconds: 600 * (i + 1) } });
    st.schedules.push({ id: `sx${i}`, time: `${String(i % 24).padStart(2, '0')}:15`, days: [1, 3, 5], action: actions[i % 6], enabled: i % 2 === 0, lastArmed: 0 });
  }
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
  const audio = {
    playing: false,
    master: 0.8,
    fadeMinutes: 10,
    fadeLevel: 1,
    fading: false,
    stoppedByTimer: false,
    activePresetId: null,
    lofiTrack: { id: '2-am-debug-loop', title: '2 AM Debug Loop', artist: 'Open Lo-Fi', custom: false },
    lofiTracks: Array.from({ length: 12 }, (_, i) => ({
      id: i === 0 ? '2-am-debug-loop' : `track-${i}`,
      title: i === 0 ? '2 AM Debug Loop' : `Lofi Track ${i + 1}`,
      artist: 'Open Lo-Fi',
      custom: false,
    })),
    lofiProgress: 0.28,
    error: null,
    channels: [
      { id: 'rain', name: 'Mưa nhẹ', desc: 'Hạt mưa rơi đều bên hiên', category: 'rain', art: 'rain', active: true, loading: false, volume: 0.75, pan: 0, swell: false },
      { id: 'thunder', name: 'Mưa giông', desc: 'Sấm rền từ xa qua màn mưa', category: 'rain', art: 'thunder', active: false, loading: false, volume: 0.75, pan: 0, swell: false },
      { id: 'wind', name: 'Gió qua cây', desc: 'Gió lùa qua tán lá rừng', category: 'nature', art: 'wind', active: false, loading: false, volume: 0.75, pan: 0, swell: false },
      { id: 'waves', name: 'Sóng biển', desc: 'Sóng vỗ bờ cát chậm rãi', category: 'nature', art: 'waves', active: false, loading: false, volume: 0.75, pan: 0, swell: false },
      { id: 'fire', name: 'Lửa trại', desc: 'Củi cháy tí tách ấm áp', category: 'nature', art: 'fire', active: false, loading: false, volume: 0.75, pan: 0, swell: false },
      { id: 'crickets', name: 'Dế kêu', desc: 'Đêm hè tĩnh mịch ngoài vườn', category: 'animals', art: 'crickets', active: false, loading: false, volume: 0.75, pan: 0, swell: false },
      { id: 'brown', name: 'Tiếng ồn nâu', desc: 'Âm trầm ấm che tạp âm', category: 'noise', art: 'brown', active: false, loading: false, volume: 0.75, pan: 0, swell: false },
      { id: 'lofi', name: 'Nhạc Lo-Fi', desc: '23 bản lo-fi CC0 êm dịu', category: 'places', art: 'lofi', active: false, loading: false, volume: 0.75, pan: 0, swell: false },
    ],
    presets: [
      { id: 'rainy-night', name: 'Đêm mưa rào', accent: '#7ba3e3', channels: [['rain', 0.8], ['thunder', 0.45], ['brown', 0.35]] },
      { id: 'summer-crickets', name: 'Rừng đêm & Dế', accent: '#6ec99b', channels: [['crickets', 0.7], ['wind', 0.5], ['river', 0.45]] },
      { id: 'cozy-lofi', name: 'Lo-Fi lò sưởi', accent: '#e3a76b', channels: [['lofi', 0.75], ['fire', 0.55], ['rain-tent', 0.4]] },
      { id: 'deep-sleep', name: 'Ngủ sâu Delta', accent: '#a98ee3', channels: [['binaural', 0.55], ['pink', 0.45], ['waves', 0.6]] },
    ],
  };
  const emitAudio = () => emit('audio', audio);
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
    audio_state: () => audio,
    audio_toggle_play: () => { audio.playing = !audio.playing; setTimeout(emitAudio); },
    audio_toggle_channel: ({ id }) => { const c = audio.channels.find((x) => x.id === id); if (c) { c.active = !c.active; if (c.active) audio.playing = true; } audio.activePresetId = null; setTimeout(emitAudio); },
    audio_set_volume: ({ id, volume }) => { const c = audio.channels.find((x) => x.id === id); if (c) c.volume = volume; audio.activePresetId = null; },
    audio_set_master: ({ volume }) => { audio.master = volume; },
    audio_set_fade: ({ minutes }) => { audio.fadeMinutes = minutes; setTimeout(emitAudio); },
    audio_apply_preset: ({ id }) => { const p = audio.presets.find((x) => x.id === id); if (p) { audio.channels.forEach((c) => { c.active = false; }); p.channels.forEach(([cid, v]) => { const c = audio.channels.find((x) => x.id === cid); if (c) { c.active = true; c.volume = v; } }); audio.activePresetId = id; audio.playing = true; } setTimeout(emitAudio); },
    audio_skip_lofi: () => { setTimeout(emitAudio); },
    audio_prev_lofi: () => { setTimeout(emitAudio); },
    audio_select_lofi: ({ id }) => { const t = audio.lofiTracks.find((x) => x.id === id); if (t) audio.lofiTrack = t; const c = audio.channels.find((x) => x.id === 'lofi'); if (c) c.active = true; audio.playing = true; setTimeout(emitAudio); },
    audio_seek_lofi: ({ ratio }) => { audio.lofiProgress = ratio; },
    audio_set_pan: ({ id, pan }) => { const c = audio.channels.find((x) => x.id === id); if (c) c.pan = pan; },
    audio_toggle_swell: ({ id }) => { const c = audio.channels.find((x) => x.id === id); if (c) c.swell = !c.swell; setTimeout(emitAudio); },
    audio_shuffle_mix: () => { audio.playing = true; setTimeout(emitAudio); },
    audio_clear_all: () => { audio.playing = false; audio.channels.forEach((c) => { c.active = false; }); setTimeout(emitAudio); },
    audio_apply_custom_mix: ({ id }) => { audio.activePresetId = id; audio.playing = true; setTimeout(emitAudio); },
    audio_save_mix: ({ name }) => { st.mixPresets.push({ id: id(), name, channels: [['rain', 0.75]] }); setTimeout(changed); },
    audio_delete_mix: ({ id: mid }) => { st.mixPresets = st.mixPresets.filter((m) => m.id !== mid); setTimeout(changed); },
    audio_pick_folder: () => 0,
    audio_pick_files: () => 0,
    audio_remove_custom_track: () => {},
    yt_open: () => 'visible',
    yt_hide: () => 'hidden',
    yt_close: () => 'closed',
    yt_status: () => 'closed',
    yt_media: () => ({ status: 'closed', title: null, source: null, videoId: null, artwork: null }),
    yt_control: () => {},
  };
  window.__TAURI__ = {
    core: { invoke: (cmd, args) => Promise.resolve(handlers[cmd] ? handlers[cmd](args || {}) : null) },
    event: { listen: (ch, fn) => { (listeners[ch] = listeners[ch] || []).push(fn); return Promise.resolve(() => {}); } },
  };
  setInterval(() => emit('tick', snapshot()), 1000);
})();
