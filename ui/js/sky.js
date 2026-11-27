// Animated night sky optimized for native high-FPS rendering on WebKitGTK:
// pre-rendered sprites for nebulae & star glows, capped canvas DPR, and visibility pause.
(() => {
  const canvas = document.getElementById('sky');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const rnd = (min, max) => min + Math.random() * (max - min);
  const gaussian = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  const colors = ['255,255,255', '219,227,255', '181,200,255', '255,226,200'];
  const nebulaColors = ['105,126,235', '117,91,204', '54,139,206', '176,104,190'];

  let width = 0, height = 0, dpr = 1;
  let stars = [], nebulae = [], milkyWay = null, meteor = null;
  let nextMeteor = 0, frameId = 0, active = false;
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };

  function makeRadialSprite(size, stops) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    const r = size / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    for (const [offset, color] of stops) grad.addColorStop(offset, color);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }

  const nebulaSprites = nebulaColors.map((rgb) => makeRadialSprite(128, [
    [0, `rgba(${rgb},1)`],
    [0.42, `rgba(${rgb},0.45)`],
    [1, `rgba(${rgb},0)`],
  ]));
  const starGlowSprites = colors.map((rgb) => makeRadialSprite(32, [
    [0, `rgba(${rgb},0.55)`],
    [1, `rgba(${rgb},0)`],
  ]));

  function buildMilkyWay() {
    const layer = document.createElement('canvas');
    layer.width = canvas.width; layer.height = canvas.height;
    const paint = layer.getContext('2d');
    paint.scale(dpr, dpr);
    paint.save();
    paint.translate(width * 0.48, height * 0.58);
    paint.rotate(-0.62);
    const length = Math.hypot(width, height) * 0.82;
    for (let i = 0; i < 120; i++) {
      const x = rnd(-length, length), y = gaussian() * height * 0.12, radius = rnd(55, 190), opacity = rnd(0.012, 0.045);
      const gradient = paint.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(156,177,255,${opacity})`);
      gradient.addColorStop(0.45, `rgba(116,135,220,${opacity * 0.55})`);
      gradient.addColorStop(1, 'rgba(88,103,190,0)');
      paint.fillStyle = gradient;
      paint.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    const dustCount = Math.min(1800, Math.round((width * height) / 420));
    for (let i = 0; i < dustCount; i++) {
      const size = rnd(0.35, 1.05);
      paint.fillStyle = `rgba(224,232,255,${rnd(0.05, 0.42)})`;
      paint.fillRect(rnd(-length, length), gaussian() * height * 0.115, size, size);
    }
    paint.restore();
    return layer;
  }

  function build() {
    dpr = Math.min(1.25, window.devicePixelRatio || 1);
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    milkyWay = buildMilkyWay();
    const starCount = Math.min(320, Math.round((width * height) / 2400));
    stars = Array.from({ length: starCount }, () => {
      const depth = rnd(0.18, 1), bright = Math.random() < 0.07;
      const colorIdx = Math.floor(Math.random() * colors.length);
      return {
        x: rnd(0, width), y: rnd(0, height), depth,
        size: bright ? rnd(2.1, 3.2) : rnd(0.9, 1.9),
        opacity: rnd(0.28, 0.92), pulse: rnd(0.55, 1.55), phase: rnd(0, Math.PI * 2),
        color: colors[colorIdx], glow: starGlowSprites[colorIdx], bright,
      };
    });
    nebulae = Array.from({ length: 5 }, (_, index) => ({
      x: rnd(width * 0.08, width * 0.92), y: rnd(height * 0.08, height * 0.92),
      radius: rnd(Math.min(width, height) * 0.22, Math.min(width, height) * 0.42),
      phase: rnd(0, Math.PI * 2), speed: rnd(0.045, 0.09), opacity: rnd(0.03, 0.068),
      sprite: nebulaSprites[index % nebulaSprites.length],
    }));
  }

  function drawNebulae(seconds) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const cloud of nebulae) {
      const x = cloud.x + Math.sin(seconds * cloud.speed + cloud.phase) * 34 + pointer.x * 5;
      const y = cloud.y + Math.cos(seconds * cloud.speed * 0.78 + cloud.phase) * 24 + pointer.y * 4;
      const radius = cloud.radius * (1 + Math.sin(seconds * cloud.speed * 1.4 + cloud.phase) * 0.06);
      ctx.globalAlpha = cloud.opacity;
      ctx.drawImage(cloud.sprite, x - radius, y - radius, radius * 2, radius * 2);
    }
    ctx.restore();
  }

  function drawStars(seconds) {
    const cameraX = Math.sin(seconds * 0.11) * 13 + Math.cos(seconds * 0.047) * 7 + pointer.x * 9;
    const cameraY = Math.cos(seconds * 0.085) * 9 + pointer.y * 7;
    for (const star of stars) {
      const x = (star.x + seconds * (0.14 + star.depth * 0.42) + cameraX * star.depth + width) % width;
      const y = (star.y + cameraY * star.depth + height) % height;
      const opacity = star.opacity * (0.64 + 0.36 * Math.sin(seconds * star.pulse + star.phase));
      if (star.bright) {
        const gSize = star.size * 5.5;
        ctx.globalAlpha = opacity;
        ctx.drawImage(star.glow, x - gSize, y - gSize, gSize * 2, gSize * 2);
      }
      ctx.globalAlpha = opacity;
      ctx.fillStyle = `rgb(${star.color})`;
      const half = star.size * 0.5;
      ctx.fillRect(x - half, y - half, star.size, star.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawMeteor(time) {
    if (!meteor) {
      if (time >= nextMeteor && !reduce.matches) {
        meteor = {
          x: rnd(width * 0.38, width * 1.05), y: rnd(-30, height * 0.28),
          vx: -rnd(460, 660), vy: rnd(190, 270), started: time, duration: rnd(900, 1300),
        };
      }
      return;
    }
    const progress = (time - meteor.started) / meteor.duration;
    if (progress >= 1) { meteor = null; nextMeteor = time + rnd(8000, 15000); return; }
    const elapsed = (time - meteor.started) / 1000;
    const x = meteor.x + meteor.vx * elapsed, y = meteor.y + meteor.vy * elapsed;
    const tailX = x - meteor.vx * 0.19, tailY = y - meteor.vy * 0.19, fade = Math.sin(Math.PI * progress);
    const gradient = ctx.createLinearGradient(x, y, tailX, tailY);
    gradient.addColorStop(0, `rgba(255,255,255,${0.9 * fade})`);
    gradient.addColorStop(0.18, `rgba(202,218,255,${0.58 * fade})`);
    gradient.addColorStop(1, 'rgba(158,181,255,0)');
    ctx.strokeStyle = gradient; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tailX, tailY); ctx.stroke();
  }

  function draw(time) {
    const seconds = time / 1000;
    pointer.x += (pointer.targetX - pointer.x) * 0.045;
    pointer.y += (pointer.targetY - pointer.y) * 0.045;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawNebulae(seconds);
    const bandX = Math.sin(seconds * 0.075) * 15 + pointer.x * 7;
    const bandY = Math.cos(seconds * 0.058) * 10 + pointer.y * 5;
    ctx.drawImage(milkyWay, -12 + bandX, -12 + bandY, width + 24, height + 24);
    drawStars(seconds);
    drawMeteor(time);
  }

  function frame(time) {
    if (!active || document.hidden) return;
    frameId = requestAnimationFrame(frame);
    draw(time);
  }
  function start() {
    build();
    nextMeteor = performance.now() + rnd(3000, 6500);
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
  window.addEventListener('pointermove', (event) => {
    pointer.targetX = event.clientX / Math.max(1, width) - 0.5;
    pointer.targetY = event.clientY / Math.max(1, height) - 0.5;
  });
  document.addEventListener('mouseleave', () => { pointer.targetX = 0; pointer.targetY = 0; });
  reduce.addEventListener('change', () => { if (active) { cancelAnimationFrame(frameId); start(); } });
  sync();
})();
