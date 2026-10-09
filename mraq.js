/* Mraq — maskot s obličejem. Nálady podle počasí, mrkání, koulení očima, mluvení.
   Obličej se kreslí do SVG každý snímek z pár čísel (otevření očí, víčka, pusa…),
   takže se mezi náladami plynule přelévá. Hlášky jsou v hlasky.txt. */

const $ = (s) => document.querySelector(s);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- Nálady ----------
   Oči jsou „robotí“ jako Cozmo / RoboEyes, ale skládané z teček jako písmo Doto (tečkovaná teplota).
   Parametry: open = otevření, lidT = horní víčko (+ zamračeně, vnitřek dolů / − unaveně, vnějšek dolů),
   happy = spodní víčko do oblouku (^ ^), eyeW/eyeH = polovina šířky/výšky oka, round = zakulacení rohů,
   lookX/lookY = kam kouká, asym = jedno oko přimhouřené, spark = odlesk, blush = tvářičky. */
const BASE = { open: 1, lidT: 0, happy: 0, eyeW: 15, eyeH: 17, round: .45, lookX: 0, lookY: 0, spark: 0, blush: 0, asym: 0 };
export const MOODS = {
  radost:     { name: 'má radost',       color: '#f7c948', p: { happy: .8, eyeW: 15, eyeH: 16, blush: .5 }, idle: 'hop' },
  vecer:      { name: 'má hezkej večer', color: '#9d8fe0', p: { happy: .55, open: .9 } },
  pohoda:     { name: 'v pohodě',        color: '#8fd3b8', p: {} },
  ospaly:     { name: 'je ospalej',      color: '#a3a9e8', p: { open: .42, lidT: -.35, lookY: .5 }, idle: 'yawn' },
  spi:        { name: 'spí',             color: '#6c72c4', p: { open: 0 }, sleep: true },
  smutek:     { name: 'je smutnej',      color: '#74bff0', p: { open: .8, lidT: -.6, lookY: .7, eyeW: 13, eyeH: 15 } },
  znechuceni: { name: 'je znechucenej',  color: '#5ccb8a', p: { open: .8, lidT: .25, asym: .6, lookX: -.45 }, idle: 'tilt' },
  stejne:     { name: 'se nudí',         color: '#8a93d9', p: { open: .5, lookX: .8, round: .35 }, idle: 'roll' },
  mlha:       { name: 'nic nevidí',      color: '#a3a8bd', p: { open: .45, lookX: .2, round: .35 }, idle: 'roll' },
  nuda:       { name: 'se nudí',         color: '#8a93d9', p: { open: .55, lidT: -.2, lookX: -.7, round: .35 }, idle: 'roll' },
  strach:     { name: 'se bojí',         color: '#c3a3ea', p: { eyeW: 11, eyeH: 18, lookY: -.3, round: .6 }, idle: 'shake' },
  vztek:      { name: 'zuří',            color: '#e4605a', p: { open: .85, lidT: .85, eyeW: 16 }, idle: 'shake' },
  nervy:      { name: 'je nervózní',     color: '#f2965a', p: { open: .9, lidT: -.4, eyeW: 13 }, idle: 'dart' },
  zima:       { name: 'mrzne',           color: '#a8d8ff', p: { open: .45, happy: .3, lidT: .15, blush: .7 }, idle: 'shiver' },
  snih:       { name: 'je nadšenej',     color: '#5fb6dd', p: { eyeW: 16, eyeH: 19, spark: 1, round: .6 }, idle: 'hop' },
};

/* ---------- Hlášky (hlasky.txt) ---------- */
const FALLBACK = {
  radost: ['{teplota}° a sluníčko. Konečně.'], pohoda: ['{stav}, {teplota}°. Dá se.'], ospaly: ['Ještě spím. {teplota}° je na mě moc brzo.'],
  spi: ['Pšt, spím. Slunce vyleze v {vychod}.'], smutek: ['Prší. Nebrečím, to jen ze mě padá voda.'], znechuceni: ['Mrholí. Fuj.'],
  nuda: ['Zase zataženo. Fakt originální.'], mlha: ['Mlha. Svět se dneska načítá pomalejc.'], vecer: ['Jasnej večer. Hvězdy jsou v provozu.'], stejne: ['Ctrl+C, Ctrl+V ze včerejška.'], strach: ['Bouřka! Schovej se.'], vztek: ['{pocitove}°?! Rozpouštím se.'],
  nervy: ['Fouká {vitr} km/h! Drž si čepici.'], zima: ['Pocitově {pocitove}°. Brrr.'], snih: ['Sněží!!'],
  'pohoda-popisky': ['Paráda', 'Fajn', 'Ujde to', 'Meh', 'Zůstaň doma'],
};
export let LINES = { ...FALLBACK };
export const TEXTS = {}; // sekce [texty]: klíč = text
/** Text z hlasky.txt (sekce [texty]) s doplněnými proměnnými; když chybí, použije se výchozí. */
export const T = (key, vars = {}, def = '') => (TEXTS[key] ?? def).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
export async function loadLines() {
  try {
    const r = await fetch('hlasky.txt', { cache: 'no-cache' });
    if (!r.ok) return LINES;
    const out = {}; let cur = null;
    for (const raw of (await r.text()).split(/\r?\n/)) {
      const l = raw.trim();
      if (!l || l.startsWith('#')) continue;
      const m = l.match(/^\[(.+)\]$/);
      if (m) { cur = m[1].trim().toLowerCase(); out[cur] = out[cur] || []; continue; }
      if (cur === 'texty') { const kv = l.match(/^([\w.\-]+)\s*=\s*(.*)$/); if (kv) TEXTS[kv[1]] = kv[2]; continue; }
      if (cur) out[cur].push(l);
    }
    for (const k of Object.keys(out)) if (out[k].length) LINES[k] = out[k];
  } catch {}
  return LINES;
}
// doplní proměnné a první písmeno dá velké („zataženo, 14°“ → „Zataženo, 14°“)
const fill = (s, ctx) => { const t = s.replace(/\{(\w+)\}/g, (_, k) => (ctx[k] ?? `{${k}}`)); return t.charAt(0).toUpperCase() + t.slice(1); };

/* ---------- Tečkové (pixel) oči ---------- */
const PITCH = 5.4, DOT = 4.5; // rozteč a velikost teček ve viewBoxu 120×120 (jako písmo Doto)
function pixelEye(cx, cy, p, side, openMul) {
  const open = clamp(p.open * openMul * (side > 0 ? 1 - p.asym * .5 : 1), 0, 1.2);
  const x0 = cx + p.lookX * 6, y0 = cy + p.lookY * 5;
  const w = p.eyeW, H = p.eyeH, hh = Math.max(.1, H * open);
  const dots = [], spark = [];
  // mřížka teček je vycentrovaná na každé oko → obě oči jsou souměrné
  const n = Math.ceil((w + PITCH) / PITCH), m = Math.ceil((H + PITCH) / PITCH);
  if (open < .16) { // zavřené oko = jedna řada teček
    const yy = y0 + Math.round(H * .25 / PITCH) * PITCH;
    for (let k = -n; k <= n; k++) { const x = x0 + k * PITCH; if (Math.abs(x - x0) <= w * .9) dots.push([x, yy]); }
    return { dots, spark };
  }
  const r = Math.min(w, hh) * p.round;
  const hx = x0 + w * .45, hy = y0 - hh * .5; // odlesk
  for (let j = -m; j <= m; j++) {
    const y = y0 + j * PITCH;
    for (let k = -n; k <= n; k++) {
      const x = x0 + (k + .5) * PITCH;
      const dx = Math.abs(x - x0), dy = Math.abs(y - y0);
      if (dx > w || dy > hh) continue;
      if (dx > w - r && dy > hh - r && (dx - (w - r)) ** 2 + (dy - (hh - r)) ** 2 > r * r) continue;
      // horní víčko: + zamračeně (vnitřní kraj dolů), − unaveně/smutně (vnější kraj dolů)
      const u = ((x - x0) / w) * -side; // +1 = u nosu, −1 = venku
      const drop = p.lidT > 0 ? p.lidT * hh * 1.25 * (u + 1) / 2 : -p.lidT * hh * 1.25 * (1 - u) / 2;
      if (y < y0 - hh + drop) continue;
      // spodní víčko do oblouku = úsměv očima
      if (p.happy >= .5) { // radost: oko se změní v oblouček ∩
        const ay = y0 + hh * .4, ry = hh * 1.1, t = PITCH * 1.8;
        if (y > ay + .1) continue;
        const o = (dx / w) ** 2 + ((y - ay) / ry) ** 2, i = (dx / Math.max(1, w - t)) ** 2 + ((y - ay) / Math.max(1, ry - t)) ** 2;
        if (o > 1.08 || i < 1) continue;
      } else if (p.happy > .02) { const ey = y0 + hh * 1.2, rx = w * 1.2, ry = hh * 1.2 * p.happy; if ((dx / rx) ** 2 + ((y - ey) / ry) ** 2 < 1) continue; }
      if (p.spark > .3 && Math.abs(x - hx) < PITCH * .6 && Math.abs(y - hy) < PITCH * .6) { spark.push([x, y]); continue; }
      dots.push([x, y]);
    }
  }
  return { dots, spark };
}
const R2 = DOT / 2;
const dotsPath = (arr) => arr.map(([x, y]) => `M${(x - R2).toFixed(1)} ${y.toFixed(1)}a${R2} ${R2} 0 1 0 ${DOT} 0a${R2} ${R2} 0 1 0 -${DOT} 0`).join('');

/* ---------- Maskot ---------- */
export function createMraq() {
  const orb = $('#orb');
  const el = {
    eyes: $('#eyes'), sparks: $('#sparks'),
    blushL: $('#blushL'), blushR: $('#blushR'), say: $('#say'), name: $('#moodName'),
  };
  const cur = { ...BASE, ...MOODS.pohoda.p };
  let mood = 'pohoda', target = { ...BASE, ...MOODS.pohoda.p };
  let action = null;          // { t0, dur, fn(k) → {params, openL, openR} }
  let blinkAt = performance.now() + 1800, blink = null;
  let idleAt = performance.now() + 6000;
  let talking = 0, look = { x: 0, y: 0, until: 0 };
  let ctx = {}, lineIdx = {}, typeTimer = 0, lastFrame = 0;

  const ACTIONS = {
    hop: () => { kick('hop'); return { dur: 700, fn: (k) => ({ p: { happy: Math.max(target.happy, Math.sin(k * Math.PI) * .9) } }) }; },
    roll: () => ({ dur: 1300, fn: (k) => { const a = Math.PI * (1 + k * 1.15); const s = Math.sin(k * Math.PI); return { p: { lookX: Math.cos(a) * .9 * s + target.lookX * (1 - s), lookY: -.9 * s + Math.sin(a) * .2, open: lerp(target.open, .6, s) } }; } }),
    yawn: () => ({ dur: 1600, fn: (k) => { const s = Math.sin(k * Math.PI); return { p: { open: target.open * (1 - s * .9), lidT: -.6 * s, lookY: .4 } }; } }),
    shake: () => { kick('shake'); return { dur: 600, fn: () => ({ p: {} }) }; },
    shiver: () => { kick('shiver'); return { dur: 900, fn: () => ({ p: {} }) }; },
    dart: () => { const xs = [-1, 1, -.6, .9, 0]; return { dur: 1200, fn: (k) => ({ p: { lookX: xs[Math.min(4, Math.floor(k * 5))], lookY: -.2 } }) }; },
    wink: () => ({ dur: 650, fn: (k) => ({ openR: 1 - Math.sin(k * Math.PI), p: { happy: .5 * Math.sin(k * Math.PI) } }) }),
    wake: () => { kick('hop'); return { dur: 1400, fn: (k) => { const s = Math.sin(k * Math.PI); return { p: { open: s * .6, lookX: Math.sin(k * 9) * .5 * s } }; } }; },
    droop: () => ({ dur: 1200, fn: (k) => { const s = Math.sin(k * Math.PI); return { p: { lookY: lerp(target.lookY, 1, s), lidT: target.lidT - .2 * s } }; } }),
    tilt: () => { kick('tilt'); return { dur: 900, fn: (k) => ({ p: { asym: target.asym + Math.sin(k * Math.PI) * .4, lookX: -.8 * Math.sin(k * Math.PI) } }) }; },
  };
  const TAP = { vecer: 'wink', mlha: 'roll', stejne: 'roll', radost: 'hop', pohoda: 'wink', ospaly: 'yawn', spi: 'wake', smutek: 'droop', znechuceni: 'tilt', nuda: 'roll', strach: 'shake', vztek: 'shake', nervy: 'dart', zima: 'shiver', snih: 'hop' };

  function kick(cls) { orb.classList.remove('hop', 'shake', 'shiver', 'tilt'); void orb.offsetWidth; orb.classList.add(cls); }
  function run(name) { const a = ACTIONS[name]?.(); if (a) action = { ...a, t0: performance.now() }; }

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || now - lastFrame < 30) return;
    const dt = Math.min(80, now - lastFrame); lastFrame = now;
    const ease = 1 - Math.pow(1 - .14, dt / 16);

    // cílové hodnoty + akce
    let over = {}, openL = 1, openR = 1;
    if (action) {
      const k = (now - action.t0) / action.dur;
      if (k >= 1) action = null; else { const r = action.fn(k); over = r.p || {}; openL = r.openL ?? 1; openR = r.openR ?? 1; }
    }
    for (const key in BASE) cur[key] = lerp(cur[key], over[key] ?? target[key], over[key] != null ? .5 : ease);

    // mrkání
    const sleeping = MOODS[mood].sleep;
    if (!sleeping && !blink && now > blinkAt && !window.__noBlink) blink = now;
    let bl = 1;
    if (blink) { const k = (now - blink) / 170; if (k >= 1) { blink = null; blinkAt = now + 2200 + Math.random() * 4200; } else bl = Math.abs(1 - 2 * k) ** 1.5; }

    // idle chování nálady
    if (!action && now > idleAt) { const idle = MOODS[mood].idle; if (idle && !talkingNow()) run(idle); idleAt = now + 7000 + Math.random() * 6000; }

    // sledování prstu / myši
    const p = { ...cur };
    if (now < look.until && !action) { p.lookX = lerp(p.lookX, look.x, .7); p.lookY = lerp(p.lookY, look.y, .7); }

    // mluvení = oči lehce poskakují
    if (talkingNow() && !sleeping) p.lookY += Math.sin(now / 70) * .12;

    const L = pixelEye(39, 60, p, -1, bl * openL), R = pixelEye(81, 60, p, 1, bl * openR);
    el.eyes.setAttribute('d', dotsPath(L.dots) + dotsPath(R.dots));
    el.sparks.setAttribute('d', dotsPath(L.spark) + dotsPath(R.spark));
    el.blushL.style.opacity = el.blushR.style.opacity = (p.blush * .55).toFixed(2);
  }
  const talkingNow = () => talking > performance.now();

  function type(text) {
    clearInterval(typeTimer);
    el.say.textContent = '';
    const span = document.createElement('span'); const caret = document.createElement('i');
    caret.className = 'caret'; el.say.append(span, caret);
    let i = 0; const chars = [...text];
    talking = performance.now() + chars.length * 32 + 200;
    typeTimer = setInterval(() => {
      span.textContent += chars[i++] ?? '';
      if (i >= chars.length) { clearInterval(typeTimer); setTimeout(() => caret.remove(), 1600); }
    }, 32);
  }
  // hláška s proměnnou, která by zněla hloupě (0,1 mm „hodně kapek“, 20 % „jistota“), se přeskočí
  const num = (v) => parseFloat(String(v ?? '').replace(',', '.'));
  const usable = (s) => !(
    (/\{mm\}/.test(s) && !(num(ctx.mm) >= 0.5)) || (/\{sance\}/.test(s) && !(num(ctx.sance) >= 50)) ||
    (/\{vitr\}/.test(s) && !(num(ctx.vitr) >= 30)) || (/\{narazy\}/.test(s) && !(num(ctx.narazy) >= 45)));
  function nextLine(key, seed) {
    const list = LINES[key] || FALLBACK[key] || [''];
    if (lineIdx[key] == null) lineIdx[key] = (seed ?? Math.floor(Math.random() * 1e6)) % list.length;
    else lineIdx[key] = (lineIdx[key] + 1) % list.length;
    for (let n = 0; n < list.length && !usable(list[lineIdx[key]]); n++) lineIdx[key] = (lineIdx[key] + 1) % list.length;
    return fill(list[lineIdx[key]], ctx);
  }

  // veřejné API
  const api = {
    get mood() { return mood; },
    set(key, c, { speak = true, prefix = '', seed } = {}) {
      ctx = c || ctx;
      const changed = key !== mood;
      mood = MOODS[key] ? key : 'pohoda';
      target = { ...BASE, ...MOODS[mood].p };
      orb.style.setProperty('--orb', MOODS[mood].color);
      orb.classList.toggle('sleep', !!MOODS[mood].sleep);
      el.name.textContent = MOODS[mood].name;
      if (speak && (changed || !el.say.textContent)) { type(prefix + nextLine(mood, seed)); if (changed) run(TAP[mood]); }
    },
    setFx(fx) { if (orb.dataset.fx !== fx) orb.dataset.fx = fx; },
    react() { run(TAP[mood]); type(nextLine(mood)); navigator.vibrate?.(8); },
    lookAt(x, y) { look = { x: clamp(x, -1, 1), y: clamp(y, -1, 1), until: performance.now() + 1500 }; },
  };

  orb.addEventListener('click', () => api.react());
  addEventListener('pointermove', (e) => {
    const r = orb.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / 220, dy = (e.clientY - (r.top + r.height / 2)) / 260;
    api.lookAt(dx, dy);
  }, { passive: true });
  requestAnimationFrame(frame);
  return api;
}
