/* global Shared, Icons, sleepy */
const S = Shared;
let st = null, last = null, ctx = null, firstTotal = null;
const TAU = Math.PI * 2;
const pt = (c, r, f) => [c + r * Math.sin(f * TAU), c - r * Math.cos(f * TAU)];
function arc(c, r, f) {
  if (f <= 0.001) return '';
  if (f >= 0.999) return `M${c} ${c - r} A${r} ${r} 0 1 1 ${c - 0.01} ${c - r}`;
  const [x, y] = pt(c, r, f);
  return `M${c} ${c - r} A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
}
function theme() {
  const p = st?.settings.theme || 'dark';
  const dark = p === 'dark' || (p === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
function tone(freq, dur, vol, at = 0) {
  if (!st?.settings.sound) return;
  try {
    ctx = ctx || new AudioContext();
    const t0 = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + dur);
  } catch {}
}
function chime() { tone(659, 0.9, 0.09); tone(988, 1.2, 0.06, 0.18); }
function paint(j) {
  if (!j || j.phase !== 'countdown') return;
  const a = S.ACTIONS[j.action], card = document.getElementById('card');
  if (firstTotal == null || j.remaining > firstTotal) firstTotal = Math.max(j.remaining, 1000);
  const f = Math.max(0, Math.min(1, j.remaining / firstTotal));
  const hot = j.remaining <= 60000, fin = j.remaining <= 10000;
  card.classList.toggle('hot', hot && !fin); card.classList.toggle('final', fin);
  document.getElementById('title').textContent = `Sắp ${a.verb.toLowerCase()}`;
  document.getElementById('ic').innerHTML = Icons[j.action];
  document.getElementById('ring').innerHTML = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:${hot ? 'var(--lamp)' : 'var(--moon)'}"/><stop offset="1" style="stop-color:${hot ? 'var(--danger)' : 'var(--moon-2)'}"/></linearGradient></defs>
    <circle cx="66" cy="66" r="58" fill="none" stroke-width="8" class="track"/>
    <path d="${arc(66, 58, f)}" fill="none" stroke="url(#g)" stroke-width="8" stroke-linecap="round" style="filter:drop-shadow(0 0 8px var(--halo))"/>`;
  const el = document.getElementById('clock'), text = S.clock(j.remaining), prev = el.dataset.t || '';
  if (prev !== text) { el.innerHTML = [...text].map((ch, i) => `<span class="ch${prev.length === text.length && prev[i] !== ch ? ' roll' : ''}">${ch}</span>`).join(''); el.dataset.t = text; }
  const why = j.fromCondition ? `Việc bạn chờ đã xong.` : `Bạn hẹn lúc <b>${S.hhmm(j.deadline)}</b>.`;
  document.getElementById('msg').innerHTML = `${why} Nhớ lưu lại việc đang làm nhé.${st?.settings.dryRun ? ' <b>(Chế độ thử)</b>' : ''}`;
  const sec = Math.ceil(j.remaining / 1000);
  if (sec <= 10 && sec > 0 && sec !== last) { last = sec; tone(sec <= 3 ? 880 : 660, 0.18, 0.06); }
}
document.querySelectorAll('[data-post]').forEach((b) => { b.onclick = () => { firstTotal = null; sleepy.postpone(+b.dataset.post); }; });
document.getElementById('cancel').onclick = () => sleepy.cancel();
document.getElementById('now').onclick = () => sleepy.now();
sleepy.getState().then((s) => { st = s; theme(); paint(s.job); chime(); });
sleepy.onState((s) => { st = s; theme(); paint(s.job); });
sleepy.onTick((s) => paint(s.job));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') sleepy.cancel(); });
