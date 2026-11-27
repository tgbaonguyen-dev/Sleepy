/* global window, localStorage */
// Âm thanh nền: mưa, mưa giông, gió, sóng, lửa, dế (bản ghi thật, ui/sounds/*.ogg), tiếng ồn nâu (tự tạo)
// và nhạc lofi (ui/sounds/lofi/*.ogg). Nguồn và giấy phép: ui/sounds/CREDITS.md.
//
// Âm nền được giải mã một lần rồi lặp bằng Web Audio; đoạn cuối được crossfade vào đầu nên lặp không thấy mối nối.
// Lofi phát lần lượt theo danh sách xáo trộn: bài sau được giải mã trước và xếp lịch nối liền trên đồng hồ
// âm thanh, nên không bị trễ kể cả khi cửa sổ đang ẩn.
//
// Pha trộn: kênh → master → fade (nhỏ dần theo hẹn giờ) → limiter → loa.
window.Ambient = (() => {
  const KEY = 'sleepy.ambient';
  const BOOST = 1.6; // các tệp đã chuẩn hoá ở −20 LUFS (lofi −18); đẩy lên một chút, limiter giữ không vỡ tiếng

  const SOUNDS = [
    { id: 'rain', name: 'Mưa', desc: 'Mưa rơi trên hiên nhà', file: 'sounds/rain.ogg', mix: 1 },
    { id: 'thunder', name: 'Mưa giông', desc: 'Mưa to, sấm rền từng hồi', file: 'sounds/thunder.ogg', mix: 0.9 },
    { id: 'wind', name: 'Gió', desc: 'Gió đêm thổi mạnh', file: 'sounds/wind.ogg', mix: 0.8 },
    { id: 'waves', name: 'Sóng biển', desc: 'Sóng vỗ bờ chậm rãi', file: 'sounds/waves.ogg', mix: 1 },
    { id: 'fire', name: 'Lửa trại', desc: 'Lửa cháy lách tách', file: 'sounds/fire.ogg', mix: 0.9 },
    { id: 'crickets', name: 'Dế kêu', desc: 'Đêm hè ngoài vườn', file: 'sounds/crickets.ogg', mix: 0.8 },
    { id: 'brown', name: 'Tiếng ồn nâu', desc: 'Che tiếng ồn xung quanh', mix: 0.8 },
    { id: 'lofi', name: 'Nhạc lofi', desc: '9 bài lofi nhẹ nhàng, phát nối tiếp', mix: 1 },
  ];
  const TRACKS = [
    ['2-hour-delay', '2 Hour Delay'], ['winter-blues', 'Winter Blues'], ['first-snow', 'First Snow'], ['snow-drift', 'Snow Drift'],
    ['fire-place', 'Fire Place'], ['kids', 'Kids'], ['spring-at-last', 'Spring At Last'], ['sense-of-purpose', 'Sense Of Purpose'],
    ['april-showers', 'April Showers'],
  ].map(([f, title]) => ({ url: `sounds/lofi/${f}.ogg`, title, artist: 'HoliznaCC0' }));

  // ---------- Trạng thái lưu lại ----------
  const defaults = { master: 0.8, fade: 10, vols: Object.fromEntries(SOUNDS.map((s) => [s.id, 0.75])), on: { rain: true } };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
  const cfg = { ...defaults, ...saved, vols: { ...defaults.vols, ...(saved.vols || {}) }, on: { ...(saved.on || defaults.on) } };
  for (const id of Object.keys(cfg.on)) if (!SOUNDS.some((s) => s.id === id)) delete cfg.on[id];
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* bỏ qua */ } };

  // ---------- Đồ thị âm thanh ----------
  let ctx = null, masterG = null, fadeG = null;
  let playing = false, stoppedByTimer = false, fadeK = 1, lastError = null;
  const ch = {}; // id → { gain, loading, stops[], dead }
  const loops = {}; // id → Promise<AudioBuffer> đã nối vòng
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  const perceptual = (v) => v ** 1.5;

  function ensureCtx() {
    if (ctx) return ctx;
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
    masterG = ctx.createGain(); masterG.gain.value = 0;
    fadeG = ctx.createGain(); fadeG.gain.value = perceptual(fadeK);
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 4; lim.ratio.value = 20; lim.attack.value = 0.003; lim.release.value = 0.25;
    masterG.connect(fadeG).connect(lim).connect(ctx.destination);
    return ctx;
  }
  const ramp = (param, v, tau = 0.25) => { param.cancelScheduledValues(ctx.currentTime); param.setTargetAtTime(v, ctx.currentTime, tau); };
  const chLevel = (id) => perceptual(cfg.vols[id]) * SOUNDS.find((s) => s.id === id).mix * BOOST;

  async function decode(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const data = await res.arrayBuffer();
    // Dạng callback để chạy được cả trên WebKit cũ
    return new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject));
  }
  // Crossfade `fade` giây cuối vào đầu buffer → vòng lặp liền mạch
  function seam(buf, fade = 3) {
    const sr = buf.sampleRate, F = Math.min(Math.round(fade * sr), Math.floor(buf.length / 3)), L = buf.length - F;
    const out = ctx.createBuffer(buf.numberOfChannels, L, sr);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const a = buf.getChannelData(c), o = out.getChannelData(c);
      o.set(a.subarray(0, L));
      for (let i = 0; i < F; i++) { const t = i / F; o[i] = a[i] * Math.sin((t * Math.PI) / 2) + a[L + i] * Math.cos((t * Math.PI) / 2); }
    }
    return out;
  }
  // Tiếng ồn nâu: nhiễu tích phân 12 giây, đã nối vòng, độ to tương đương các tệp ghi âm
  function brownNoise() {
    const sr = ctx.sampleRate, n = sr * 12, buf = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let b = 0, hp = 0, prev = 0;
      for (let i = 0; i < n; i++) {
        b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        hp = 0.999 * (hp + b - prev); prev = b; // bỏ thành phần DC
        d[i] = hp * 3.5 * 0.28;
      }
    }
    return seam(buf, 2);
  }
  function loopBuffer(id) {
    const s = SOUNDS.find((x) => x.id === id);
    if (!loops[id]) {
      loops[id] = s.file ? decode(s.file).then((b) => seam(b)) : Promise.resolve(brownNoise());
      loops[id].catch(() => { delete loops[id]; });
    }
    return loops[id];
  }

  async function startChannel(id) {
    if (ch[id]) return;
    ensureCtx();
    const g = ctx.createGain(); g.gain.value = 0; g.connect(masterG);
    const c = ch[id] = { gain: g, loading: true, stops: [] };
    emit();
    try {
      if (id === 'lofi') await startLofi(c);
      else {
        const buf = await loopBuffer(id);
        if (c.dead) return;
        const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
        s.connect(g); s.start(ctx.currentTime + 0.02, Math.random() * buf.duration);
        c.stops.push(() => s.stop());
      }
    } catch (e) {
      console.warn('ambient', id, e);
      lastError = `Không phát được "${SOUNDS.find((x) => x.id === id).name}": ${e.message || e}`;
    }
    if (c.dead) return;
    c.loading = false;
    ramp(g.gain, chLevel(id), 0.5);
    emit();
  }
  function stopChannel(id) {
    const c = ch[id]; if (!c) return;
    delete ch[id];
    c.dead = true;
    ramp(c.gain.gain, 0, 0.2);
    setTimeout(() => { c.stops.forEach((f) => { try { f(); } catch { /* đã dừng */ } }); c.gain.disconnect(); }, 1200);
    emit();
  }

  // ---------- Lofi: danh sách xáo trộn, bài sau giải mã trước rồi xếp lịch nối liền ----------
  const lofi = { order: [], pos: 0, queue: [], until: 0, busy: false, gen: 0, shown: null };
  function shuffle() {
    const a = TRACKS.map((_, i) => i);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function nextTrack() {
    if (lofi.pos >= lofi.order.length) { lofi.order = shuffle(); lofi.pos = 0; }
    return TRACKS[lofi.order[lofi.pos++]];
  }
  async function queueLofi(c, gen) {
    if (lofi.busy || c.dead || gen !== lofi.gen) return;
    lofi.busy = true;
    try {
      // Luôn có sẵn bài kế tiếp khi bài hiện tại còn dưới 30 giây
      while (!c.dead && gen === lofi.gen && lofi.until - ctx.currentTime < 30) {
        const track = nextTrack(), buf = await decode(track.url);
        if (c.dead || gen !== lofi.gen) return;
        const s = ctx.createBufferSource(); s.buffer = buf; s.connect(c.gain);
        const at = Math.max(lofi.until, ctx.currentTime + 0.05);
        s.start(at);
        const item = { src: s, track, start: at, end: at + buf.duration };
        s.onended = () => { lofi.queue = lofi.queue.filter((x) => x !== item); };
        lofi.queue.push(item);
        lofi.until = item.end + 1.2; // nghỉ một chút giữa hai bài
      }
    } finally { lofi.busy = false; }
  }
  function currentTrack() {
    if (!ctx) return null;
    const t = ctx.currentTime;
    return (lofi.queue.find((x) => x.start <= t && t < x.end) || lofi.queue[0])?.track || null;
  }
  async function startLofi(c) {
    const gen = ++lofi.gen;
    lofi.until = ctx.currentTime + 0.1; lofi.queue = [];
    await queueLofi(c, gen);
    lofi.shown = currentTrack();
    const iv = setInterval(() => {
      queueLofi(c, gen).catch((e) => console.warn('ambient lofi', e));
      const t = currentTrack();
      if (t !== lofi.shown) { lofi.shown = t; emit(); }
    }, 1000);
    c.stops.push(() => { clearInterval(iv); stopLofiSources(); });
  }
  function stopLofiSources() {
    lofi.gen++;
    lofi.queue.forEach((x) => { try { x.src.stop(); } catch { /* */ } });
    lofi.queue = [];
  }
  async function skipSong() {
    const c = ch.lofi; if (!c || c.loading) return;
    c.loading = true; emit();
    ramp(c.gain.gain, 0, 0.2);
    await new Promise((r) => setTimeout(r, 600));
    if (c.dead) return;
    stopLofiSources();
    const gen = lofi.gen;
    lofi.until = ctx.currentTime + 0.05;
    try { await queueLofi(c, gen); } catch (e) { lastError = `Không phát được bài tiếp theo: ${e.message || e}`; }
    if (c.dead) return;
    c.loading = false; lofi.shown = currentTrack();
    ramp(c.gain.gain, chLevel('lofi'), 0.3);
    emit();
  }

  // ---------- API ----------
  async function play() {
    if (!Object.values(cfg.on).some(Boolean)) { cfg.on.rain = true; persist(); }
    try { ensureCtx(); } catch (e) { lastError = `Không khởi tạo được âm thanh: ${e.message || e}`; emit(); return; }
    playing = true; stoppedByTimer = false; lastError = null;
    emit();
    await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 2500))]);
    if (ctx.state !== 'running') {
      console.warn('ambient: AudioContext', ctx.state);
      lastError = 'Không mở được thiết bị âm thanh. Kiểm tra loa rồi thử lại.';
      playing = false; emit(); return;
    }
    for (const s of SOUNDS) if (cfg.on[s.id]) startChannel(s.id);
    ramp(masterG.gain, perceptual(cfg.master), 0.3);
  }
  function pause() {
    if (!ctx || !playing) return;
    playing = false;
    ramp(masterG.gain, 0, 0.15);
    emit();
    setTimeout(() => { if (!playing) { for (const id of Object.keys(ch)) stopChannel(id); ctx.suspend(); } }, 900);
  }
  function toggle(id) {
    cfg.on[id] = !cfg.on[id]; persist();
    if (cfg.on[id]) { if (playing) startChannel(id); else play(); }
    else { stopChannel(id); if (playing && !Object.values(cfg.on).some(Boolean)) pause(); }
    emit();
  }
  function setVol(id, v) {
    cfg.vols[id] = Math.max(0, Math.min(1, v)); persist();
    if (ch[id] && !ch[id].loading) ramp(ch[id].gain.gain, chLevel(id), 0.05);
  }
  function setMaster(v) {
    cfg.master = Math.max(0, Math.min(1, v)); persist();
    if (ctx && playing) ramp(masterG.gain, perceptual(cfg.master), 0.05);
  }
  function setFade(min) { cfg.fade = min; persist(); emit(); }

  // Nhỏ dần trong `cfg.fade` phút cuối của hẹn giờ; hết giờ thì tắt hẳn
  function syncJob(job) {
    const counting = job && job.phase === 'countdown' && typeof job.remaining === 'number';
    let k = 1;
    if (counting && cfg.fade > 0) {
      const win = Math.min(cfg.fade * 60000, job.totalMs || Infinity);
      k = win > 0 ? Math.max(0, Math.min(1, job.remaining / win)) : 1;
    }
    if (Math.abs(k - fadeK) > 0.001) { fadeK = k; if (fadeG) ramp(fadeG.gain, perceptual(k), 0.8); }
    if (playing && counting && job.remaining <= 1000) { pause(); stoppedByTimer = true; emit(); }
  }

  return {
    SOUNDS,
    get playing() { return playing; },
    get stoppedByTimer() { return stoppedByTimer; },
    get error() { return lastError; },
    get fading() { return fadeK < 0.999; },
    get fadeLevel() { return fadeK; },
    get config() { return cfg; },
    isOn: (id) => !!cfg.on[id],
    isLoading: (id) => !!ch[id]?.loading,
    song: () => (ch.lofi ? currentTrack() : null),
    play, pause, toggle, setVol, setMaster, setFade, syncJob, skipSong,
    togglePlay: () => (playing ? pause() : play()),
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    // Chẩn đoán: trạng thái và mức tín hiệu đầu ra hiện tại
    _debug: () => {
      if (!ctx) return Promise.resolve({ ctx: null });
      const an = ctx.createAnalyser(); fadeG.connect(an);
      const d = new Float32Array(an.fftSize);
      return new Promise((r) => setTimeout(() => {
        an.getFloatTimeDomainData(d); an.disconnect();
        r({ state: ctx.state, master: masterG.gain.value, chans: Object.keys(ch), song: currentTrack()?.title, rms: Math.sqrt(d.reduce((a, v) => a + v * v, 0) / d.length) });
      }, 300));
    },
  };
})();
