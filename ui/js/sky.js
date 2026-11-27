// Bầu trời đầy sao cho giao diện tối: dải Ngân Hà, sao lấp lánh, thỉnh thoảng có sao băng.
(() => {
  const cv = document.getElementById('sky');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const rnd = (a, b) => a + Math.random() * (b - a);
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  const TINTS = ['255,255,255', '255,255,255', '214,224,255', '190,205,255', '255,236,214'];
  let W, H, dpr, stars = [], band = null, shoot = null, nextShoot = 0, raf = 0, last = 0, on = false;

  function build() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';

    band = document.createElement('canvas');
    band.width = cv.width; band.height = cv.height;
    const m = band.getContext('2d');
    m.scale(dpr, dpr);
    m.save();
    m.translate(W * 0.46, H * 0.58);
    m.rotate(-0.62);
    const L = Math.hypot(W, H) * 0.7;
    for (let i = 0; i < 110; i++) {
      const x = rnd(-L, L), y = gauss() * H * 0.11, r = rnd(50, 160), a = rnd(0.012, 0.04);
      const g = m.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(176,190,255,${a})`); g.addColorStop(1, 'rgba(176,190,255,0)');
      m.fillStyle = g; m.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 40; i++) {
      const x = rnd(-L, L), y = gauss() * H * 0.03, r = rnd(30, 90);
      const g = m.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(5,8,20,.10)'); g.addColorStop(1, 'rgba(5,8,20,0)');
      m.fillStyle = g; m.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const dust = Math.round((W * H) / 520);
    for (let i = 0; i < dust; i++) {
      const s = rnd(0.35, 0.95);
      m.fillStyle = `rgba(230,236,255,${rnd(0.06, 0.42)})`;
      m.fillRect(rnd(-L, L), gauss() * H * 0.1, s, s);
    }
    m.restore();

    const n = Math.round((W * H) / 2300);
    stars = Array.from({ length: n }, () => {
      const big = Math.random() < 0.05;
      return { x: Math.random() * W, y: Math.random() * H, r: big ? rnd(1, 1.6) : rnd(0.3, 0.95), a: rnd(0.3, 0.95),
        tw: rnd(0.3, 1.5), ph: Math.random() * 6.28, c: TINTS[(Math.random() * TINTS.length) | 0], big };
    });
  }

  function drawShoot(t) {
    if (!shoot) {
      if (t > nextShoot && !reduce.matches) {
        shoot = { x: rnd(W * 0.3, W * 1.05), y: rnd(-20, H * 0.35), vx: -rnd(520, 760), vy: rnd(210, 320), t0: t, life: rnd(700, 1100) };
      }
      return;
    }
    const k = (t - shoot.t0) / shoot.life;
    if (k >= 1) { shoot = null; nextShoot = t + rnd(7000, 16000); return; }
    const s = (t - shoot.t0) / 1000, x = shoot.x + shoot.vx * s, y = shoot.y + shoot.vy * s;
    const len = 0.16, tx = x - shoot.vx * len, ty = y - shoot.vy * len;
    const fade = Math.sin(Math.PI * k);
    const g = ctx.createLinearGradient(x, y, tx, ty);
    g.addColorStop(0, `rgba(255,255,255,${0.9 * fade})`); g.addColorStop(1, 'rgba(180,195,255,0)');
    ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (t - last < 45) return;
    last = t;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(band, 0, 0, W, H);
    const sec = reduce.matches ? 0 : t / 1000;
    for (const s of stars) {
      const a = s.a * (0.7 + 0.3 * Math.sin(sec * s.tw + s.ph));
      if (s.big) {
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 5);
        g.addColorStop(0, `rgba(${s.c},${a * 0.45})`); g.addColorStop(1, `rgba(${s.c},0)`);
        ctx.fillStyle = g; ctx.fillRect(s.x - s.r * 5, s.y - s.r * 5, s.r * 10, s.r * 10);
      }
      ctx.fillStyle = `rgba(${s.c},${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill();
    }
    drawShoot(t);
  }

  function sync() {
    const dark = document.documentElement.dataset.theme !== 'light';
    if (dark && !on) { on = true; build(); nextShoot = performance.now() + rnd(3000, 8000); raf = requestAnimationFrame(frame); cv.style.display = ''; }
    else if (!dark && on) { on = false; cancelAnimationFrame(raf); ctx.clearRect(0, 0, cv.width, cv.height); cv.style.display = 'none'; }
  }
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('resize', () => { if (on) build(); });
  document.addEventListener('visibilitychange', () => { if (!on) return; if (document.hidden) cancelAnimationFrame(raf); else raf = requestAnimationFrame(frame); });
  sync();
})();
