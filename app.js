/* Mraq — počasí pro líné. Logika bez frameworku a bez buildu (maskot je v mraq.js). */
import { createMraq, loadLines, LINES } from './mraq.js';

const $ = (s) => document.querySelector(s);
const HOUR = 3600e3;
const STORE = 'lino:v1';
const DEFAULT_PLACE = { lat: 50.0755, lon: 14.4378, name: 'Praha', sub: 'Česko', auto: false };

const state = {
  place: null,
  data: null,      // zpracovaná data z Open-Meteo
  minutely: null,  // 15min srážky
  sel: 0,          // vybraný (desetinný) index do hodinových dat
  i0: 0,           // index hodiny „teď“
  span: 36,        // kolik hodin jde na časové ose
};

/* ---------------- Pomocné ---------------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pad2 = (n) => String(n).padStart(2, '0');
const parseLocal = (s) => { // "2026-10-09T14:00" → ms (lokální čas místa uložený jako UTC)
  const [d, t = '00:00'] = s.split('T');
  const [y, m, dd] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  return Date.UTC(y, m - 1, dd, hh, mm);
};
const hhmm = (ms) => { const d = new Date(ms); return `${d.getUTCHours()}:${pad2(d.getUTCMinutes())}`; };
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const DNY = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
const DNY_DLOUHE = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];

function at(arr, f) { // interpolace v poli podle desetinného indexu
  const i = Math.floor(f), t = f - i;
  const a = arr[clamp(i, 0, arr.length - 1)], b = arr[clamp(i + 1, 0, arr.length - 1)];
  if (a == null) return b; if (b == null) return a;
  return lerp(a, b, t);
}
function hashStr(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
const pick = (arr, seed) => arr[seed % arr.length];

function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } }
function save(patch) { try { localStorage.setItem(STORE, JSON.stringify({ ...load(), ...patch })); } catch {} }

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}

/* ---------------- Počasí: kódy WMO → čeština ---------------- */
const WMO = {
  0: 'Jasno', 1: 'Skoro jasno', 2: 'Polojasno', 3: 'Zataženo',
  45: 'Mlha', 48: 'Mlha s námrazou',
  51: 'Slabé mrholení', 53: 'Mrholení', 55: 'Husté mrholení', 56: 'Mrznoucí mrholení', 57: 'Mrznoucí mrholení',
  61: 'Slabý déšť', 63: 'Déšť', 65: 'Silný déšť', 66: 'Mrznoucí déšť', 67: 'Silný mrznoucí déšť',
  71: 'Slabé sněžení', 73: 'Sněžení', 75: 'Silné sněžení', 77: 'Sněhová zrna',
  80: 'Přeháňky', 81: 'Vydatné přeháňky', 82: 'Prudké přeháňky', 85: 'Sněhové přeháňky', 86: 'Silné sněhové přeháňky',
  95: 'Bouřka', 96: 'Bouřka s kroupami', 99: 'Silná bouřka s kroupami',
};
const kind = (c) => c >= 95 ? 'storm' : (c >= 71 && c <= 77) || c === 85 || c === 86 ? 'snow'
  : c >= 51 ? 'rain' : c >= 45 ? 'fog' : c === 3 ? 'cloud' : c === 2 ? 'part' : 'clear';

const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7z"/>',
  part: '<path d="M8 3.5v1.2M3.5 8H2.3M4.6 4.6l.9.9M12.4 4.6l-.9.9"/><path d="M5.3 10.6A3.3 3.3 0 0 1 11 6.8"/><path d="M9 20h8.5a3.5 3.5 0 0 0 .4-6.98A5 5 0 0 0 8.2 13.6 3.2 3.2 0 0 0 9 20z"/>',
  partn: '<path d="M11 7.5A4 4 0 0 1 5.2 4 4 4 0 1 0 11 7.5z"/><path d="M9 20h8.5a3.5 3.5 0 0 0 .4-6.98A5 5 0 0 0 8.2 13.6 3.2 3.2 0 0 0 9 20z"/>',
  rain: '<path d="M7 14h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 7a3.5 3.5 0 0 0 1 7z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
  snow: '<path d="M7 14h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 7a3.5 3.5 0 0 0 1 7z"/><path d="M8 18h.01M12 20h.01M16 18h.01M10 21.5h.01M14 21.5h.01" stroke-width="2.6"/>',
  storm: '<path d="M7 14h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 7a3.5 3.5 0 0 0 1 7z"/><path d="M12.5 14 10 18h4l-2.5 4"/>',
  fog: '<path d="M4 9h16M3 13h18M5 17h14"/>',
};
function icon(code, isDay = 1) {
  const k = kind(code);
  const name = k === 'clear' ? (isDay ? 'sun' : 'moon') : k === 'part' ? (isDay ? 'part' : 'partn') : k;
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

/* ---------------- Obloha (barvy podle slunce + počasí) ---------------- */
const PAL = {               //   nahoře      uprostřed   dole        záře
  night:  ['#0c1030', '#1d2456', '#33307a', '#5a54b8'],
  dawn:   ['#6f7bd0', '#f3a6a0', '#ffb36b', '#ff8a3d'],
  morning:['#9cc0ff', '#ffe3c4', '#ffc98a', '#fff1a8'],
  day:    ['#6fb5ff', '#b9f0ff', '#c4f59a', '#8be36b'],
  golden: ['#ffd6c2', '#ffd23f', '#ff8a1f', '#ffe066'],
  dusk:   ['#7f8de0', '#f6a38a', '#ff6b3d', '#ffb36b'],
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map((v) => pad2(Math.round(clamp(v, 0, 255)).toString(16))).join('');
const mix = (a, b, t) => toHex(hex(a).map((v, i) => lerp(v, hex(b)[i], t)));
const lum = (h) => { const [r, g, b] = hex(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

function sunPhase(ms) { // vrací {t, phase} — t je 0..1 přes den, <0 / >1 v noci
  const D = state.data.daily;
  const k = D.key.indexOf(dayKey(ms));
  const di = k < 0 ? 0 : k;
  const rise = D.sunrise[di], set = D.sunset[di];
  const t = (ms - rise) / (set - rise);
  return { t, rise, set, di };
}
function palAt(ms) {
  const { t, rise, set } = sunPhase(ms);
  const m = 50 * 60e3 / (set - rise); // ~50 min přechod v jednotkách dne
  const steps = [ // [t, paleta]
    [-3 * m, 'night'], [-m, 'dawn'], [m * 0.6, 'morning'], [m * 2.5, 'day'],
    [1 - m * 3, 'day'], [1 - m * 0.8, 'golden'], [1 + m * 0.6, 'dusk'], [1 + m * 2.5, 'night'],
  ];
  if (t <= steps[0][0] || t >= steps[steps.length - 1][0]) return PAL.night.slice();
  for (let i = 0; i < steps.length - 1; i++) {
    const [ta, pa] = steps[i], [tb, pb] = steps[i + 1];
    if (t >= ta && t <= tb) {
      const f = (t - ta) / (tb - ta);
      const e = f * f * (3 - 2 * f);
      return PAL[pa].map((c, j) => mix(c, PAL[pb][j], e));
    }
  }
  return PAL.day.slice();
}
function applySky(f) {
  const H = state.data.hourly;
  const ms = at(H.t, f);
  let p = palAt(ms);
  const cloud = at(H.cloud, f) / 100;
  const rain = at(H.precip, f);
  const code = H.code[Math.round(clamp(f, 0, H.code.length - 1))];
  const night = lum(p[1]) < 0.3;
  const grey = night ? '#2a2d3d' : '#a7adb8';
  p = p.map((c) => mix(c, grey, cloud * 0.55));
  if (rain > 0.1 || kind(code) === 'rain' || kind(code) === 'storm') p = p.map((c) => mix(c, night ? '#1b2233' : '#6f7d93', clamp(0.25 + rain * 0.15, 0, 0.6)));
  if (kind(code) === 'snow') p = p.map((c) => mix(c, night ? '#3a4157' : '#e9eef5', 0.35));

  const root = document.documentElement.style;
  root.setProperty('--c1', p[0]); root.setProperty('--c2', p[1]);
  root.setProperty('--c3', p[2]); root.setProperty('--glow', p[3]);

  const { t } = sunPhase(ms);
  root.setProperty('--sx', `${clamp(10 + t * 80, -10, 110)}%`);
  root.setProperty('--sy', `${t > 0 && t < 1 ? 38 - Math.sin(Math.PI * t) * 26 : 70}%`);

  const dark = (lum(p[0]) + lum(p[1])) / 2 < 0.42;
  document.body.classList.toggle('dark', dark);
  $('#sky').classList.toggle('rain', rain > 0.2 || kind(code) === 'rain' || kind(code) === 'storm');
  document.querySelector('meta[name=theme-color]').content = p[0];
}

/* ---------------- Data ---------------- */
async function fetchForecast(lat, lon) {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: 'auto',
    past_days: 1, forecast_days: 8, wind_speed_unit: 'kmh',
    current: 'temperature_2m,apparent_temperature,weather_code,cloud_cover,wind_speed_10m,precipitation,is_day,relative_humidity_2m',
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,uv_index,is_day,relative_humidity_2m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,precipitation_sum,uv_index_max',
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
  if (!r.ok) throw new Error('Předpověď se nepovedlo stáhnout');
  return r.json();
}
async function fetchMinutely(lat, lon) {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: 'auto',
    minutely_15: 'precipitation', forecast_minutely_15: 16, past_minutely_15: 0,
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
  if (!r.ok) throw new Error('minutely');
  return r.json();
}
function process(raw) {
  const h = raw.hourly, d = raw.daily;
  return {
    offset: raw.utc_offset_seconds * 1000,
    current: raw.current,
    hourly: {
      t: h.time.map(parseLocal), temp: h.temperature_2m, feels: h.apparent_temperature,
      prob: h.precipitation_probability.map((v) => v ?? 0), precip: h.precipitation.map((v) => v ?? 0),
      code: h.weather_code, cloud: h.cloud_cover, wind: h.wind_speed_10m, gust: h.wind_gusts_10m,
      uv: h.uv_index.map((v) => v ?? 0), isDay: h.is_day, hum: h.relative_humidity_2m,
    },
    daily: {
      key: d.time, t: d.time.map(parseLocal), code: d.weather_code, max: d.temperature_2m_max, min: d.temperature_2m_min,
      sunrise: d.sunrise.map(parseLocal), sunset: d.sunset.map(parseLocal),
      prob: d.precipitation_probability_max, sum: d.precipitation_sum, uv: d.uv_index_max,
    },
  };
}
const nowLocal = () => Date.now() + state.data.offset;

/* ---------------- Místo ---------------- */
async function reverseName(lat, lon) {
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=cs`);
    const j = await r.json();
    return { name: j.city || j.locality || j.principalSubdivision || 'Tady', sub: j.countryName || '' };
  } catch { return { name: 'Tady', sub: '' }; }
}
function geolocate() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('no geo'));
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lon: p.coords.longitude }),
      rej, { enableHighAccuracy: false, timeout: 9000, maximumAge: 10 * 60e3 });
  });
}
async function useMyLocation(silent) {
  try {
    const { lat, lon } = await geolocate();
    const nm = await reverseName(lat, lon);
    return { lat, lon, ...nm, auto: true };
  } catch {
    if (!silent) toast('Polohu jsi nepovolil. Tak aspoň Praha.');
    return null;
  }
}

/* ---------------- Texty: líné a vtipné ---------------- */
function compareYesterday() {
  const H = state.data.hourly;
  const today = dayKey(nowLocal());
  const idx = H.t.map((t, i) => [t, i]).filter(([t]) => dayKey(t) === today).map(([, i]) => i);
  const day = idx.filter((i) => { const h = new Date(H.t[i]).getUTCHours(); return h >= 8 && h <= 21; });
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const tNow = avg(day.map((i) => H.feels[i]));
  const tYest = avg(day.map((i) => H.feels[i - 24]).filter((v) => v != null));
  return tNow - tYest;
}
function lazyPhrase(delta) {
  const a = Math.abs(delta);
  if (a < 1.5) return { big: 'zhruba stejně', end: 'jako včera' };
  const dir = delta > 0 ? 'tepleji' : 'chladněji';
  if (a < 4) return { big: `trochu ${dir}`, end: 'než včera' };
  if (a < 8) return { big: `o dost ${dir}`, end: 'než včera' };
  return { big: delta > 0 ? 'úplně jiné léto' : 'úplně jiná zima', end: `(o ${Math.round(a)}° ${dir} než včera)` };
}

function daySummary() { // zbytek dne (teď → 22:00, min. 6 h)
  const H = state.data.hourly, i0 = state.i0;
  const n = Math.max(6, 22 - new Date(H.t[i0]).getUTCHours());
  const r = [...Array(n).keys()].map((k) => i0 + k).filter((i) => i < H.t.length);
  const codes = r.map((i) => H.code[i]);
  return {
    range: r,
    maxFeels: Math.max(...r.map((i) => H.feels[i])),
    minFeels: Math.min(...r.map((i) => H.feels[i])),
    maxProb: Math.max(...r.map((i) => H.prob[i])),
    sumRain: r.reduce((a, i) => a + H.precip[i], 0),
    maxWind: Math.max(...r.map((i) => Math.max(H.wind[i], (H.gust[i] || 0) * 0.7))),
    maxUv: Math.max(...r.map((i) => H.uv[i])),
    storm: codes.some((c) => c >= 95),
    snow: codes.some((c) => kind(c) === 'snow'),
    fog: codes.filter((c) => c === 45 || c === 48).length >= 2,
    rainy: r.some((i) => H.precip[i] >= 0.3 || H.prob[i] >= 60),
    drizzle: codes.filter((c) => c >= 61).length === 0 && codes.some((c) => c >= 51 && c <= 57),
    cloudy: r.reduce((a, i) => a + H.cloud[i], 0) / r.length > 70,
  };
}
function wearList(s) {
  const f = (s.maxFeels + s.minFeels) / 2;
  const w = [];
  if (f >= 25) w.push('triko', 'kraťasy');
  else if (f >= 20) w.push('triko', s.minFeels < 15 ? 'něco přes na večer' : 'lehké kalhoty');
  else if (f >= 15) w.push('lehká mikina');
  else if (f >= 10) w.push('mikina', 'lehká bunda');
  else if (f >= 4) w.push('bunda', 'něco pod ni');
  else if (f >= -2) w.push('zimní bunda', 'čepice');
  else w.push('termoprádlo', 'zimní bunda', 'čepice', 'rukavice');
  if (s.storm || s.maxProb >= 55 || s.sumRain >= 1) w.push('deštník ☂');
  else if (s.maxProb >= 30) w.push('deštník do batohu, pro jistotu');
  if (s.snow) w.push('boty, co nepromoknou');
  if (s.maxUv >= 6) w.push('brýle + krém');
  else if (s.maxUv >= 4 && !s.cloudy) w.push('sluneční brýle');
  if (s.maxWind > 38) w.push('nic, co uletí');
  return w;
}

/* ---------------- Render: statické části ---------------- */
function renderStatic() {
  const H = state.data.hourly, D = state.data.daily;
  $('#placeName').textContent = state.place.name;
  const now = nowLocal();
  $('#placeSub').textContent = `${DNY_DLOUHE[new Date(now).getUTCDay()]} ${new Date(now).getUTCDate()}. ${new Date(now).getUTCMonth() + 1}.`;

  // líný text
  const delta = compareYesterday();
  const ph = lazyPhrase(delta);
  $('#lazyBig').innerHTML = ph.big.split(' ').map((w, i) => `<span class="w" style="--d:${i}">${w}</span>`).join(' ');
  $('#lazyEnd').textContent = ph.end;
  const sum = daySummary();
  state.delta = delta;
  $('#wear').innerHTML = ['Vem si:', ...wearList(sum)].map((w, i) => `<span style="--d:${i}">${w}</span>`).join('');

  // pohoda – vlnka na 24 h (po půl hodinách) + kdy je nejlíp
  const moods = [...Array(48).keys()].map((k) => mood(state.i0 + k / 2));
  const best = moods.reduce((bi, m, k) => (m > moods[bi] ? k : bi), 0);
  $('#wave').innerHTML = moods.map((m, k) => `<i data-k="${k}" class="${k === best ? 'best' : ''}" style="height:${6 + m * 0.5}px"></i>`).join('');
  $('#waveMid').textContent = hhmm(H.t[state.i0 + 12]);
  state.best = { k: best, f: state.i0 + best / 2, m: moods[best] };
  const bestMs = H.t[state.i0] + best * HOUR / 2;
  $('#moodBest').textContent = best <= 1 ? 'nejlíp je teď' : `nejlíp ${dayKey(bestMs) !== dayKey(now) ? 'zítra ' : ''}${hhmm(bestMs)}`;

  // déšť – sloupce na 12 h: výška = šance, modrá = opravdu naprší
  const cols = [...Array(12).keys()].map((k) => state.i0 + k);
  $('#rainBars').innerHTML = cols.map((i, k) => {
    const p = H.prob[i] ?? 0, mm = H.precip[i] ?? 0;
    return `<div class="b ${mm >= 0.1 ? 'wet' : ''}" data-i="${i}" style="--h:${Math.max(4, p)}%;--d:${k}" title="${hhmm(H.t[i])}: ${p} %, ${fmtMm(mm)} mm"><i></i></div>`;
  }).join('');
  $('#rainAxis').innerHTML = `<span>teď</span><span>${hhmm(H.t[state.i0 + 6])}</span><span>${hhmm(H.t[state.i0 + 11])}</span>`;
  $('#rainNote').textContent = rainSentence();

  // části dne vs včera
  const todayIdx = H.t.findIndex((t) => dayKey(t) === dayKey(now));
  const parts = [['Ráno', 7], ['Poledne', 12], ['Odpoledne', 16], ['Večer', 20], ['Noc', 23]];
  $('#parts').innerHTML = `<div class="h"><span>dnes</span><span>vs. včera</span></div>` + parts.map(([n, h]) => {
    const i = todayIdx + h, t = H.temp[i], y = H.temp[i - 24];
    const d = Math.round(t - y);
    const arr = Math.abs(d) < 1 ? '=' : d > 0 ? '↑' : '↓';
    return `<div class="row"><span class="n">${n}</span><span class="t">${Math.round(t)}°</span><span class="ic">${icon(H.code[i], H.isDay[i])}</span><span class="d">${d > 0 ? '+' : ''}${d}° <em>${arr}</em></span></div>`;
  }).join('');

  // týden
  const di0 = D.key.indexOf(dayKey(now));
  const days = [...Array(7).keys()].map((k) => di0 + k).filter((i) => i < D.key.length);
  const lo = Math.min(...days.map((i) => D.min[i])), hi = Math.max(...days.map((i) => D.max[i]));
  $('#week').innerHTML = days.map((i, k) => {
    const l = (D.min[i] - lo) / (hi - lo || 1) * 100, r = (D.max[i] - lo) / (hi - lo || 1) * 100;
    const nm = k === 0 ? 'Dnes' : k === 1 ? 'Zítra' : DNY[new Date(D.t[i]).getUTCDay()];
    return `<div class="day"><span class="nm">${nm}</span><span class="ic">${icon(D.code[i])}</span><span class="lo">${Math.round(D.min[i])}°</span><span class="bar"><i style="left:${l}%;right:${100 - r}%"></i></span><span class="hi">${Math.round(D.max[i])}°</span></div>`;
  }).join('');

  $('#updated').textContent = `Aktualizováno ${new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`;
}

function moodParts(f) { // kolik bodů z 100 bere teplota, déšť, vítr, mraky a tma
  const H = state.data.hourly;
  const feels = at(H.feels, f), prob = at(H.prob, f), wind = at(H.wind, f), cloud = at(H.cloud, f), rain = at(H.precip, f);
  const isDay = at(H.isDay, f) > 0.5;
  return {
    [feels < 21 ? (feels < 10 ? 'zima' : 'chládek') : (feels > 27 ? 'vedro' : 'teplo')]: Math.abs(feels - 21) * 3.2,
    'déšť': prob * 0.35 + rain * 12,
    'vítr': Math.max(0, wind - 15) * 0.9,
    'mraky': cloud * 0.1,
    'tma': isDay ? 0 : 8,
  };
}
function mood(f) {
  const p = moodParts(f);
  return Math.round(clamp(100 - Object.values(p).reduce((a, b) => a + b, 0), 2, 99));
}
function moodWhy(f) {
  const [k, v] = Object.entries(moodParts(f)).sort((a, b) => b[1] - a[1])[0];
  return v < 9 ? 'nic to nekazí' : `kazí to ${k}`;
}
const moodLabel = (m) => { const l = LINES['pohoda-popisky'] || []; return l[m >= 85 ? 0 : m >= 70 ? 1 : m >= 50 ? 2 : m >= 30 ? 3 : 4] || ''; };
const fmtMm = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');

/* ---------------- Mraq: nálada podle počasí ---------------- */
function mascotMood(f) {
  const H = state.data.hourly;
  const i = Math.round(clamp(f, 0, H.t.length - 1));
  const ms = at(H.t, f);
  const k = kind(H.code[i]), code = H.code[i];
  const feels = at(H.feels, f), wind = at(H.wind, f), gust = at(H.gust, f) || 0, rain = at(H.precip, f), cloud = at(H.cloud, f);
  const { t, rise, set } = sunPhase(ms);
  if (k === 'storm') return 'strach';
  if (t < -0.02 || t > 1.06) return 'spi';
  if (k === 'snow') return 'snih';
  if (k === 'rain' && (code >= 61 || rain >= 0.3)) return 'smutek';
  if (k === 'rain') return 'znechuceni';
  if (wind >= 32 || gust >= 55) return 'nervy';
  if (feels >= 29) return 'vztek';
  if (feels <= 4) return 'zima';
  if (ms - rise < 2.2 * HOUR && new Date(ms).getUTCHours() < 10) return 'ospaly';
  if (k === 'fog' || cloud >= 85) return 'nuda';
  if (state.delta != null && Math.abs(state.delta) < 1 && cloud >= 60) return 'nuda';
  if ((k === 'clear' || k === 'part') && feels >= 13) return 'radost';
  return feels < 9 ? 'zima' : 'pohoda';
}
function mascotCtx(f) {
  const H = state.data.hourly, D = state.data.daily, c = state.data.current;
  const isNow = Math.abs(f - state.nowF) < 0.2;
  const i = Math.round(clamp(f, 0, H.t.length - 1));
  const { di } = sunPhase(at(H.t, f));
  const nextRise = sunPhase(at(H.t, f)).t > 1 ? D.sunrise[di + 1] ?? D.sunrise[di] : D.sunrise[di];
  const rest = daySummary();
  return {
    teplota: Math.round(isNow && c ? c.temperature_2m : at(H.temp, f)),
    pocitove: Math.round(isNow && c ? c.apparent_temperature : at(H.feels, f)),
    vitr: Math.round(at(H.wind, f)), narazy: Math.round(at(H.gust, f) || 0),
    sance: Math.round(Math.max(...[0, 1, 2, 3].map((k) => H.prob[i + k] ?? 0))),
    mm: fmtMm(rest.sumRain), vychod: hhmm(nextRise), zapad: hhmm(D.sunset[di]),
    stav: (WMO[isNow && c ? c.weather_code : H.code[i]] || '').toLowerCase(), misto: state.place.name,
  };
}
let mascotT = 0;
function updateMascot(f, first) {
  if (!mraq) return;
  const key = mascotMood(f);
  if (first) return mraq.set(key, mascotCtx(f), { seed: hashStr(dayKey(nowLocal()) + state.place.name) });
  clearTimeout(mascotT);
  mascotT = setTimeout(() => {
    if (key === mraq.mood) return;
    const isNow = Math.abs(f - state.nowF) < 0.2;
    const ms = at(state.data.hourly.t, f);
    const when = isNow ? '' : `${dayKey(ms) !== dayKey(nowLocal()) ? 'Zítra ' : ''}${hhmm(ms)} · `;
    mraq.set(key, mascotCtx(f), { prefix: when });
  }, 260);
}

function rainSentence() {
  const H = state.data.hourly, i0 = state.i0;
  const nowWet = H.precip[i0] >= 0.1;
  const r = [...Array(24).keys()].map((k) => i0 + k);
  if (state.minutely?.length) {
    const m = state.minutely;
    const first = m.findIndex((x) => x.p >= 0.1);
    if (first === 0) {
      const stop = m.findIndex((x) => x.p < 0.05);
      return stop > 0 ? `Prší. Podle modelu přestane kolem ${hhmm(m[stop].t)}.` : 'Prší a jen tak nepřestane.';
    }
    if (first > 0) return `Pozor, kolem ${hhmm(m[first].t)} začne pršet.`;
  }
  if (nowWet) { const stop = r.find((i) => H.precip[i] < 0.1); return stop ? `Prší. Konec v plánu kolem ${hhmm(H.t[stop])}.` : 'Prší a celý den to vypadá stejně.'; }
  const start = r.find((i) => H.precip[i] >= 0.2 || H.prob[i] >= 60);
  if (start == null) return 'Dalších 24 hodin sucho. Deštník může zůstat doma.';
  return `Do ${hhmm(H.t[start])} sucho, pak to začne kapat.`;
}

/* ---------------- Render: podle vybraného času ---------------- */
let lastShownTemp = null, lastHourInt = null;
function renderAt(f) {
  const H = state.data.hourly;
  const ms = at(H.t, f);
  const i = Math.round(clamp(f, 0, H.t.length - 1));
  const isNow = Math.abs(f - (state.nowF ?? state.i0)) < 0.2;

  const temp = Math.round(isNow && state.data.current ? state.data.current.temperature_2m : at(H.temp, f));
  if (temp !== lastShownTemp) {
    $('#tempNum').textContent = temp;
    const el = $('#temp'); el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick');
    lastShownTemp = temp;
  }
  const code = isNow && state.data.current ? state.data.current.weather_code : H.code[i];
  $('#cond').textContent = WMO[code] ?? '—';
  const feels = Math.round(isNow && state.data.current ? state.data.current.apparent_temperature : at(H.feels, f));
  const wind = Math.round(at(H.wind, f));
  $('#condSub').textContent = `Pocitově ${feels}° · vítr ${wind} km/h · ${Math.round(at(H.hum, f))} % vlhkost`;

  // chip
  const d = new Date(ms), nowD = new Date(nowLocal());
  const tomorrow = dayKey(ms) !== dayKey(nowLocal());
  $('#chip').textContent = isNow ? 'teď' : `${tomorrow ? 'zítra ' : ''}${d.getUTCHours()}:${pad2(Math.floor(d.getUTCMinutes() / 15) * 15)}`;

  // pohoda
  const m = mood(f);
  $('#moodNum').textContent = m;
  $('#moodLabel').textContent = moodLabel(m);
  $('#moodWhy').textContent = moodWhy(f);
  const k = Math.round((f - state.i0) * 2);
  document.querySelectorAll('#wave i').forEach((el, j) => {
    el.classList.toggle('on', Math.abs(j - k) <= 1);
    el.classList.toggle('hot', j === k);
  });

  // déšť
  $('#rainNum').innerHTML = `${Math.round(at(H.prob, f))}<small>%</small>`;
  $('#rainHead').textContent = isNow ? 'šance teď' : `šance v ${hhmm(H.t[i])}`;
  const mmNow = H.precip[i] ?? 0;
  $('#rainMm').textContent = mmNow >= 0.1 ? `naprší ~${fmtMm(mmNow)} mm/h` : 'nic nenaprší';
  document.querySelectorAll('#rainBars .b').forEach((el) => el.classList.toggle('sel', +el.dataset.i === i));

  updateMascot(f);

  // slunce
  renderSun(ms);
  applySky(f);

  if (lastHourInt !== null && Math.floor(f) !== lastHourInt && document.body.classList.contains('scrubbing')) navigator.vibrate?.(4);
  lastHourInt = Math.floor(f);
}

function renderSun(ms) {
  const { t, rise, set, di } = sunPhase(ms);
  $('#sunrise').textContent = hhmm(rise);
  $('#sunset').textContent = hhmm(set);
  const arc = $('#arc'), L = $('#tailL'), R = $('#tailR');
  let p;
  if (t >= 0 && t <= 1) {
    p = arc.getPointAtLength(arc.getTotalLength() * t);
  } else {
    // v noci: první půlka noci padá vpravo dolů, druhá vylézá zleva
    const D = state.data.daily;
    const nextRise = t > 1 ? D.sunrise[di + 1] ?? rise + 24 * HOUR : rise;
    const prevSet = t > 1 ? set : D.sunset[di - 1] ?? set - 24 * HOUR;
    const n = clamp((ms - prevSet) / (nextRise - prevSet), 0, 1);
    p = n < 0.5 ? R.getPointAtLength(R.getTotalLength() * n * 2) : L.getPointAtLength(L.getTotalLength() * (1 - (n - 0.5) * 2));
  }
  $('#sunDot').setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
  $('#sunStem').setAttribute('x1', p.x); $('#sunStem').setAttribute('x2', p.x);
  $('#sunStem').setAttribute('y2', p.y); $('#sunStemPin').setAttribute('cx', p.x);
  const day = t >= 0 && t <= 1;
  $('#sunStem').style.opacity = $('#sunStemPin').style.opacity = day ? 1 : 0;

  const left = (to) => { const m = Math.max(0, Math.round((to - ms) / 60e3)); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
  if (day) {
    const H = state.data.hourly; const f = (ms - H.t[0]) / HOUR;
    const good = at(H.cloud, f) < 50 && at(H.uv, f) < 6;
    $('#lightIcon').innerHTML = good ? icon(0, 1) : icon(3, 1);
    $('#lightLabel').textContent = `${left(set)} světla`;
  } else {
    const D = state.data.daily;
    const nextRise = t > 1 ? D.sunrise[di + 1] : rise;
    $('#lightIcon').innerHTML = icon(0, 0);
    $('#lightLabel').textContent = `${left(nextRise)} do rána`;
  }
}

/* ---------------- Tahání sluníčka po oblouku = posun času ---------------- */
function sunTimeFromPoint(x, y) {
  // najdi nejbližší bod na oblouku nebo na nočních „ocáscích“ a převeď ho na čas
  const H = state.data.hourly, D = state.data.daily;
  const paths = [['arc', $('#arc')], ['R', $('#tailR')], ['L', $('#tailL')]];
  let best = null;
  for (const [id, p] of paths) {
    const len = p.getTotalLength();
    for (let k = 0; k <= 60; k++) {
      const pt = p.getPointAtLength((len * k) / 60), d = (pt.x - x) ** 2 + (pt.y - y) ** 2;
      if (!best || d < best.d) best = { id, u: k / 60, d };
    }
  }
  const selMs = at(H.t, state.sel ?? state.nowF);
  const { di: di0 } = sunPhase(selMs);
  const toMs = (di) => {
    const rise = D.sunrise[di], set = D.sunset[di];
    if (rise == null || set == null) return null;
    if (best.id === 'arc') return rise + best.u * (set - rise);
    if (best.id === 'R') { const nr = D.sunrise[di + 1] ?? rise + 24 * HOUR; return set + best.u * 0.5 * (nr - set); }
    const ps = D.sunset[di - 1] ?? set - 24 * HOUR; return rise - best.u * 0.5 * (rise - ps);
  };
  let ms = toMs(di0);
  const now = nowLocal();
  if (ms != null && ms < now - 10 * 60e3) { const next = toMs(di0 + 1); if (next != null && (best.id !== 'R' || ms < now - HOUR)) ms = next; }
  if (ms == null) return null;
  return clamp((ms - H.t[0]) / HOUR, state.nowF, state.i0 + state.span);
}
function wireSunDrag() {
  const svg = $('#sunSvg'), dot = $('#sunDot');
  let dragging = false;
  const move = (e) => {
    if (!dragging || !state.data) return;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const f = sunTimeFromPoint(p.x, p.y);
    if (f != null) { stopPlay(); setScrollFor(f, false); }
  };
  dot.addEventListener('pointerdown', (e) => {
    dragging = true; dot.setPointerCapture(e.pointerId);
    document.body.classList.add('sundrag'); navigator.vibrate?.(6); e.preventDefault();
  });
  dot.addEventListener('pointermove', move);
  const end = () => { dragging = false; document.body.classList.remove('sundrag'); };
  dot.addEventListener('pointerup', end); dot.addEventListener('pointercancel', end);
}

/* ---------------- Časová osa (scrubber) ---------------- */
const W = 44; // px na hodinu
function buildDial() {
  const sc = $('#scroller'), tr = $('#track');
  const pad = sc.clientWidth / 2;
  tr.style.width = `${pad * 2 + state.span * W}px`;
  const H = state.data.hourly;
  let html = '';
  for (let h = 0; h <= state.span; h++) {
    const i = state.i0 + h; if (i >= H.t.length) break;
    const hr = new Date(H.t[i]).getUTCHours();
    const x = pad + h * W;
    html += `<i class="${hr === 0 ? 'mid' : 'h'}" style="left:${x}px"></i>`;
    if (hr % 3 === 0) html += `<b style="left:${x}px">${hr === 0 ? DNY[new Date(H.t[i]).getUTCDay()] : hr}</b>`;
    if (h < state.span) for (let q = 1; q < 4; q++) html += `<i style="left:${x + (q * W) / 4}px"></i>`;
  }
  tr.innerHTML = html;
}
function setScrollFor(f, smooth) {
  $('#scroller').scrollTo({ left: (f - state.i0) * W, behavior: smooth ? 'smooth' : 'instant' });
}
let raf = 0, scrubTimer = 0;
function onScroll() {
  const f = state.i0 + $('#scroller').scrollLeft / W;
  state.sel = f;
  document.body.classList.add('scrubbing');
  clearTimeout(scrubTimer); scrubTimer = setTimeout(() => document.body.classList.remove('scrubbing'), 180);
  cancelAnimationFrame(raf); raf = requestAnimationFrame(() => renderAt(f));
}

let playing = null;
function togglePlay() {
  if (playing) return stopPlay();
  const sc = $('#scroller');
  const startX = sc.scrollLeft, endX = sc.scrollWidth - sc.clientWidth;
  const from = startX >= endX - 2 ? 0 : startX;
  const dur = 9000 * (1 - from / endX) + 600;
  const t0 = performance.now();
  $('#playIco').innerHTML = '<path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" stroke="none"/>';
  const step = (now) => {
    const k = clamp((now - t0) / dur, 0, 1);
    const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    sc.scrollLeft = lerp(from, endX, e);
    if (k < 1 && playing) playing = requestAnimationFrame(step); else stopPlay();
  };
  playing = requestAnimationFrame(step);
}
function stopPlay() {
  if (playing) cancelAnimationFrame(playing);
  playing = null;
  $('#playIco').innerHTML = '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>';
}

/* ---------------- Radar (RainViewer: jen minulé 2 h) + předpověď pro moje místo ----------------
   Časová osa: −2 h … teď = skutečný radar na mapě, teď … +3 h = model ICON-D2 po 15 min,
   ale jen pro vybrané místo (RainViewer od 2026 nowcast nedává). */
const R = { map: null, marker: null, layers: [], frames: [], host: '', sel: 0, t0: 0, t1: 0, play: 0, shown: -1, loadedAt: 0 };
let leafletReady;
function loadLeaflet() {
  if (leafletReady) return leafletReady;
  leafletReady = new Promise((res, rej) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.append(css);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    s.onload = res; s.onerror = () => { leafletReady = null; rej(); }; document.head.append(s);
  });
  return leafletReady;
}
const placeTime = (epoch) => hhmm(epoch + state.data.offset);
const future = () => (state.minutely || []).map((x) => ({ t: x.t - state.data.offset, p: x.p }));
const intensity = (mm15) => { const h = mm15 * 4; return h < 0.1 ? 'sucho' : h < 1 ? 'slabý déšť' : h < 4 ? 'déšť' : h < 10 ? 'silný déšť' : 'liják'; };

async function openRadar() {
  const el = $('#radarSheet');
  el.hidden = false; el.classList.remove('closing');
  document.body.classList.add('radar-open');
  $('#radarPlace').textContent = state.place.name;
  const now = Date.now();
  R.t0 = now - 2 * HOUR; R.t1 = now + 3 * HOUR;
  buildTimeline();
  setRadarTime(now, true);
  try {
    await loadLeaflet();
    const L = window.L;
    if (!R.map) {
      R.map = L.map('map', { zoomControl: false, attributionControl: true, maxZoom: 10, minZoom: 3, zoomSnap: 0.5 });
      R.map.createPane('labels'); R.map.getPane('labels').style.zIndex = 450; R.map.getPane('labels').style.pointerEvents = 'none';
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri · <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">Weather data by RainViewer</a>', maxZoom: 10,
      }).addTo(R.map);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 10, pane: 'labels', opacity: 0.85,
      }).addTo(R.map);
      R.marker = L.marker([0, 0], { icon: L.divIcon({ className: 'me', html: '<i></i><b></b>', iconSize: [22, 22] }), interactive: false, zIndexOffset: 1000 }).addTo(R.map);
    }
    R.map.setView([state.place.lat, state.place.lon], 7, { animate: false });
    R.marker.setLatLng([state.place.lat, state.place.lon]);
    setTimeout(() => R.map.invalidateSize(), 60);

    if (Date.now() - R.loadedAt > 4 * 60e3 || !R.frames.length) {
      const j = await (await fetch('https://api.rainviewer.com/public/weather-maps.json')).json();
      R.layers.forEach((l) => R.map.removeLayer(l));
      R.host = j.host; R.frames = [...(j.radar.past || []), ...(j.radar.nowcast || [])]; // nowcast RainViewer od 2026 nedává, ale kdyby se vrátil, použije se R.loadedAt = Date.now(); R.shown = -1;
      R.layers = R.frames.map((fr) => L.tileLayer(`${R.host}${fr.path}/256/{z}/{x}/{y}/2/1_1.png`, {
        opacity: 0, maxNativeZoom: 7, maxZoom: 10, tileSize: 256, zIndex: 5, className: 'rv',
      }).addTo(R.map));
      if (R.frames.length) R.t0 = Math.min(R.t0, R.frames[0].time * 1000);
      buildTimeline();
    }
    setRadarTime(R.sel || Date.now(), true);
    playRadar(true);
  } catch {
    $('#radarRel').textContent = 'mapa se nenačetla – jsi online?';
  }
}
function closeRadar() {
  const el = $('#radarSheet'); el.classList.add('closing');
  stopRadar();
  document.body.classList.remove('radar-open');
  setTimeout(() => { el.hidden = true; el.classList.remove('closing'); }, 260);
}
const xOf = (t) => clamp((t - R.t0) / (R.t1 - R.t0), 0, 1) * 100;
function buildTimeline() {
  const now = Date.now();
  $('#tl').style.setProperty('--now', `${xOf(now)}%`);
  $('#tlPast').innerHTML = R.frames.map((fr) => `<i style="left:${xOf(fr.time * 1000)}%"></i>`).join('');
  const fut = future();
  const max = Math.max(0.5, ...fut.map((x) => x.p));
  $('#tlFuture').innerHTML = fut.map((x) => `<i class="${x.p < 0.02 ? 'dry' : ''}" style="left:${xOf(x.t)}%;width:${xOf(x.t + 15 * 60e3) - xOf(x.t)}%;height:${x.p < 0.02 ? 3 : 18 + (x.p / max) * 82}%"></i>`).join('');
  let lab = '';
  const first = Math.ceil((R.t0 + state.data.offset) / HOUR) * HOUR - state.data.offset;
  for (let t = first; t <= R.t1; t += HOUR) lab += `<span style="left:${xOf(t)}%">${placeTime(t)}</span>`;
  $('#tlLabels').innerHTML = lab;
}
function setRadarTime(t, force) {
  R.sel = clamp(t, R.t0, R.t1);
  $('#tlCursor').style.left = `${xOf(R.sel)}%`;
  const now = Date.now();
  const lastFrame = R.frames.length ? R.frames[R.frames.length - 1].time * 1000 : now;
  const isFuture = R.sel > lastFrame + 6 * 60e3;
  // snímek radaru: nejbližší starší (v budoucnu drží poslední, ztlumený)
  let idx = -1;
  for (let k = 0; k < R.frames.length; k++) if (R.frames[k].time * 1000 <= R.sel + 5 * 60e3) idx = k;
  if (idx !== R.shown || force) {
    R.layers.forEach((l, k) => l.setOpacity(k === idx ? (isFuture ? 0.35 : 0.8) : 0));
    R.shown = idx;
  } else if (idx >= 0) R.layers[idx]?.setOpacity(isFuture ? 0.35 : 0.8);
  $('#radarSheet').classList.toggle('future', isFuture);
  $('#radarBadge').textContent = isFuture || R.sel > now + 5 * 60e3 ? 'předpověď' : 'radar';
  const mins = Math.round((R.sel - now) / 60e3);
  if (isFuture) {
    const fut = future();
    const slot = fut.filter((x) => x.t <= R.sel).pop() || fut[0];
    $('#radarTime').textContent = placeTime(R.sel);
    $('#radarRel').textContent = `za ${mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}`;
    $('#nowcastNote').textContent = slot
      ? `U tebe ${slot.p >= 0.02 ? `${intensity(slot.p)} · ${fmtMm(slot.p)} mm za 15 min` : 'sucho'}. Mapa ukazuje poslední radar, budoucnost jen pro tvoje místo.`
      : 'Předpověď po 15 minutách teď není k dispozici.';
    const p = slot?.p || 0;
    R.marker?.getElement()?.style.setProperty('--wet', p >= 0.02 ? clamp(0.35 + p, 0, 1) : 0);
  } else {
    const shownT = idx >= 0 ? R.frames[idx].time * 1000 : R.sel;
    const ago = Math.round((now - shownT) / 60e3);
    $('#radarTime').textContent = placeTime(shownT);
    $('#radarRel').textContent = ago < 6 ? 'teď' : `před ${ago} min`;
    $('#nowcastNote').textContent = radarSummary();
    R.marker?.getElement()?.style.setProperty('--wet', 0);
  }
}
function radarSummary() {
  const fut = future();
  if (!fut.length) return 'Modře je, kde pršelo. Posuň osu doprava a uvidíš, co čeká tebe.';
  const total = fut.reduce((a, x) => a + x.p, 0);
  return total < 0.1 ? `Další 3 hodiny u tebe nic nespadne. ${rainSentence()}` : `${rainSentence()} Do ${placeTime(fut[fut.length - 1].t)} asi ${fmtMm(total)} mm.`;
}
function playRadar(force) {
  if (R.play && !force) return stopRadar();
  stopRadar();
  const D = 9000, hold = 900;
  let start = performance.now() - ((R.sel - R.t0) / (R.t1 - R.t0)) * D;
  if (R.sel >= R.t1 - 60e3) start = performance.now();
  $('#radarPlayIco').innerHTML = '<path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" stroke="none"/>';
  const step = (now) => {
    let k = (now - start) / D;
    if (k > 1 + hold / D) { start = now; k = 0; }
    setRadarTime(R.t0 + clamp(k, 0, 1) * (R.t1 - R.t0));
    R.play = requestAnimationFrame(step);
  };
  R.play = requestAnimationFrame(step);
}
function stopRadar() {
  if (R.play) cancelAnimationFrame(R.play);
  R.play = 0;
  $('#radarPlayIco').innerHTML = '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>';
}
function wireRadar() {
  const tl = $('#tl');
  let drag = false;
  const at = (e) => { const r = tl.getBoundingClientRect(); return R.t0 + clamp((e.clientX - r.left) / r.width, 0, 1) * (R.t1 - R.t0); };
  tl.addEventListener('pointerdown', (e) => { drag = true; tl.setPointerCapture(e.pointerId); stopRadar(); setRadarTime(at(e)); });
  tl.addEventListener('pointermove', (e) => { if (drag) setRadarTime(at(e)); });
  tl.addEventListener('pointerup', () => { drag = false; navigator.vibrate?.(4); });
  tl.addEventListener('pointercancel', () => { drag = false; });
  $('#radarPlay').onclick = () => playRadar(false);
  $('#radarClose').onclick = closeRadar;
  $('#radarLocate').onclick = () => R.map?.flyTo([state.place.lat, state.place.lon], 8, { duration: 0.8 });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#radarSheet').hidden) closeRadar(); });
}

/* ---------------- Sheets ---------------- */
function openSheet(sel) { const s = $(sel); s.hidden = false; s.classList.remove('closing'); }
function closeSheet(sel) {
  const s = $(sel); s.classList.add('closing');
  setTimeout(() => { s.hidden = true; s.classList.remove('closing'); }, 240);
}
let searchT;
async function search(q) {
  if (q.trim().length < 2) { $('#results').innerHTML = ''; return; }
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=cs&format=json`);
  const j = await r.json();
  $('#results').innerHTML = (j.results || []).map((p, k) =>
    `<li><button data-k="${k}"><b>${p.name}</b><span>${[p.admin1, p.country].filter(Boolean).join(', ')}</span></button></li>`).join('')
    || '<li><button disabled><span>Nic. Zkus to napsat jinak.</span></button></li>';
  $('#results').querySelectorAll('button[data-k]').forEach((b) => b.onclick = () => {
    const p = j.results[+b.dataset.k];
    setPlace({ lat: p.latitude, lon: p.longitude, name: p.name, sub: p.country || '', auto: false });
    closeSheet('#placeSheet');
  });
}

/* ---------------- Hlavní tok ---------------- */
async function setPlace(place) {
  state.place = place; save({ place });
  $('#placeName').textContent = place.name;
  await refresh();
}
async function refresh() {
  const { lat, lon } = state.place;
  try {
    const [raw, mraw] = await Promise.all([fetchForecast(lat, lon), fetchMinutely(lat, lon).catch(() => null)]);
    save({ cache: { raw, mraw, at: Date.now(), key: `${lat},${lon}` } });
    ingest(raw, mraw);
  } catch (e) {
    const c = load().cache;
    if (c && c.key === `${lat},${lon}`) { ingest(c.raw, c.mraw); toast('Jsi offline. Ukazuju poslední známou předpověď.'); }
    else toast('Nepovedlo se stáhnout počasí. Zkus to za chvíli.');
  }
}
function ingest(raw, mraw) {
  state.data = process(raw);
  state.minutely = mraw?.minutely_15
    ? mraw.minutely_15.time.map((t, k) => ({ t: parseLocal(t), p: mraw.minutely_15.precipitation[k] ?? 0 }))
      .filter((x) => x.t >= nowLocal() - 15 * 60e3).slice(0, 12)
    : null;
  state.lastFetch = Date.now();
  const H = state.data.hourly;
  state.nowF = (nowLocal() - H.t[0]) / HOUR;
  state.i0 = Math.floor(state.nowF);
  state.span = Math.min(36, H.t.length - 1 - state.i0);
  renderStatic();
  buildDial();
  setScrollFor(state.nowF, false);
  renderAt(state.nowF);
  updateMascot(state.nowF, true);
  if (!document.body.classList.contains('ready')) requestAnimationFrame(() => document.body.classList.add('ready'));
}

function wire() {
  document.querySelectorAll('.reveal').forEach((el, i) => el.style.setProperty('--i', i));
  $('#scroller').addEventListener('scroll', onScroll, { passive: true });
  $('#scroller').addEventListener('pointerdown', stopPlay);
  $('#scroller').addEventListener('touchstart', stopPlay, { passive: true });
  $('#playBtn').onclick = togglePlay;
  $('#nowBtn').onclick = () => { stopPlay(); setScrollFor(state.nowF, true); };
  $('#placeBtn').onclick = () => { openSheet('#placeSheet'); setTimeout(() => $('#searchInput').focus(), 300); };
  $('#searchInput').oninput = (e) => { clearTimeout(searchT); searchT = setTimeout(() => search(e.target.value).catch(() => {}), 280); };
  $('#geoBtn').onclick = async () => {
    $('#geoBtn').textContent = '◎ Hledám…';
    const p = await useMyLocation(false);
    $('#geoBtn').textContent = '◎ Tam, kde jsem (podle polohy)';
    if (p) { closeSheet('#placeSheet'); setPlace(p); }
  };
  $('#radarBtn').onclick = openRadar;
  $('#radarCard').onclick = openRadar;
  wireRadar();
  document.querySelectorAll('.sheet').forEach((s) => s.addEventListener('click', (e) => { if (e.target === s) closeSheet('#' + s.id); }));
  // tap na sloupec deště → skoč na ten čas
  $('#rainBars').addEventListener('click', (e) => { const c = e.target.closest('.b'); if (c) setScrollFor(+c.dataset.i, true); });
  $('#wave').addEventListener('click', (e) => { const w = e.target.closest('i'); if (w) setScrollFor(state.i0 + +w.dataset.k / 2, true); });
  $('#moodBest').onclick = () => state.best && setScrollFor(state.best.f, true);
  wireSunDrag();
  // při návratu do appky obnov, pokud jsou data starší než 10 min
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !state.place || Date.now() - (state.lastFetch || 0) < 10 * 60e3) return;
    if (state.place.auto) useMyLocation(true).then((p) => (p ? setPlace(p) : refresh())); else refresh();
  });
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (state.data) { buildDial(); setScrollFor(state.sel || state.nowF, false); } }, 150); });
}

let mraq = null;
async function boot() {
  mraq = createMraq();
  wire();
  await loadLines();
  const saved = load();
  // 1) okamžitě ukaž poslední data z cache
  if (saved.place && saved.cache) { state.place = saved.place; try { ingest(saved.cache.raw, saved.cache.mraw); } catch {} }
  // 2) poloha se zjišťuje vždycky znova (ručně vybrané město platí jen do zavření appky)
  const p = await useMyLocation(true);
  state.place = p || saved.place || DEFAULT_PLACE;
  save({ place: state.place });
  await refresh();
}

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
boot();
