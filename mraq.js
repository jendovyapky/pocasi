/* Mraq — maskot s obličejem. Nálady podle počasí, mrkání, koulení očima, mluvení.
   Obličej se kreslí do SVG každý snímek z pár čísel (otevření očí, víčka, pusa…),
   takže se mezi náladami plynule přelévá. Hlášky jsou v hlasky.txt. */

const $ = (s) => document.querySelector(s);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- Nálady ---------- */
const BASE = { open: 1, lidT: 0, lidB: 0, eyeW: 9.5, eyeH: 11, lookX: 0, lookY: 0, curve: 0, mw: 10, mOpen: 0, wave: 0, tilt: 0, spark: 0, blush: 0, asym: 0, closedCurve: 1 };
export const MOODS = {
  radost:     { name: 'má radost',       color: '#f7c948', p: { open: 1, lidB: .5, curve: 1, mw: 13, blush: .45, spark: .35 }, idle: 'hop' },
  pohoda:     { name: 'v pohodě',        color: '#8fd3b8', p: { open: .85, lidB: .2, curve: .5, mw: 10 } },
  ospaly:     { name: 'je ospalej',      color: '#a3a9e8', p: { open: .4, lookY: .6, curve: 0, mw: 6 }, idle: 'yawn' },
  spi:        { name: 'spí',             color: '#6c72c4', p: { open: 0, curve: .25, mw: 5, closedCurve: 1 }, sleep: true },
  smutek:     { name: 'je smutnej',      color: '#74bff0', p: { open: .9, lidT: -.55, lookY: .45, curve: -.85, mw: 9 } },
  znechuceni: { name: 'je znechucenej',  color: '#5ccb8a', p: { open: .6, lidT: .15, asym: .6, curve: -.35, tilt: .7, mw: 10 } },
  stejne:     { name: 'se nudí',         color: '#8a93d9', p: { open: .5, lookX: .7, curve: 0, mw: 9 }, idle: 'roll' },
  nuda:       { name: 'se nudí',         color: '#8a93d9', p: { open: .5, lookX: .7, curve: 0, mw: 9 }, idle: 'roll' },
  strach:     { name: 'se bojí',         color: '#c3a3ea', p: { open: 1, eyeW: 7, eyeH: 8.5, wave: 1, mw: 12 }, idle: 'shake' },
  vztek:      { name: 'zuří',            color: '#e4605a', p: { open: .75, lidT: .65, curve: -.6, mw: 8 }, idle: 'shake' },
  nervy:      { name: 'je nervózní',     color: '#f2965a', p: { open: 1, eyeW: 7.5, eyeH: 11, mw: 14 }, idle: 'dart' },
  zima:       { name: 'mrzne',           color: '#a8d8ff', p: { open: .75, lookY: .4, wave: .55, curve: -.2, mw: 7, blush: .7 }, idle: 'shiver' },
  snih:       { name: 'je nadšenej',     color: '#5fb6dd', p: { open: 1, eyeW: 10, eyeH: 11, spark: 1, curve: .75, mw: 7 }, idle: 'hop' },
};

/* ---------- Hlášky (hlasky.txt) ---------- */
const FALLBACK = {
  radost: ['{teplota}° a sluníčko. Konečně.'], pohoda: ['{stav}, {teplota}°. Dá se.'], ospaly: ['Ještě spím. {teplota}° je na mě moc brzo.'],
  spi: ['Pšt, spím. Slunce vyleze v {vychod}.'], smutek: ['Prší. Nebrečím, to jen ze mě padá voda.'], znechuceni: ['Mrholí. Fuj.'],
  nuda: ['Zase zataženo. Fakt originální.'], stejne: ['Ctrl+C, Ctrl+V ze včerejška.'], strach: ['Bouřka! Schovej se.'], vztek: ['{pocitove}°?! Rozpouštím se.'],
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
const fill = (s, ctx) => s.replace(/\{(\w+)\}/g, (_, k) => (ctx[k] ?? `{${k}}`));

/* ---------- Geometrie ---------- */
function clipHalf(poly, keep) { // Sutherland–Hodgman proti jedné polorovině
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ka = keep(a), kb = keep(b);
    if (ka.v >= 0) out.push(a);
    if ((ka.v >= 0) !== (kb.v >= 0)) { const t = ka.v / (ka.v - kb.v); out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]); }
  }
  return out;
}
function eyePath(cx, cy, p, side, openMul) {
  const rx = p.eyeW, ry = p.eyeH;
  const open = clamp(p.open * openMul * (side > 0 ? 1 - p.asym * .45 : 1), 0, 1);
  const x0 = cx + p.lookX * 4.5, y0 = cy + p.lookY * 3.5;
  if (open < .13) return { d: '', lash: `M${x0 - rx} ${y0} Q${x0} ${y0 + 6 * p.closedCurve} ${x0 + rx} ${y0}`, x0, y0, open };
  let poly = [];
  for (let k = 0; k < 36; k++) { const a = (k / 36) * Math.PI * 2; poly.push([x0 + Math.cos(a) * rx, y0 + Math.sin(a) * ry]); }
  // horní víčko: přímka, sklon podle lidT (kladné = zamračený, vnitřní kraj dolů)
  const topY = y0 - ry + (1 - open) * 2 * ry * .92;
  const slope = p.lidT * .75 * side; // side: -1 levé oko (vnitřek vpravo), +1 pravé
  poly = clipHalf(poly, ([x, y]) => ({ v: y - (topY + (x - x0) * -slope) }));
  // spodní víčko (úsměv „půlměsíc“)
  const botY = y0 + ry - p.lidB * ry * 1.35 + (side > 0 ? 0 : p.asym * 3);
  poly = clipHalf(poly, ([, y]) => ({ v: botY - y }));
  if (poly.length < 3) return { d: '', lash: `M${x0 - rx} ${y0} Q${x0} ${y0 + 5} ${x0 + rx} ${y0}`, x0, y0, open: 0 };
  return { d: 'M' + poly.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L') + 'Z', lash: '', x0, y0, open };
}
function mouthPath(p, talk) {
  const cx = 60, cy = 75, w = p.mw, n = 18;
  let d = '';
  for (let k = 0; k <= n; k++) {
    const u = k / n * 2 - 1, x = cx + u * w;
    const y = cy + p.curve * 7 * (1 - u * u) - p.curve * 1.5 + p.wave * 2.2 * Math.sin(u * Math.PI * 2.5) + p.tilt * u * 3.5;
    d += (k ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
  }
  const o = clamp(p.mOpen + talk, 0, 1);
  return { d, o, cx, cy: cy + p.curve * 3 };
}

/* ---------- Maskot ---------- */
export function createMraq() {
  const orb = $('#orb');
  const el = {
    eyeL: $('#eyeL'), eyeR: $('#eyeR'), lashL: $('#lashL'), lashR: $('#lashR'),
    sparkL: $('#sparkL'), sparkR: $('#sparkR'), mouth: $('#mouth'), mouthO: $('#mouthO'),
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
    hop: () => { kick('hop'); return { dur: 700, fn: (k) => ({ p: { lidB: cur.lidB + Math.sin(k * Math.PI) * .35, curve: target.curve + Math.sin(k * Math.PI) * .3 } }) }; },
    roll: () => ({ dur: 1300, fn: (k) => { const a = Math.PI * (1 + k * 1.15); const s = Math.sin(k * Math.PI); return { p: { lookX: Math.cos(a) * .9 * s + target.lookX * (1 - s), lookY: -.9 * s + Math.sin(a) * .2, open: lerp(target.open, .62, s) } }; } }),
    yawn: () => ({ dur: 1600, fn: (k) => { const s = Math.sin(k * Math.PI); return { p: { mOpen: s * 1.1, open: target.open * (1 - s * .8), mw: target.mw - s * 2 } }; } }),
    shake: () => { kick('shake'); return { dur: 600, fn: () => ({ p: {} }) }; },
    shiver: () => { kick('shiver'); return { dur: 900, fn: () => ({ p: {} }) }; },
    dart: () => { const xs = [-1, 1, -.6, .9, 0]; return { dur: 1200, fn: (k) => ({ p: { lookX: xs[Math.min(4, Math.floor(k * 5))], lookY: -.2 } }) }; },
    wink: () => ({ dur: 650, fn: (k) => ({ openR: 1 - Math.sin(k * Math.PI), p: { curve: target.curve + .4 * Math.sin(k * Math.PI) } }) }),
    wake: () => { kick('hop'); return { dur: 1400, fn: (k) => { const s = Math.sin(k * Math.PI); return { p: { open: s * .55, mOpen: s * .4 } }; } }; },
    droop: () => ({ dur: 1200, fn: (k) => { const s = Math.sin(k * Math.PI); return { p: { lookY: lerp(target.lookY, 1, s), curve: target.curve - s * .3 } }; } }),
    tilt: () => { kick('tilt'); return { dur: 900, fn: (k) => ({ p: { asym: target.asym + Math.sin(k * Math.PI) * .4, lookX: -.8 * Math.sin(k * Math.PI) } }) }; },
  };
  const TAP = { stejne: 'roll', radost: 'hop', pohoda: 'wink', ospaly: 'yawn', spi: 'wake', smutek: 'droop', znechuceni: 'tilt', nuda: 'roll', strach: 'shake', vztek: 'shake', nervy: 'dart', zima: 'shiver', snih: 'hop' };

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
    if (!sleeping && !blink && now > blinkAt) blink = now;
    let bl = 1;
    if (blink) { const k = (now - blink) / 170; if (k >= 1) { blink = null; blinkAt = now + 2200 + Math.random() * 4200; } else bl = Math.abs(1 - 2 * k) ** 1.5; }

    // idle chování nálady
    if (!action && now > idleAt) { const idle = MOODS[mood].idle; if (idle && !talkingNow()) run(idle); idleAt = now + 7000 + Math.random() * 6000; }

    // sledování prstu / myši
    const p = { ...cur };
    if (now < look.until && !action) { p.lookX = lerp(p.lookX, look.x, .7); p.lookY = lerp(p.lookY, look.y, .7); }

    // mluvení
    const talk = talkingNow() && !sleeping ? (.18 + .18 * Math.sin(now / 55)) * (MOODS[mood].p.curve > .6 ? .6 : 1) : 0;

    const L = eyePath(44, 52, p, -1, bl * openL), R = eyePath(76, 52, p, 1, bl * openR);
    el.eyeL.setAttribute('d', L.d); el.eyeR.setAttribute('d', R.d);
    el.lashL.setAttribute('d', L.lash); el.lashR.setAttribute('d', R.lash);
    const sp = clamp(p.spark, 0, 1);
    for (const [s, e] of [[el.sparkL, L], [el.sparkR, R]]) {
      s.setAttribute('cx', (e.x0 + p.eyeW * .35).toFixed(2)); s.setAttribute('cy', (e.y0 - p.eyeH * .35).toFixed(2));
      s.style.opacity = e.d ? Math.max(sp, .0) : 0;
      s.setAttribute('r', (1.2 + sp * 1.6).toFixed(2));
    }
    const m = mouthPath(p, talk);
    el.mouth.setAttribute('d', m.d);
    el.mouth.style.opacity = clamp(1 - m.o * 2.2, 0, 1);
    el.mouthO.setAttribute('cx', m.cx); el.mouthO.setAttribute('cy', m.cy);
    el.mouthO.setAttribute('rx', (p.mw * .42 + m.o * 2).toFixed(2)); el.mouthO.setAttribute('ry', (m.o * 7).toFixed(2));
    el.mouthO.style.opacity = m.o > .04 ? 1 : 0;
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
  function nextLine(key, seed) {
    const list = LINES[key] || FALLBACK[key] || [''];
    if (lineIdx[key] == null) lineIdx[key] = (seed ?? Math.floor(Math.random() * 1e6)) % list.length;
    else lineIdx[key] = (lineIdx[key] + 1) % list.length;
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
