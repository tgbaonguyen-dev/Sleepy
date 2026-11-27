// Subtle pinpoint starfield for dark theme: no drifting bokeh/nebula behind text,
// capped DPR, pauses when hidden or prefers-reduced-motion.
(() => {
  const canvas = document.getElementById('sky');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const rnd = (min, max) => min + Math.random() * (max - min);
  const colors = ['255,255,255', '219,227,255', '181,200,255'];

  let width = 0, height = 0, dpr = 1;
  let stars = [], frameId = 0, active = false;

  function build() {
    dpr = Math.min(1.25, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const starCount = Math.min(180, Math.round((width * height) / 4800));
    stars = Array.from({ length: starCount }, () => ({
      x: rnd(0, width),
      y: rnd(0, height),
      size: rnd(0.9, 1.8),
      opacity: rnd(0.14, 0.42),
      pulse: rnd(0.4, 1.1),
      phase: rnd(0, Math.PI * 2),
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
  }

  function draw(time) {
    const seconds = time / 1000;
    const isRunning = !!document.querySelector('.view.running');
    const boost = isRunning ? 1.65 : 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    for (const s of stars) {
      const alpha = Math.min(0.85, s.opacity * boost * (0.7 + 0.3 * Math.sin(seconds * s.pulse + s.phase)));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${s.color})`;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }

  function frame(time) {
    if (!active || document.hidden) return;
    frameId = requestAnimationFrame(frame);
    draw(time);
  }

  function start() {
    build();
    canvas.style.display = '';
    active = true;
    if (reduce.matches) draw(performance.now());
    else frameId = requestAnimationFrame(frame);
  }

  function stop() {
    active = false;
    cancelAnimationFrame(frameId);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.style.display = 'none';
  }

  function sync() {
    const dark = document.documentElement.dataset.theme !== 'light';
    if (dark && !active) start();
    else if (!dark && active) stop();
    else if (!dark) canvas.style.display = 'none';
  }

  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  document.addEventListener('visibilitychange', () => {
    if (!active) return;
    if (document.hidden) cancelAnimationFrame(frameId);
    else if (!reduce.matches) frameId = requestAnimationFrame(frame);
  });
  window.addEventListener('resize', () => { if (active) build(); });
  reduce.addEventListener('change', () => { if (active) { cancelAnimationFrame(frameId); start(); } });
  sync();
})();
