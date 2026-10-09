/* Úvodní animace při spuštění: Mraq se rozhlédne, nadechne a kamera proletí vrstvami mraků až do něj.
   Barvy bere z aktuální oblohy appky (v noci tmavá, nic bílého neoslní). Ťuknutí = přeskočit.
   Použití: const intro = createIntro(lastPal); … intro.start({ sky:[c1,c2,c3], glow, sx, sy, dark }) → Promise */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const sstep = (t) => t * t * (3 - 2 * t);
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const outC = (t) => 1 - Math.pow(1 - t, 3);
const outQ = (t) => 1 - Math.pow(1 - t, 5);
const hex = (h) => { h = String(h).trim(); if (h.startsWith('rgb')) return h.match(/[\d.]+/g).slice(0, 3).map(Number); if (h.length === 4) h = '#' + [...h.slice(1)].map((c) => c + c).join(''); return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const mixc = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

const LEN = 2250;
const BODY = 'M168 366 C 116 366 86 330 92 292 C 97 258 124 238 152 238 C 150 184 196 140 252 140 C 304 140 340 172 350 214 C 392 214 426 248 424 292 C 422 336 388 366 344 366 Z';
const TAIL = 'M322 338 C 344 380 372 404 408 402 C 418 401 426 396 430 388';
const MC = [258, 272], SVG_W = 0.0021;
const EYES = [[205, 290], [305, 290]], PITCH = 13.5, DOT = 5.6;
const SW = 400, SH = 230, CZ0 = -0.14;
const PUFFS = [
  // daleko – moře mraků pod Mraqem a pár nahoře
  [-.45, .55, 3.2, .7], [.42, .62, 3.0, .8], [0, .82, 3.4, .95], [-.2, .42, 2.8, .45], [.58, .32, 3.3, .5], [-.62, .28, 2.9, .5], [.28, -.72, 3.5, .6], [-.42, -.86, 3.1, .5], [.05, 1.02, 2.6, 1.1],
  // střed – kolem Mraqa, při průletu se rozjedou do stran
  [-.56, -.36, .8, .55], [.6, .14, .7, .6], [-.62, .72, .75, .62], [.52, .86, .65, .55], [.46, -.76, .85, .5],
  // těsně u kamery – velké, rozostřené, rámují záběr
  [-.62, -.98, .34, 1.0], [.7, 1.06, .3, 1.15], [.78, -.52, .4, .7], [-.78, .52, .32, .8],
].map(([u, v, z, sz], i) => { const d = z - CZ0; return [u * d, v * d, z, sz * d, i % 3]; });
const STARS = Array.from({ length: 70 }, (_, i) => { const s = (i * 7919 % 1000) / 1000; return [((s * 3.1) % 1 - 0.5) * 3.2, ((s * 7.7 + i * 0.013) % 1 - 0.5) * 6.5, 3.5 + (i % 5) * 0.3, 0.4 + ((i * 37) % 10) / 14]; });

function sprite(cloud, seed) {
  const c = document.createElement('canvas'); c.width = SW; c.height = SH; const x = c.getContext('2d');
  let s = seed; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const [c0, c1, c2] = cloud;
  const blobs = [];
  for (let i = 0; i < 6; i++) blobs.push([70 + i * 52 + rnd() * 20, 150 - rnd() * 20, 42 + rnd() * 22]);
  for (let i = 0; i < 4; i++) blobs.push([120 + i * 55 + rnd() * 25, 112 - rnd() * 25, 40 + rnd() * 26]);
  blobs.push([175 + rnd() * 50, 85 - rnd() * 15, 48 + rnd() * 18]);
  for (const [bx, by, r] of blobs) {
    const gr = x.createRadialGradient(bx - r * 0.3, by - r * 0.45, r * 0.05, bx, by, r);
    gr.addColorStop(0, rgba(c0, 1)); gr.addColorStop(0.62, rgba(c1, 0.95)); gr.addColorStop(0.85, rgba(c2, 0.55)); gr.addColorStop(1, rgba(c2, 0));
    x.fillStyle = gr; x.beginPath(); x.arc(bx, by, r, 0, 7); x.fill();
  }
  x.globalCompositeOperation = 'source-atop';
  const sh = x.createLinearGradient(0, 110, 0, 200); sh.addColorStop(0, rgba(c2, 0)); sh.addColorStop(1, rgba(c2, 0.55));
  x.fillStyle = sh; x.fillRect(0, 0, SW, SH);
  x.globalCompositeOperation = 'destination-in';
  const fade = x.createLinearGradient(0, 150, 0, 190); fade.addColorStop(0, '#000'); fade.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = fade; x.fillRect(0, 0, SW, SH);
  // rozostřené verze (zmenšit a roztáhnout – funguje i v Safari bez ctx.filter)
  const blurred = (f) => { const b = document.createElement('canvas'); b.width = Math.ceil(SW / f); b.height = Math.ceil(SH / f); b.getContext('2d').drawImage(c, 0, 0, b.width, b.height); return b; };
  return [c, blurred(5), blurred(14)];
}

function eyesAt(t) {
  const L1 = inOut(seg(t, 180, 430)), R1 = inOut(seg(t, 560, 820)), C1 = inOut(seg(t, 930, 1080));
  const lx = lerp(lerp(lerp(0, -34, L1), 32, R1), 0, C1);
  const ly = lerp(0, 5, L1) * (1 - R1) - 4 * R1 * (1 - C1);
  const bk = seg(t, 880, 1040), open = bk > 0 && bk < 1 ? Math.abs(Math.cos(bk * Math.PI)) : 1;
  const wow = sstep(seg(t, 1080, 1260));
  const squint = 0.5 * (1 - sstep(seg(t, 980, 1160)));
  return { lx, ly, open, squint, wow };
}
function camAt(t) {
  const drift = outC(seg(t, 0, 1100)) * 0.1 - 0.14;
  const back = -0.05 * Math.sin(Math.PI * seg(t, 1040, 1260) * 0.5) * (1 - seg(t, 1260, 1400));
  const dk = seg(t, 1180, 1800), dive = Math.pow(dk, 2.6);
  const z = drift + back + dive * (0.99 - drift);
  const aim = sstep(dk);
  const sway = Math.sin(t / 380) * 0.006 * (1 - seg(t, 1200, 1700));
  return { z, x: sway - aim * 0.02, y: -aim * 0.17, roll: dive * 0.035 };
}

export function createIntro(first) {
  const cv = document.createElement('canvas');
  cv.className = 'intro';
  cv.setAttribute('aria-hidden', 'true');
  first = first || '#000000';
  cv.style.background = first;
  document.body.appendChild(cv);
  document.documentElement.classList.add('noboot'); // plátno už kryje appku
  let done = false, raf = 0, resolve;
  const finished = new Promise((r) => (resolve = r));
  const app = document.getElementById('app');
  const finish = () => {
    if (done) return; done = true; cancelAnimationFrame(raf);
    cv.style.transition = 'opacity .25s'; cv.style.opacity = 0;
    if (app) { app.style.transition = 'transform .3s cubic-bezier(.2,.8,.2,1)'; app.style.transform = ''; }
    setTimeout(() => { cv.remove(); if (app) { app.style.transition = ''; app.style.transform = ''; } }, 320);
    resolve();
  };
  cv.addEventListener('pointerdown', finish);

  function start(o) {
    if (done) return finished;
    const g = cv.getContext('2d');
    if (!g) { finish(); return finished; }
    const DPR = Math.min(2, devicePixelRatio || 1);
    let W = innerWidth, H = innerHeight;
    const size = () => { W = innerWidth; H = innerHeight; cv.width = W * DPR; cv.height = H * DPR; };
    size();
    const sky = o.sky.map(hex), glow = hex(o.glow || '#ffd9a0'), dark = !!o.dark;
    const cloud = dark ? [[182, 185, 236], [144, 149, 210], [102, 106, 168]]
      : [[255, 253, 248], mixc([243, 239, 236], sky[0], 0.12), mixc([218, 210, 214], sky[1], 0.25)];
    const haze = dark ? mixc(sky[1], [43, 47, 92], 0.5) : mixc(cloud[1], sky[0], 0.2);
    const eye = dark ? '#10112a' : '#141414';
    const sprites = [1, 2, 3].map((s) => sprite(cloud, s * 1777 + 11));
    const body = new Path2D(BODY), tail = new Path2D(TAIL);
    const sunX = (o.sx ?? 0.7) - 0.5, sunY = (o.sy ?? 0.3) - 0.47;

    function drawMraq(p, t) {
      if (!p) return;
      const e = eyesAt(t), k = SVG_W * p.s;
      g.save();
      g.globalAlpha = clamp((p.d - 0.015) / 0.05);
      const breath = 1 + Math.sin(t / 260) * 0.006, inh = Math.sin(Math.PI * seg(t, 1040, 1260)) * 0.035;
      g.translate(p.x, p.y); g.scale(k * breath * (1 - inh * 0.4), k * breath * (1 + inh)); g.translate(-MC[0], -MC[1]);
      const bg = g.createRadialGradient(210, 200, 0, 210, 200, 260);
      bg.addColorStop(0, rgba(cloud[0])); bg.addColorStop(0.6, rgba(cloud[1])); bg.addColorStop(1, rgba(cloud[2]));
      g.shadowColor = 'rgba(0,0,0,.18)'; g.shadowBlur = Math.min(60, 16 * k); g.shadowOffsetY = Math.min(40, 10 * k);
      g.fillStyle = bg; g.fill(body);
      g.strokeStyle = bg; g.lineWidth = 46; g.lineCap = 'round'; g.stroke(tail);
      g.shadowColor = 'transparent';
      g.fillStyle = eye;
      EYES.forEach(([cx, cy], i) => {
        const w = 62 * (1 + e.wow * 0.12), hh = 56 * (1 + e.wow * 0.18) * e.open * (i === 1 ? 1 - e.squint * 0.45 : 1);
        const ex = cx + e.lx, ey = cy + e.ly + (56 - hh) / 2;
        for (let gy = -5; gy <= 5; gy++) for (let gx = -5; gx <= 5; gx++) {
          const x = cx + gx * PITCH, y = cy + gy * PITCH;
          let on;
          if (hh > 5) { const dx = Math.max(0, Math.abs(x - ex) - (w / 2 - 14)), dy = Math.max(0, Math.abs(y - ey) - (hh / 2 - 14)); on = Math.hypot(dx, dy) <= 14; }
          else on = Math.abs(y - (cy + e.ly + 14)) < 7 && Math.abs(x - ex) < w / 2;
          if (on) { g.beginPath(); g.arc(x, y, DOT, 0, 7); g.fill(); }
        }
      });
      g.restore();
    }

    function draw(t) {
      g.setTransform(DPR, 0, 0, DPR, 0, 0);
      const cam = camAt(t), F = Math.min(W, H * 0.62);
      const CY = H * 0.47;
      const proj = (x, y, z) => { const d = z - cam.z; return d < 0.02 ? null : { x: W / 2 + (x - cam.x) * F / d, y: CY + (y - cam.y) * F / d, s: F / d, d }; };
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, rgba(sky[0])); gr.addColorStop(0.52, rgba(sky[1])); gr.addColorStop(1, rgba(sky[2]));
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const sp = proj(sunX * 2.4, sunY * 4.4, 6);
      if (sp) { const sg = g.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, W * 0.9); sg.addColorStop(0, rgba(glow, dark ? 0.2 : 0.5)); sg.addColorStop(1, rgba(glow, 0)); g.fillStyle = sg; g.fillRect(0, 0, W, H); }
      if (dark) for (const [x, y, z, a] of STARS) { const p = proj(x, y, z); if (!p) continue; g.fillStyle = `rgba(255,255,255,${a * 0.8})`; g.beginPath(); g.arc(p.x, p.y, 0.9 + a * 0.5, 0, 7); g.fill(); }
      g.save();
      g.translate(W / 2, CY); g.rotate(cam.roll); g.translate(-W / 2, -CY);
      const focus = Math.max(0.02, 1 - cam.z);
      const items = PUFFS.map((p) => ({ z: p[2], p })).concat([{ z: 1, mraq: true }]).sort((a, b) => b.z - a.z);
      for (const it of items) {
        if (it.mraq) { drawMraq(proj(0, 0, 1), t); continue; }
        const [x, y, z, s, k] = it.p, p = proj(x, y, z); if (!p) continue;
        const w = s * p.s, h = w * SH / SW;
        const far = clamp((z - 1.2) / 2.4), near = clamp((p.d - 0.02) / 0.1);
        const a = (1 - far * 0.5) * near * (z < 1 ? 0.95 : 0.85);
        const lv = clamp(Math.abs(Math.log(p.d / focus)) / 0.9, 0, 2), i0 = Math.floor(Math.min(lv, 1.999)), f = lv - i0;
        g.globalAlpha = a * (1 - f); g.drawImage(sprites[k][i0], p.x - w / 2, p.y - h / 2, w, h);
        g.globalAlpha = a * f; g.drawImage(sprites[k][i0 + 1], p.x - w / 2, p.y - h / 2, w, h);
      }
      g.globalAlpha = 1;
      g.restore();
      const hz = sstep(clamp((0.3 - (1 - cam.z)) / 0.22));
      if (hz > 0) { g.fillStyle = rgba(haze, hz); g.fillRect(0, 0, W, H); }
      const fin = 1 - outC(seg(t, 0, 320));
      if (fin > 0) { g.fillStyle = rgba(hex(first), fin); g.fillRect(0, 0, W, H); }
      // konec: appka se vynoří z mlhy
      const k = seg(t, 1790, LEN), e = outQ(k);
      if (app) app.style.transform = k > 0 ? `scale(${lerp(1.07, 1, e)})` : 'scale(1.07)';
      cv.style.opacity = 1 - sstep(k);
    }

    cv.style.background = 'transparent';
    addEventListener('resize', size);
    const t0 = performance.now();
    const step = (now) => {
      if (done) return;
      const t = now - t0;
      try { draw(Math.min(t, LEN)); } catch { finish(); return; }
      if (t >= LEN) { removeEventListener('resize', size); done = true; cv.remove(); if (app) app.style.transform = ''; resolve(); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return finished;
  }
  return { start, skip: finish, finished };
}
