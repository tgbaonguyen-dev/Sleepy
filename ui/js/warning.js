/* global Shared, Icons, sleepy */
const S = Shared;
let st = null, last = null, ctx = null, firstTotal = null, hint = null, hintTimer = 0;
const TAU = Math.PI * 2;
const pt = (c, r, f) => [c + r * Math.sin(f * TAU), c - r * Math.cos(f * TAU)];
function arc(c, r, f) {
  if (f <= 0.001) return '';
  if (f >= 0.999) return `M${c} ${c - r} A${r} ${r} 0 1 1 ${c - 0.01} ${c - r}`;
  const [x, y] = pt(c, r, f);
  return `M${c} ${c - r} A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
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
  document.getElementById('title').textContent = `Sắp thực hiện: ${a.verb.toLowerCase()}`;
  document.getElementById('ic').innerHTML = Icons[j.action];
  document.getElementById('ring').innerHTML = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:${hot ? 'var(--lamp)' : 'var(--moon)'}"/><stop offset="1" style="stop-color:${hot ? 'var(--danger)' : 'var(--moon-2)'}"/></linearGradient></defs>
    <circle cx="66" cy="66" r="58" fill="none" stroke-width="8" class="track"/>
    <path d="${arc(66, 58, f)}" fill="none" stroke="url(#g)" stroke-width="8" stroke-linecap="round"/>`;
  const el = document.getElementById('clock'), text = S.clock(j.remaining), prev = el.dataset.t || '';
  if (prev !== text) { el.innerHTML = [...text].map((ch, i) => `<span class="ch${prev.length === text.length && prev[i] !== ch ? ' roll' : ''}">${ch}</span>`).join(''); el.dataset.t = text; }
  const why = j.fromCondition ? 'Điều kiện đã được đáp ứng.' : `Hành động được lên lịch lúc <b>${S.hhmm(j.deadline)}</b>.`;
  const msg = document.getElementById('msg');
  msg.classList.toggle('hint', !!hint);
  msg.innerHTML = hint || `${why} Hãy lưu công việc đang mở.${st?.settings.dryRun ? ' <b>Chế độ thử đang bật.</b>' : ''}`;
  const sec = Math.ceil(j.remaining / 1000);
  if (sec <= 10 && sec > 0 && sec !== last) { last = sec; tone(sec <= 3 ? 880 : 660, 0.18, 0.06); }
}
function showHint(text, ms = 2600) {
  hint = text; clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { hint = null; disarm(); paint(st?.job); }, ms);
  paint(st?.job);
}

// "Thực hiện ngay": chuột phải nhấn giữ 0.8 giây; bàn phím phải nhấn Enter/Space hai lần trong 3 giây.
const nowBtn = document.getElementById('now');
const HOLD_MS = 800;
let armed = false, heldDone = false;
function disarm() { armed = false; nowBtn.classList.remove('armed'); }
nowBtn.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const t0 = performance.now();
  let raf = 0;
  const stop = (done) => {
    cancelAnimationFrame(raf);
    nowBtn.style.removeProperty('--hold');
    nowBtn.classList.remove('holding');
    removeEventListener('pointerup', onEnd); removeEventListener('pointercancel', onEnd);
    nowBtn.removeEventListener('pointerleave', onEnd);
    if (done) { heldDone = true; sleepy.now(); }
  };
  const onEnd = () => stop(false);
  nowBtn.classList.add('holding');
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / HOLD_MS);
    nowBtn.style.setProperty('--hold', `${(p * 100).toFixed(1)}%`);
    if (p >= 1) stop(true); else raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  addEventListener('pointerup', onEnd); addEventListener('pointercancel', onEnd);
  nowBtn.addEventListener('pointerleave', onEnd);
});
nowBtn.addEventListener('click', (e) => {
  if (heldDone) { heldDone = false; return; }
  if (e.detail > 0) { showHint('Nhấn giữ nút để thực hiện ngay.'); return; }
  // Kích hoạt bằng bàn phím
  if (armed) { disarm(); hint = null; sleepy.now(); return; }
  armed = true; nowBtn.classList.add('armed');
  const verb = st?.job ? S.ACTIONS[st.job.action].verb.toLowerCase() : 'thực hiện';
  showHint(`Nhấn Enter lần nữa để ${verb} ngay.`, 3000);
});
nowBtn.addEventListener('blur', () => { if (armed) { disarm(); hint = null; paint(st?.job); } });

document.querySelectorAll('[data-post]').forEach((b) => { b.onclick = () => { firstTotal = null; sleepy.postpone(+b.dataset.post); }; });
document.getElementById('cancel').onclick = () => sleepy.cancel();
sleepy.getState().then((s) => { st = s; paint(s.job); chime(); });
sleepy.onState((s) => { st = s; paint(s.job); });
sleepy.onTick((s) => paint(s.job));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || (e.ctrlKey && e.key === '.')) { e.preventDefault(); sleepy.cancel(); }
});
