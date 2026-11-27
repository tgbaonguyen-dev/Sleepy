// Animated night sky with parallax stars, drifting nebulae, and occasional meteors.
(() => {
  const canvas = document.getElementById('sky');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const rnd = (min, max) => min + Math.random() * (max - min);
  const gaussian = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  const colors = ['255,255,255', '219,227,255', '181,200,255', '255,226,200'];
  const nebulaColors = ['105,126,235', '117,91,204', '54,139,206', '176,104,190'];

  let width = 0, height = 0, dpr = 1;
  let stars = [], nebulae = [], milkyWay = null, meteor = null;
  let nextMeteor = 0, frameId = 0, lastFrame = 0, active = false;
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };

  function buildMilkyWay() {
    const layer = document.createElement('canvas');
    layer.width = canvas.width; layer.height = canvas.height;
    const paint = layer.getContext('2d');
    paint.scale(dpr, dpr);
    paint.save();
    paint.translate(width * 0.48, height * 0.58);
    paint.rotate(-0.62);
    const length = Math.hypot(width, height) * 0.82;
    for (let i = 0; i < 150; i++) {
      const x = rnd(-length, length), y = gaussian() * height * 0.12, radius = rnd(55, 190), opacity = rnd(0.012, 0.048);
      const gradient = paint.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(156,177,255,${opacity})`);
      gradient.addColorStop(0.45, `rgba(116,135,220,${opacity * 0.55})`);
      gradient.addColorStop(1, 'rgba(88,103,190,0)');
      paint.fillStyle = gradient;
      paint.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    for (let i = 0; i < 52; i++) {
      const x = rnd(-length, length), y = gaussian() * height * 0.035, radius = rnd(35, 110);
      const gradient = paint.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, 'rgba(3,6,19,.15)'); gradient.addColorStop(1, 'rgba(3,6,19,0)');
      paint.fillStyle = gradient; paint.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    const dustCount = Math.round((width * height) / 340);
    for (let i = 0; i < dustCount; i++) {
      const size = rnd(0.3, 1.05);
      paint.fillStyle = `rgba(224,232,255,${rnd(0.05, 0.42)})`;
      paint.fillRect(rnd(-length, length), gaussian() * height * 0.115, size, size);
    }
    paint.restore();
    return layer;
  }

  function build() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    milkyWay = buildMilkyWay();
    const starCount = Math.round((width * height) / 1750);
    stars = Array.from({ length: starCount }, () => {
      const depth = rnd(0.18, 1), bright = Math.random() < 0.065;
      return { x: rnd(0, width), y: rnd(0, height), depth, radius: bright ? rnd(1, 1.75) : rnd(0.35, 1),
        opacity: rnd(0.28, 0.92), pulse: rnd(0.55, 1.55), phase: rnd(0, Math.PI * 2),
        color: colors[Math.floor(Math.random() * colors.length)], bright };
    });
    nebulae = Array.from({ length: 7 }, (_, index) => ({
      x: rnd(width * 0.08, width * 0.92), y: rnd(height * 0.08, height * 0.92),
      radius: rnd(Math.min(width, height) * 0.2, Math.min(width, height) * 0.42),
      phase: rnd(0, Math.PI * 2), speed: rnd(0.045, 0.09), opacity: rnd(0.028, 0.07),
      color: nebulaColors[index % nebulaColors.length],
    }));
  }

  function drawNebulae(seconds) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const cloud of nebulae) {
      const x = cloud.x + Math.sin(seconds * cloud.speed + cloud.phase) * 34 + pointer.x * 5;
      const y = cloud.y + Math.cos(seconds * cloud.speed * 0.78 + cloud.phase) * 24 + pointer.y * 4;
      const radius = cloud.radius * (1 + Math.sin(seconds * cloud.speed * 1.4 + cloud.phase) * 0.06);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(${cloud.color},${cloud.opacity})`);
      gradient.addColorStop(0.42, `rgba(${cloud.color},${cloud.opacity * 0.45})`);
      gradient.addColorStop(1, `rgba(${cloud.color},0)`);
      ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
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
        const glow = ctx.createRadialGradient(x, y, 0, x, y, star.radius * 6);
        glow.addColorStop(0, `rgba(${star.color},${opacity * 0.5})`); glow.addColorStop(1, `rgba(${star.color},0)`);
        ctx.fillStyle = glow; ctx.fillRect(x - star.radius * 6, y - star.radius * 6, star.radius * 12, star.radius * 12);
      }
      ctx.fillStyle = `rgba(${star.color},${opacity})`;
      ctx.beginPath(); ctx.arc(x, y, star.radius, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawMeteor(time) {
    if (!meteor) {
      if (time >= nextMeteor && !reduce.matches) {
        meteor = { x: rnd(width * 0.38, width * 1.05), y: rnd(-30, height * 0.28), vx: -rnd(460, 660),
          vy: rnd(190, 270), started: time, duration: rnd(900, 1300) };
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
    gradient.addColorStop(0.18, `rgba(202,218,255,${0.58 * fade})`); gradient.addColorStop(1, 'rgba(158,181,255,0)');
    ctx.strokeStyle = gradient; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tailX, tailY); ctx.stroke();
  }

  function draw(time) {
    const seconds = time / 1000;
    pointer.x += (pointer.targetX - pointer.x) * 0.045; pointer.y += (pointer.targetY - pointer.y) * 0.045;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
    drawNebulae(seconds);
    const bandX = Math.sin(seconds * 0.075) * 15 + pointer.x * 7;
    const bandY = Math.cos(seconds * 0.058) * 10 + pointer.y * 5;
    ctx.drawImage(milkyWay, -12 + bandX, -12 + bandY, width + 24, height + 24);
    drawStars(seconds); drawMeteor(time);
  }

  function frame(time) {
    if (!active) return;
    frameId = requestAnimationFrame(frame);
    if (time - lastFrame < 32) return;
    lastFrame = time; draw(time);
  }
  function start() {
    build(); nextMeteor = performance.now() + rnd(3000, 6500); canvas.style.display = ''; active = true; lastFrame = 0;
    if (reduce.matches) draw(performance.now()); else frameId = requestAnimationFrame(frame);
  }
  function stop() {
    active = false; cancelAnimationFrame(frameId); ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.style.display = 'none';
  }
  function sync() {
    const dark = document.documentElement.dataset.theme !== 'light';
    if (dark && !active) start();
    else if (!dark && active) stop();
    else if (!dark) canvas.style.display = 'none';
  }

  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('resize', () => { if (active) build(); });
  window.addEventListener('pointermove', (event) => {
    pointer.targetX = event.clientX / Math.max(1, width) - 0.5; pointer.targetY = event.clientY / Math.max(1, height) - 0.5;
  });
  document.addEventListener('mouseleave', () => { pointer.targetX = 0; pointer.targetY = 0; });
  document.addEventListener('visibilitychange', () => {
    if (!active || reduce.matches) return;
    cancelAnimationFrame(frameId); if (!document.hidden) frameId = requestAnimationFrame(frame);
  });
  reduce.addEventListener('change', () => { if (active) { stop(); sync(); } });
  sync();
})();
