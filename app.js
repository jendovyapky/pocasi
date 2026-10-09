/* Mraq — počasí pro líné. Logika bez frameworku a bez buildu (maskot je v mraq.js). */
import { createMraq, loadLines, LINES, T } from './mraq.js';

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
  golden: ['#f9c4a8', '#ffb86b', '#ff8a3d', '#ffd27a'],
  dusk:   ['#7f8de0', '#f6a38a', '#ff8a3d', '#ffc06b'],
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
  const code = codeAt(f);
  const night = lum(p[1]) < 0.3;
  const grey = night ? '#2a2d3d' : '#a7adb8';
  p = p.map((c) => mix(c, grey, cloud * 0.55));
  const k = kind(code);
  // každé počasí má vlastní charakter: déšť tmavší a chladný, bouřka skoro olověná, sníh světlý, mlha mléčná
  if (k === 'storm') p = p.map((c, i) => mix(c, night ? '#141a2a' : '#4a5470', i === 3 ? .5 : .62));
  else if (k === 'rain' || rain > 0.1) p = p.map((c) => mix(c, night ? '#1b2233' : '#5f6d86', clamp(0.35 + rain * 0.15, 0, 0.62)));
  if (k === 'snow') p = p.map((c, i) => mix(c, night ? '#3a4157' : i === 3 ? '#ffffff' : i === 0 ? '#c9d6e8' : '#eef3f9', .66));
  if (k === 'fog') p = p.map((c) => mix(c, night ? '#3b3f4c' : '#d3d6dc', .6));
  // vzhled: tmavý = barvy denní doby zůstanou, jen ztlumené do noční modré; světlý = noc se zesvětlí
  const theme = themeNow();
  if (theme === 'dark') p = p.map((c, i) => mix(c, i === 3 ? '#2a2840' : '#101117', i === 3 ? .4 : .66));
  else if (theme === 'light' && night) p = p.map((c, i) => mix(c, i === 3 ? '#ffd9a8' : '#dcdff3', .62));

  const root = document.documentElement.style;
  root.setProperty('--c1', p[0]); root.setProperty('--c2', p[1]);
  root.setProperty('--c3', p[2]); root.setProperty('--glow', p[3]);

  const { t } = sunPhase(ms);
  root.setProperty('--sx', `${clamp(10 + t * 80, -10, 110)}%`);
  root.setProperty('--sy', `${t > 0 && t < 1 ? 38 - Math.sin(Math.PI * t) * 26 : 70}%`);

  const dark = theme === 'dark' || (theme !== 'light' && (lum(p[0]) + lum(p[1])) / 2 < 0.42);
  document.body.classList.toggle('dark', dark);
  const sky = $('#sky');
  sky.classList.toggle('rain', rain > 0.2 || k === 'rain' || k === 'storm');
  sky.classList.toggle('heavy', rain > 1.5 || k === 'storm' || code === 65 || code === 82);
  sky.classList.toggle('storm', k === 'storm');
  sky.classList.toggle('snow', k === 'snow');
  sky.classList.toggle('fog', k === 'fog');
  sky.classList.toggle('cloudy', cloud > .55 && k !== 'fog');
  document.querySelector('meta[name=theme-color]').content = p[0];
}

/* ---------------- Data ---------------- */
async function fetchForecast(lat, lon) {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: 'auto',
    past_days: 1, forecast_days: 8, wind_speed_unit: 'kmh',
    current: 'temperature_2m,apparent_temperature,weather_code,cloud_cover,wind_speed_10m,precipitation,is_day,relative_humidity_2m,visibility',
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,uv_index,is_day,relative_humidity_2m,visibility',
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
// Model občas dá kód „slabý déšť“, i když mu vychází 0 mm → pak je to jen zataženo.
// Déšť ukazujeme jen když opravdu něco padá (ať Mraq netvrdí, že prší, když neprší).
// Mlha jen když je opravdu špatně vidět (pod 1,5 km); jinak je to jen zataženo.
const fogCode = (code, vis) => ((code === 45 || code === 48) && vis != null && vis > 1500 ? 3 : code);
function dryCode(code, mm, prob = 0) {
  const wet = (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
  const snow = (code >= 71 && code <= 77) || code === 85 || code === 86;
  if ((wet || snow) && mm < 0.1) return 3;
  if (code >= 95 && mm < 0.1 && prob < 30) return 3;
  return code;
}
function process(raw) {
  const h = raw.hourly, d = raw.daily;
  const precip = h.precipitation.map((v) => v ?? 0), prob = h.precipitation_probability.map((v) => v ?? 0);
  return {
    offset: raw.utc_offset_seconds * 1000,
    current: raw.current,
    hourly: {
      t: h.time.map(parseLocal), temp: h.temperature_2m, feels: h.apparent_temperature,
      prob, precip,
      code: h.weather_code.map((c, i) => fogCode(dryCode(c, Math.max(precip[i], precip[i + 1] ?? 0), prob[i]), h.visibility?.[i])), cloud: h.cloud_cover, wind: h.wind_speed_10m, gust: h.wind_gusts_10m,
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
// kód počasí pro čas f: pro „teď“ bereme aktuální stav (už očištěný o falešný déšť)
function codeAt(f) {
  const H = state.data.hourly, c = state.data.current;
  if (c && Math.abs(f - (state.nowF ?? -99)) < 0.5) return c.weather_code;
  return H.code[Math.round(clamp(f, 0, H.code.length - 1))];
}

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
// Ptát se na polohu jen jednou: když už ji prohlížeč povolil, zjistí se potichu;
// když ještě ne, zeptá se jen při úplně prvním spuštění nebo po ťuknutí na „Tam, kde jsem“.
async function geoPermission() {
  try { return (await navigator.permissions.query({ name: 'geolocation' })).state; } catch { return 'unknown'; }
}
async function autoLocate() {
  const perm = await geoPermission();
  if (perm === 'denied') return null;
  if (perm !== 'granted' && load().geoAsked) return null; // už jsme se jednou ptali → neotravovat
  save({ geoAsked: true });
  return useMyLocation(true);
}
async function useMyLocation(silent) {
  try {
    const { lat, lon } = await geolocate();
    const nm = await reverseName(lat, lon);
    return { lat, lon, ...nm, auto: true };
  } catch {
    if (!silent) toast(T('hlaska.poloha-zakazana', {}, 'Polohu jsi nepovolil. Tak aspoň Praha.'));
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
  const S = (k, d, v) => T('srovnani.' + k, v, d);
  if (a < 1.5) return { big: S('stejne', 'zhruba stejně'), end: S('stejne-konec', 'jako včera') };
  const dir = delta > 0 ? S('tepleji', 'tepleji') : S('chladneji', 'chladněji');
  if (a < 4) return { big: S('trochu', 'trochu {smer}', { smer: dir }), end: S('konec', 'než včera') };
  if (a < 8) return { big: S('dost', 'o dost {smer}', { smer: dir }), end: S('konec', 'než včera') };
  return { big: delta > 0 ? S('extrem-tepleji', 'úplně jiné léto') : S('extrem-chladneji', 'úplně jiná zima'), end: S('extrem-konec', '(o {stupne}° {smer} než včera)', { stupne: Math.round(a), smer: dir }) };
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
function wearPacked() { const w = load().wear; return w && w.day === dayKey(nowLocal()) ? w.items : []; }
function toggleWear(btn) {
  const item = btn.textContent, items = wearPacked().slice(), k = items.indexOf(item);
  if (k >= 0) items.splice(k, 1); else items.push(item);
  save({ wear: { day: dayKey(nowLocal()), items } });
  btn.classList.toggle('done', k < 0); btn.setAttribute('aria-pressed', k < 0);
  navigator.vibrate?.(k < 0 ? [6, 40, 6] : 4);
}
function wearList(s) {
  const f = (s.maxFeels + s.minFeels) / 2;
  const w = [];
  // každá položka v hlasky.txt může mít víc věcí oddělených „ | “
  const add = (k, d) => w.push(...T('obleceni.' + k, {}, d).split('|').map((x) => x.trim()).filter(Boolean));
  if (f >= 25) add('25', 'triko | kraťasy');
  else if (f >= 20) add(s.minFeels < 15 ? '20-vecer' : '20', s.minFeels < 15 ? 'triko | něco přes na večer' : 'triko | lehké kalhoty');
  else if (f >= 15) add('15', 'lehká mikina');
  else if (f >= 10) add('10', 'mikina | lehká bunda');
  else if (f >= 4) add('4', 'bunda | něco pod ni');
  else if (f >= -2) add('-2', 'zimní bunda | čepice');
  else add('mraz', 'termoprádlo | zimní bunda | čepice | rukavice');
  if (s.storm || s.maxProb >= 55 || s.sumRain >= 1) add('destnik', 'deštník ☂');
  else if (s.maxProb >= 30) add('destnik-asi', 'deštník do batohu, pro jistotu');
  if (s.snow) add('snih', 'boty, co nepromoknou');
  if (s.maxUv >= 6) add('uv-silne', 'brýle + krém');
  else if (s.maxUv >= 4 && !s.cloudy) add('uv', 'sluneční brýle');
  if (s.maxWind > 38) add('vitr', 'nic, co uletí');
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
  // „Vem si:“ – věci jde odškrtnout (pamatuje si to do konce dne)
  const packed = wearPacked();
  $('#wear').innerHTML = `<span style="--d:0">${T('obleceni.nadpis', {}, 'Vem si:')}</span>` + wearList(sum).map((w, i) =>
    `<button class="wear__item${packed.includes(w) ? ' done' : ''}" style="--d:${i + 1}" aria-pressed="${packed.includes(w)}">${w}</button>`).join('');

  // pohoda – vlnka na 24 h (po půl hodinách) + kdy je nejlíp
  const moods = [...Array(48).keys()].map((k) => mood(state.i0 + k / 2));
  const best = moods.reduce((bi, m, k) => (m > moods[bi] ? k : bi), 0);
  $('#wave').innerHTML = moods.map((m, k) => `<i data-k="${k}" class="${k === best ? 'best' : ''}" style="height:${6 + m * 0.5}px"></i>`).join('');
  $('#waveMid').textContent = hhmm(H.t[state.i0 + 12]);
  state.best = { k: best, f: state.i0 + best / 2, m: moods[best] };
  const bestMs = H.t[state.i0] + best * HOUR / 2;
  $('#moodBest').textContent = best <= 1 ? T('pohoda.nejlip-ted', {}, 'nejlíp je teď')
    : T('pohoda.nejlip', { cas: `${dayKey(bestMs) !== dayKey(now) ? T('slovo.zitra', {}, 'zítra') + ' ' : ''}${hhmm(bestMs)}` }, 'nejlíp {cas}');

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
    [feels < 21 ? (feels < 10 ? 'zima' : 'chladek') : (feels > 27 ? 'vedro' : 'teplo')]: Math.abs(feels - 21) * 3.2,
    'dest': prob * 0.35 + rain * 12,
    'vitr': Math.max(0, wind - 15) * 0.9,
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
  const CO = { zima: 'zima', chladek: 'chládek', teplo: 'teplo', vedro: 'vedro', dest: 'déšť', vitr: 'vítr', mraky: 'mraky', tma: 'tma' };
  return v < 9 ? T('pohoda.nic', {}, 'nic to nekazí') : T('pohoda.kazi', { co: T('pohoda.co.' + k, {}, CO[k]) }, 'kazí to {co}');
}
const moodLabel = (m) => { const l = LINES['pohoda-popisky'] || []; return l[m >= 85 ? 0 : m >= 70 ? 1 : m >= 50 ? 2 : m >= 30 ? 3 : 4] || ''; };
const fmtMm = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');

/* ---------------- Mraq: nálada podle počasí ---------------- */
function mascotMood(f) {
  const H = state.data.hourly;
  const i = Math.round(clamp(f, 0, H.t.length - 1));
  const ms = at(H.t, f);
  const code = codeAt(f), k = kind(code);
  const feels = at(H.feels, f), wind = at(H.wind, f), gust = at(H.gust, f) || 0, rain = at(H.precip, f), cloud = at(H.cloud, f);
  const { t, rise, set } = sunPhase(ms);
  if (k === 'storm') return 'strach';
  const hm = new Date(ms).getUTCHours() + new Date(ms).getUTCMinutes() / 60;
  if (hm >= 22 || hm < 9) return 'spi'; // spí od 22 do 9
  if (k === 'snow') return 'snih';
  if (k === 'rain' && (code >= 61 || rain >= 0.3)) return 'smutek';
  if (k === 'rain') return 'znechuceni';
  if (wind >= 32 || gust >= 55) return 'nervy';
  if (feels >= 29) return 'vztek';
  if (feels <= 4) return 'zima';
  if (hm < 10.5) return 'ospaly'; // po probuzení je do půl jedenácté ospalej
  const same = state.delta != null && Math.abs(state.delta) < 1.5;
  if (same && cloud >= 60) return 'stejne';
  if (k === 'fog' || cloud >= 85) return 'nuda';
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
function weatherFx(f) { // animace kolem Mraqa podle počasí
  const H = state.data.hourly;
  const i = Math.round(clamp(f, 0, H.t.length - 1));
  const code = codeAt(f), k = kind(code), rain = at(H.precip, f);
  const { t } = sunPhase(at(H.t, f));
  const night = t < 0 || t > 1;
  const fx = [];
  if (k === 'storm') fx.push('storm');
  else if (k === 'snow') fx.push('snow');
  else if (k === 'rain') fx.push(code >= 61 || rain >= 0.3 ? 'rain' : 'drizzle');
  else if (k === 'fog') fx.push('fog');
  else if (night) fx.push('moon');
  else if (k === 'clear') fx.push('sun');
  else if (k === 'part') fx.push('sun', 'small');
  if (at(H.wind, f) >= 32 || (at(H.gust, f) || 0) >= 55) fx.push('wind');
  return fx.join(' ');
}
let mascotT = 0;
function updateMascot(f, first) {
  if (!mraq) return;
  mraq.setFx(weatherFx(f));
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
      return stop > 0 ? T('dest.prsi-prestane', { cas: hhmm(m[stop].t) }, 'Prší. Podle modelu přestane kolem {cas}.') : T('dest.prsi-neprestane', {}, 'Prší a jen tak nepřestane.');
    }
    if (first > 0) return T('dest.zacne', { cas: hhmm(m[first].t) }, 'Pozor, kolem {cas} začne pršet.');
  }
  if (nowWet) { const stop = r.find((i) => H.precip[i] < 0.1); return stop ? T('dest.prsi-konec', { cas: hhmm(H.t[stop]) }, 'Prší. Konec v plánu kolem {cas}.') : T('dest.prsi-celyden', {}, 'Prší a celý den to vypadá stejně.'); }
  const start = r.find((i) => H.precip[i] >= 0.2 || H.prob[i] >= 60);
  if (start == null) return T('dest.sucho24', {}, 'Dalších 24 hodin sucho. Deštník může zůstat doma.');
  return T('dest.sucho-do', { cas: hhmm(H.t[start]) }, 'Do {cas} sucho, pak to začne kapat.');
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

  // chip
  const d = new Date(ms), nowD = new Date(nowLocal());
  const dd = Math.round((Date.parse(dayKey(ms)) - Date.parse(dayKey(nowLocal()))) / 864e5);
  const dayLbl = dd === 0 ? '' : dd === 1 ? 'zítra ' : `${DNY[d.getUTCDay()]} `;
  $('#chip').textContent = isNow ? 'teď' : `${dayLbl}${d.getUTCHours()}:${pad2(Math.floor(d.getUTCMinutes() / 15) * 15)}`;

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
  $('#rainMm').textContent = mmNow >= 0.1 ? T('dest.karta-mm', { mm: fmtMm(mmNow) }, 'naprší ~{mm} mm/h') : T('dest.karta-sucho', {}, 'nic nenaprší');
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

/* ---------------- Tahání sluníčka = posun času ----------------
   Funguje jako kolečko: táhneš doprava → čas jde dopředu, doleva → dozadu. Celá šířka grafu = jeden den
   (levý ocásek = noc před východem, oblouk = den, pravý ocásek = noc po západu). Za pravým koncem
   plynule navazuje další den, takže jde táhnout přes půlnoc a dál do zítřka. */
const SUN_W = 340, SUN_L = 50, SUN_R = 290;
function sunDayFrame(di) {
  const D = state.data.daily;
  const rise = D.sunrise[di], set = D.sunset[di];
  if (rise == null || set == null) return null;
  const prevSet = D.sunset[di - 1] ?? set - 24 * HOUR, nextRise = D.sunrise[di + 1] ?? rise + 24 * HOUR;
  return { rise, set, m0: (prevSet + rise) / 2, m1: (set + nextRise) / 2 };
}
function sunXToMs(X, di0) {
  const k = Math.floor(X / SUN_W), x = X - k * SUN_W, F = sunDayFrame(di0 + k);
  if (!F) return null;
  if (x < SUN_L) return F.m0 + (x / SUN_L) * (F.rise - F.m0);
  if (x < SUN_R) return F.rise + ((x - SUN_L) / (SUN_R - SUN_L)) * (F.set - F.rise);
  return F.set + ((x - SUN_R) / (SUN_W - SUN_R)) * (F.m1 - F.set);
}
function sunMsToX(ms, di0) {
  for (let k = -1; k <= 3; k++) {
    const F = sunDayFrame(di0 + k); if (!F || ms < F.m0 || ms >= F.m1) continue;
    const x = ms < F.rise ? ((ms - F.m0) / (F.rise - F.m0)) * SUN_L
      : ms < F.set ? SUN_L + ((ms - F.rise) / (F.set - F.rise)) * (SUN_R - SUN_L)
        : SUN_R + ((ms - F.set) / (F.m1 - F.set)) * (SUN_W - SUN_R);
    return k * SUN_W + x;
  }
  return 0;
}
function wireSunDrag() {
  // táhnout jde za sluníčko i kdekoli jinde na grafu (vodorovně); svislý pohyb dál scrolluje stránku
  const svg = $('#sunSvg');
  let drag = null;
  const svgX = (e) => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()).x; };
  svg.addEventListener('pointerdown', (e) => {
    if (!state.data) return;
    const H = state.data.hourly;
    const di0 = sunPhase(nowLocal()).di;
    drag = { di0, x0: svgX(e), cx: e.clientX, cy: e.clientY, X0: sunMsToX(at(H.t, state.sel ?? state.nowF), di0), on: false, id: e.pointerId };
    if (e.target.closest('#sunDot')) { drag.on = true; svg.setPointerCapture(e.pointerId); stopPlay(); document.body.classList.add('sundrag'); navigator.vibrate?.(6); }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = svgX(e) - drag.x0;
    if (!drag.on) {
      const mx = Math.abs(e.clientX - drag.cx), my = Math.abs(e.clientY - drag.cy);
      if (my > 8 && my > mx) { drag = null; return; } // svislý pohyb → nech scrollovat
      if (mx < 6) return;
      drag.on = true; svg.setPointerCapture(drag.id); stopPlay(); document.body.classList.add('sundrag');
    } else if (Math.abs(dx) < 3) return;
    const H = state.data.hourly;
    const lo = nowLocal(), hi = H.t[Math.min(H.t.length - 1, state.i0 + state.span)];
    let ms = sunXToMs(drag.X0 + dx, drag.di0);
    if (ms == null) return;
    if (ms < lo || ms > hi) { // na konci osy se zastav a „nenavíjej“ dál, ať jde hned zpátky
      ms = clamp(ms, lo, hi);
      drag.X0 = sunMsToX(ms, drag.di0) - dx;
    }
    setScrollFor((ms - H.t[0]) / HOUR, false);
  });
  const end = () => { drag = null; document.body.classList.remove('sundrag'); };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
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
  const dur = (endX - from) / W * 450 + 400; // ~0,45 s na hodinu, ať se dá sledovat
  const t0 = performance.now();
  $('#playIco').innerHTML = '<path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" stroke="none"/>';
  const step = (now) => {
    const k = clamp((now - t0) / dur, 0, 1);
    const e = k < .06 ? k * k / .12 : k > .94 ? 1 - (1 - k) * (1 - k) / .12 : k; // skoro rovnoměrně, jen jemný rozjezd a dojezd
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
const R = { map: null, marker: null, layers: [], frames: [], host: '', sel: 0, t0: 0, t1: 0, play: 0, shown: -1, loadedAt: 0, motion: null, shiftMs: 0, model: [], modelAt: 0, modelKey: '' };
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
const intensity = (mm15) => { const h = mm15 * 4; return h < 0.1 ? T('radar.sucho', {}, 'sucho') : h < 1 ? T('radar.slaby', {}, 'slabý déšť') : h < 4 ? T('radar.dest', {}, 'déšť') : h < 10 ? T('radar.silny', {}, 'silný déšť') : T('radar.lijak', {}, 'liják'); };

/* Načítání radaru: Mraq se plní zespodu (poslední snímek radaru + předpověď modelu) */
const RL = { json: false, frame: false, model: false, shown: false, timer: 0 };
function radarLoadStart() {
  const fresh = R.frames.length && Date.now() - R.loadedAt < 4 * 60e3 && R.model.length && Date.now() - R.modelAt < 10 * 60e3;
  Object.assign(RL, { json: false, frame: false, model: false, shown: !fresh });
  $('#radarLoad').classList.toggle('on', !fresh);
  clearTimeout(RL.timer); RL.timer = setTimeout(radarLoadDone, 9000); // ať to nevisí věčně
  radarLoadTick();
}
function radarLoadTick() {
  if (!RL.shown) return;
  const p = (RL.json ? .2 : .05) + (RL.frame ? .45 : 0) + (RL.model ? .35 : 0);
  $('#rlFill').setAttribute('y', 422 - 304 * p); $('#rlFill').setAttribute('height', 304 * p);
  $('#rlPct').textContent = `${Math.round(p * 100)} %`;
  if (RL.json && RL.frame && RL.model) setTimeout(radarLoadDone, 250);
}
function radarLoadDone() { RL.shown = false; clearTimeout(RL.timer); $('#radarLoad').classList.remove('on'); }
async function openRadar() {
  radarLoadStart();
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
      R.map = L.map('map', { zoomControl: false, attributionControl: false, maxZoom: 10, minZoom: 3, zoomSnap: 0.5 });
      R.map.createPane('labels'); R.map.getPane('labels').style.zIndex = 450; R.map.getPane('labels').style.pointerEvents = 'none';
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri · <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">Weather data by RainViewer</a>', maxZoom: 10,
      }).addTo(R.map);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 10, pane: 'labels', opacity: 0.85,
      }).addTo(R.map);
      R.map.on('zoom zoomend', applyShift);
      R.marker = L.marker([0, 0], { icon: L.divIcon({ className: 'me', html: '<i></i><b></b>', iconSize: [22, 22] }), interactive: false, zIndexOffset: 1000 }).addTo(R.map);
    }
    R.map.setView([state.place.lat, state.place.lon], 7, { animate: false });
    R.marker.setLatLng([state.place.lat, state.place.lon]);
    setTimeout(() => R.map.invalidateSize(), 60);

    if (R.frames.length && Date.now() - R.loadedAt <= 4 * 60e3) { RL.json = true; RL.frame = !!R.ready?.[R.frames.length - 1]; radarLoadTick(); }
    if (Date.now() - R.loadedAt > 4 * 60e3 || !R.frames.length) {
      const j = await (await fetch('https://api.rainviewer.com/public/weather-maps.json')).json();
      R.layers.forEach((l) => R.map.removeLayer(l));
      // nowcast RainViewer od 2026 nedává, ale kdyby se vrátil, použije se
      R.host = j.host; R.frames = [...(j.radar.past || []), ...(j.radar.nowcast || [])]; RL.json = true; radarLoadTick();
      R.loadedAt = Date.now(); R.shown = -1; R.ready = [];
      // poslední snímek se v budoucnu posouvá → načíst dlaždice i kus mimo obrazovku, ať nezůstane ostrý okraj
      const Padded = L.TileLayer.extend({ _getTiledPixelBounds(c) {
        const b = L.TileLayer.prototype._getTiledPixelBounds.call(this, c), s = b.getSize();
        return L.bounds(b.min.subtract(s), b.max.add(s));
      } });
      // nejdřív jen nejnovější snímek (rychle něco vidět), starší se dotahují postupně na pozadí
      R.layers = R.frames.map((fr, k) => new (k === R.frames.length - 1 ? Padded : L.TileLayer)(`${R.host}${fr.path}/256/{z}/{x}/{y}/2/1_1.png`, {
        opacity: 0, maxNativeZoom: 7, maxZoom: 10, tileSize: 256, zIndex: 5, className: 'rv',
      }).on('load', () => { R.ready[k] = true; if (k === R.frames.length - 1) { RL.frame = true; radarLoadTick(); } setRadarTime(R.sel); preloadNext(); }));
      if (R.layers.length) R.layers[R.layers.length - 1].addTo(R.map);
      if (R.frames.length) R.t0 = Math.min(R.t0, R.frames[0].time * 1000);
      buildTimeline();
      estimateMotion();
    }
    loadModelGrid();
    setRadarTime(Date.now(), true); // otevře se na „teď“ a stojí; přehrát si to pustíš sám
  } catch {
    $('#radarRel').textContent = 'mapa se nenačetla – jsi online?';
  }
}

/* Vlastní „nowcast“: z posledních radarových snímků odhadne, kam a jak rychle se srážky posouvají
   (porovnání dvou snímků po 30 min, hledá posun s nejmenším rozdílem), a v budoucnu posouvá poslední snímek. */
const MZ = 6, CELL = 4; // zoom pro odhad, velikost buňky v px
function tileXY(lat, lon, z) {
  const n = 2 ** z, x = (lon + 180) / 360 * n;
  const r = lat * Math.PI / 180, y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
  return [x, y];
}
function loadImg(src) {
  return new Promise((res) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}
async function radarGrid(fr, tx, ty) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 768;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const imgs = await Promise.all([-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => loadImg(`${R.host}${fr.path}/256/${MZ}/${tx + dx}/${ty + dy}/2/1_1.png`).then((im) => [im, dx, dy]))));
  if (imgs.every(([im]) => !im)) return null;
  for (const [im, dx, dy] of imgs) if (im) g.drawImage(im, (dx + 1) * 256, (dy + 1) * 256);
  const d = g.getImageData(0, 0, 768, 768).data, N = 768 / CELL, out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0;
    for (let yy = 0; yy < CELL; yy++) for (let xx = 0; xx < CELL; xx++) s += d[((y * CELL + yy) * 768 + x * CELL + xx) * 4 + 3];
    out[y * N + x] = s / (CELL * CELL * 255);
  }
  return out;
}
async function estimateMotion() {
  R.motion = null;
  if (R.frames.length < 4) return;
  const a = R.frames[R.frames.length - 4], b = R.frames[R.frames.length - 1];
  const [fx, fy] = tileXY(state.place.lat, state.place.lon, MZ);
  const tx = Math.floor(fx), ty = Math.floor(fy);
  try {
    const [A, B] = await Promise.all([radarGrid(a, tx, ty), radarGrid(b, tx, ty)]);
    if (!A || !B) return;
    const N = 768 / CELL, M = 14; let best = null, base = 0, wet = 0;
    for (let i = 0; i < N * N; i++) if (A[i] > 0.05 || B[i] > 0.05) wet++;
    if (wet < 40) return; // skoro nic neprší → není co posouvat
    for (let sy = -M; sy <= M; sy++) for (let sx = -M; sx <= M; sx++) {
      let err = 0, n = 0;
      for (let y = M; y < N - M; y += 2) for (let x = M; x < N - M; x += 2) {
        const va = A[y * N + x], vb = B[(y + sy) * N + (x + sx)];
        if (va < 0.05 && vb < 0.05) continue;
        err += Math.abs(va - vb); n++;
      }
      if (n < 20) continue;
      const e = err / n + 0.002 * Math.hypot(sx, sy); // mírně preferuj menší posun
      if (sx === 0 && sy === 0) base = e;
      if (!best || e < best.e) best = { e, sx, sy };
    }
    if (!best) return;
    const dtMin = (b.time - a.time) / 60;
    // px na minutu v zoomu MZ
    R.motion = { vx: best.sx * CELL / dtMin, vy: best.sy * CELL / dtMin, conf: base ? clamp(1 - best.e / base, 0, 1) : 0 };
    setRadarTime(R.sel, true);
  } catch {}
}
function applyShift() {
  const last = R.layers[R.layers.length - 1];
  const el = last?.getContainer?.(); if (!el) return;
  if (!R.motion || !R.shiftMs || !R.map) { el.style.transform = ''; return; }
  const k = 2 ** (R.map.getZoom() - MZ), m = R.shiftMs / 60e3;
  el.style.transform = `translate(${(R.motion.vx * m * k).toFixed(1)}px, ${(R.motion.vy * m * k).toFixed(1)}px)`;
}
const speedKmh = () => { // přibližná rychlost v km/h
  if (!R.motion) return 0;
  const mPerPx = 156543 * Math.cos(state.place.lat * Math.PI / 180) / 2 ** MZ;
  return Math.round(Math.hypot(R.motion.vx, R.motion.vy) * mPerPx * 60 / 1000);
};
const dirName = () => { // odkud kam to jde (světové strany)
  if (!R.motion) return '';
  const ang = (Math.atan2(R.motion.vx, -R.motion.vy) * 180 / Math.PI + 360) % 360;
  return ['na sever', 'na severovýchod', 'na východ', 'na jihovýchod', 'na jih', 'na jihozápad', 'na západ', 'na severozápad'][Math.round(ang / 45) % 8];
};

function preloadNext() { // přidá na mapu další (starší) snímek, který ještě není načtený
  if (!R.map) return;
  for (let k = R.layers.length - 1; k >= 0; k--) {
    const l = R.layers[k];
    if (!R.map.hasLayer(l)) { l.addTo(R.map); return; }
    if (!R.ready[k]) return; // počkej, až se dotáhne ten předchozí
  }
}
/* ---------------- Předpověď srážek na mapě (model ICON přes Open-Meteo) ----------------
   RainViewer budoucnost nedává, tak si ji poskládáme sami: mřížka 11×13 bodů kolem místa,
   pro každý bod srážky po 15 min na 3 h dopředu (jeden request), z toho barevná vrstva na mapu. */
const RAIN_STOPS = [[0.1, [150, 225, 240, .45]], [0.5, [98, 184, 232, .6]], [1, [43, 143, 216, .7]], [2.5, [15, 99, 196, .78]], [5, [255, 216, 74, .82]], [10, [255, 140, 26, .85]], [20, [240, 48, 60, .88]], [40, [214, 31, 214, .9]]];
function rainColor(mmh) {
  if (mmh < 0.1) return null;
  for (let k = RAIN_STOPS.length - 1; k >= 0; k--) {
    if (mmh >= RAIN_STOPS[k][0]) {
      const [v0, c0] = RAIN_STOPS[k], [v1, c1] = RAIN_STOPS[k + 1] || RAIN_STOPS[k];
      const t = v1 > v0 ? clamp((mmh - v0) / (v1 - v0), 0, 1) : 0;
      return c0.map((c, i) => lerp(c, c1[i], t));
    }
  }
  return null;
}
async function loadModelGrid() {
  const L = window.L; if (!L || !R.map) return;
  const key = `${state.place.lat.toFixed(2)},${state.place.lon.toFixed(2)}`;
  if (R.model.length && R.modelKey === key && Date.now() - R.modelAt < 10 * 60e3) { RL.model = true; radarLoadTick(); return; }
  const NX = 11, NY = 13, dLon = 0.5, dLat = 0.42;
  const lats = [], lons = [];
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    lats.push((state.place.lat + (j - (NY - 1) / 2) * dLat).toFixed(2));
    lons.push((state.place.lon + (i - (NX - 1) / 2) * dLon).toFixed(2));
  }
  try {
    const q = `latitude=${lats.join(',')}&longitude=${lons.join(',')}&minutely_15=precipitation&forecast_minutely_15=14&past_minutely_15=1&timezone=GMT`;
    const j = await (await fetch(`https://api.open-meteo.com/v1/forecast?${q}`)).json();
    const arr = Array.isArray(j) ? j : [j];
    if (arr.length !== NX * NY || !arr[0].minutely_15) { RL.model = true; radarLoadTick(); return; }
    const times = arr[0].minutely_15.time.map((s) => parseLocal(s)); // GMT → přímo epocha
    const small = document.createElement('canvas'); small.width = NX; small.height = NY;
    const sg = small.getContext('2d');
    const big = document.createElement('canvas'); big.width = NX * 28; big.height = NY * 28;
    const bg = big.getContext('2d'); bg.imageSmoothingEnabled = true; bg.imageSmoothingQuality = 'high';
    R.model.forEach((m) => R.map.removeLayer(m.layer));
    const south = state.place.lat - ((NY - 1) / 2 + .5) * dLat, north = state.place.lat + ((NY - 1) / 2 + .5) * dLat;
    const west = state.place.lon - ((NX - 1) / 2 + .5) * dLon, east = state.place.lon + ((NX - 1) / 2 + .5) * dLon;
    R.model = times.map((t, k) => {
      const img = sg.createImageData(NX, NY);
      for (let jj = 0; jj < NY; jj++) for (let ii = 0; ii < NX; ii++) {
        const v = (arr[jj * NX + ii].minutely_15.precipitation[k] ?? 0) * 4; // mm/h
        const c = rainColor(v); const o = ((NY - 1 - jj) * NX + ii) * 4; // sever nahoře
        if (c) { img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = c[3] * 255; }
      }
      sg.putImageData(img, 0, 0);
      bg.clearRect(0, 0, big.width, big.height); bg.drawImage(small, 0, 0, big.width, big.height);
      const layer = L.imageOverlay(big.toDataURL('image/png'), [[south, west], [north, east]], { opacity: 0, className: 'rv-model', interactive: false }).addTo(R.map);
      return { t, layer };
    });
    R.modelAt = Date.now(); R.modelKey = key; RL.model = true; radarLoadTick();
    setRadarTime(R.sel, true);
  } catch { RL.model = true; radarLoadTick(); }
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
  let want = -1;
  for (let k = 0; k < R.frames.length; k++) if (R.frames[k].time * 1000 <= R.sel + 5 * 60e3) want = k;
  // když chtěný snímek ještě není načtený, ukaž nejbližší načtený (ať mapa nezůstane prázdná)
  let idx = want;
  if (want >= 0 && !R.ready?.[want]) {
    idx = R.shown;
    let bestD = Infinity;
    R.frames.forEach((fr, k) => { const d = Math.abs(k - want); if (R.ready?.[k] && d < bestD) { bestD = d; idx = k; } });
  }
  // v budoucnu: poslední snímek posunutý podle odhadnutého pohybu, postupně slábne (čím dál, tím nejistější)
  const ahead = isFuture ? R.sel - lastFrame : 0;
  R.shiftMs = R.motion ? ahead : 0;
  const hasModel = R.model.length > 0;
  // s modelem: posunutý radar během první půlhodiny plynule přejde do předpovědi modelu
  const futOp = hasModel ? clamp(0.8 * (1 - ahead / (40 * 60e3)), 0, 0.8) : R.motion ? clamp(0.8 - (ahead / (3 * HOUR)) * 0.45, 0.3, 0.8) : 0.35;
  if (hasModel) {
    const mFade = isFuture ? clamp(ahead / (25 * 60e3), 0, 1) * 0.85 : 0;
    let k = 0; while (k < R.model.length - 1 && R.model[k + 1].t <= R.sel) k++;
    const a0 = R.model[k], a1 = R.model[k + 1] || a0;
    const w = a1 === a0 ? 0 : clamp((R.sel - a0.t) / (a1.t - a0.t), 0, 1);
    R.model.forEach((m, i) => m.layer.setOpacity(i === k ? mFade * (1 - w) : m === a1 ? mFade * w : 0));
  }
  if (idx !== R.shown || force) {
    R.layers.forEach((l, k) => l.setOpacity(k === idx ? (isFuture ? futOp : 0.8) : 0));
    R.shown = idx;
  } else if (idx >= 0) R.layers[idx]?.setOpacity(isFuture ? futOp : 0.8);
  applyShift();
  $('#radarSheet').classList.toggle('future', isFuture);
  $('#radarBadge').textContent = isFuture || R.sel > now + 5 * 60e3 ? 'předpověď' : 'radar';
  const mins = Math.round((R.sel - now) / 60e3);
  if (isFuture) {
    const fut = future();
    const slot = fut.filter((x) => x.t <= R.sel).pop() || fut[0];
    $('#radarTime').textContent = placeTime(R.sel);
    $('#radarRel').textContent = `za ${mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}`;
    $('#nowcastNote').textContent = slot
      ? `${slot.p >= 0.02 ? T('radar.u-tebe', { co: intensity(slot.p), mm: fmtMm(slot.p) }, 'U tebe {co} · {mm} mm za 15 min.') : T('radar.u-tebe-sucho', {}, 'U tebe sucho.')} ${hasModel
        ? T('radar.model', {}, 'Mapa: předpověď modelu ICON po 15 minutách.')
        : R.motion && speedKmh() >= 3
        ? T('radar.pohyb', { smer: dirName(), rychlost: speedKmh() }, 'Mapa: odhad, srážky se posouvají {smer} asi {rychlost} km/h.')
        : T('radar.stoji', {}, 'Mapa: srážky se teď skoro nehýbou, ukazuje poslední radar.')}`
      : T('radar.bez-dat', {}, 'Předpověď po 15 minutách teď není k dispozici.');
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
  if (!fut.length) return T('radar.bez-predpovedi', {}, 'Modře je, kde pršelo. Posuň osu doprava a uvidíš, co čeká tebe.');
  const total = fut.reduce((a, x) => a + x.p, 0);
  return total < 0.1 ? `${T('radar.sucho3h', {}, 'Další 3 hodiny u tebe nic nespadne.')} ${rainSentence()}` : `${rainSentence()} ${T('radar.celkem', { cas: placeTime(fut[fut.length - 1].t), mm: fmtMm(total) }, 'Do {cas} asi {mm} mm.')}`;
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


/* ---------------- Nastavení + notifikace ---------------- */
const PUSH_API = 'https://mraq-api.jendovyapky.eu';
const DEF_SETTINGS = { theme: 'auto', mraq: true, vibrate: true, lite: false, placeMode: 'auto', fixed: null, notif: { morning: false, time: '07:00', rain: false, extreme: false }, pushKey: '' };
const settings = () => { const s = load().settings || {}; return { ...DEF_SETTINGS, ...s, notif: { ...DEF_SETTINGS.notif, ...(s.notif || {}) } }; };
const saveSettings = (patch) => save({ settings: { ...settings(), ...patch } });
// 'auto' = podle telefonu: tmavý systém → tmavá appka, světlý → obloha podle denní doby (v noci tmavá)
function themeNow() {
  const t = (load().settings || {}).theme || 'auto';
  if (t === 'auto') return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'sky';
  return t;
}
const notifOn = (n = settings().notif) => n.morning || n.rain || n.extreme;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function applySettings() {
  const s = settings();
  document.body.classList.toggle('no-mraq', !s.mraq);
  document.body.classList.toggle('lite', s.lite);
}
function hint(t) { $('#notifHint').textContent = t || ''; }
function notifStatus() {
  const n = settings().notif;
  if (!notifOn(n)) { hint(''); $('#notifTest').hidden = true; return; }
  const parts = [n.morning && `ráno v ${n.time}`, n.rain && 'déšť do hodiny', n.extreme && 'extrémy v 19:00'].filter(Boolean);
  hint(`Zapnuto pro ${state.place?.name || 'tvoje místo'}: ${parts.join(', ')}.`);
  $('#notifTest').hidden = false;
}
function openSettings() {
  const s = settings();
  $('#nMorning').checked = s.notif.morning; $('#nMorningTime').value = s.notif.time;
  $('#nRain').checked = s.notif.rain; $('#nExtreme').checked = s.notif.extreme;
  $('#pmAuto').checked = s.placeMode !== 'fixed'; $('#pmFixed').checked = s.placeMode === 'fixed';
  $('#pmFixedName').textContent = s.placeMode === 'fixed' && s.fixed ? s.fixed.name : `${state.place?.name || '—'} (to, co máš teď otevřené)`;
  document.querySelectorAll('#themeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === s.theme));
  $('#sMraq').checked = s.mraq; $('#sVibrate').checked = s.vibrate; $('#sLite').checked = s.lite;
  $('#setAbout').innerHTML = `Mraq · předpověď Open-Meteo · radar RainViewer<br>Hlášky si píše Honza.`;
  notifStatus();
  openSheet('#settingsSheet');
}
const b64uToBytes = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    hint(isIOS && !standalone()
      ? 'Na iPhonu jdou notifikace jen z plochy: v Safari Sdílet → Přidat na plochu, pak otevři Mraq z plochy a zapni to tady.'
      : 'Tenhle prohlížeč notifikace neumí.');
    return null;
  }
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') { hint('Notifikace máš pro Mraq zakázané. Povol je v nastavení telefonu (Oznámení → Mraq).'); return null; }
  hint('Zapínám…');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { key } = await (await fetch(`${PUSH_API}/vapid`)).json();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) });
  }
  return sub;
}
async function syncPush(sub) {
  try {
    if (!sub) { const reg = await navigator.serviceWorker?.ready; sub = await reg?.pushManager?.getSubscription(); }
    if (!sub || !state.place) return false;
    const r = await fetch(`${PUSH_API}/subscribe`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sub: sub.toJSON(), place: { lat: state.place.lat, lon: state.place.lon, name: state.place.name }, prefs: settings().notif }),
    });
    if (!r.ok) throw new Error(r.status);
    saveSettings({ pushKey: `${state.place.lat.toFixed(2)},${state.place.lon.toFixed(2)}|${JSON.stringify(settings().notif)}` });
    return true;
  } catch { hint('Server s notifikacemi teď neodpovídá. Zkus to za chvíli.'); return false; }
}
async function disablePush() {
  try {
    const reg = await navigator.serviceWorker?.ready; const sub = await reg?.pushManager?.getSubscription();
    if (sub) {
      fetch(`${PUSH_API}/unsubscribe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sub: sub.toJSON() }) }).catch(() => {});
      await sub.unsubscribe();
    }
  } catch {}
}
async function onNotifChange(e) {
  const notif = { morning: $('#nMorning').checked, time: $('#nMorningTime').value || '07:00', rain: $('#nRain').checked, extreme: $('#nExtreme').checked };
  const was = notifOn();
  if (!notifOn(notif)) { saveSettings({ notif }); notifStatus(); if (was) disablePush(); return; }
  const sub = await enablePush();
  if (!sub) { if (e?.target?.type === 'checkbox') e.target.checked = false; return; }
  saveSettings({ notif });
  if (await syncPush(sub)) notifStatus();
}
function maybeSyncPush() { // po načtení počasí: když se změnilo místo, pošli ho serveru
  const s = settings();
  if (!notifOn(s.notif) || !state.place) return;
  const key = `${state.place.lat.toFixed(2)},${state.place.lon.toFixed(2)}|${JSON.stringify(s.notif)}`;
  if (key !== s.pushKey) syncPush();
}
function wireSettings() {
  $('#settingsBtn').onclick = openSettings;
  $('#settingsClose').onclick = () => closeSheet('#settingsSheet');
  for (const id of ['#nMorning', '#nRain', '#nExtreme']) $(id).addEventListener('change', onNotifChange);
  $('#nMorningTime').addEventListener('change', () => { if ($('#nMorning').checked) onNotifChange(); else saveSettings({ notif: { ...settings().notif, time: $('#nMorningTime').value } }); });
  $('#notifTest').onclick = async () => {
    hint('Posílám…');
    try {
      const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription();
      const r = await (await fetch(`${PUSH_API}/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sub: sub.toJSON() }) })).json();
      hint(r.ok ? 'Odesláno. Za pár vteřin by měla cinknout.' : `Nepovedlo se (${r.status || r.error}).`);
    } catch { hint('Nepovedlo se. Jsou notifikace zapnuté?'); }
  };
  $('#themeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    saveSettings({ theme: b.dataset.v });
    document.querySelectorAll('#themeSeg button').forEach((x) => x.classList.toggle('on', x === b));
    if (state.data) applySky(state.sel ?? state.nowF);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => state.data && applySky(state.sel ?? state.nowF));
  $('#sMraq').onchange = (e) => { saveSettings({ mraq: e.target.checked }); applySettings(); };
  $('#sVibrate').onchange = (e) => saveSettings({ vibrate: e.target.checked });
  $('#sLite').onchange = (e) => { saveSettings({ lite: e.target.checked }); applySettings(); };
  $('#pmFixed').onchange = () => { saveSettings({ placeMode: 'fixed', fixed: { ...state.place, auto: false } }); $('#pmFixedName').textContent = state.place.name; };
  $('#pmAuto').onchange = async () => {
    saveSettings({ placeMode: 'auto', fixed: null });
    const p = await useMyLocation(false);
    if (p) setPlace(p);
  };
  // vibrace jdou vypnout
  try { const orig = navigator.vibrate?.bind(navigator); if (orig) navigator.vibrate = (p) => (settings().vibrate ? orig(p) : false); } catch {}
}

/* ---------------- Hlavní tok ---------------- */
async function setPlace(place) {
  state.place = place; save({ place });
  if (settings().placeMode === 'fixed') saveSettings({ fixed: { ...place, auto: false } });
  $('#placeName').textContent = place.name;
  await refresh();
}
async function refresh() {
  const { lat, lon } = state.place;
  try {
    const [raw, mraw] = await Promise.all([fetchForecast(lat, lon), fetchMinutely(lat, lon).catch(() => null)]);
    save({ cache: { raw, mraw, at: Date.now(), key: `${lat},${lon}` } });
    ingest(raw, mraw);
    maybeSyncPush();
  } catch (e) {
    const c = load().cache;
    if (c && c.key === `${lat},${lon}`) { ingest(c.raw, c.mraw); toast(T('hlaska.offline', {}, 'Jsi offline. Ukazuju poslední známou předpověď.')); }
    else toast(T('hlaska.chyba', {}, 'Nepovedlo se stáhnout počasí. Zkus to za chvíli.'));
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
  if (state.data.current) { // je teď opravdu mokro? (aktuální srážky nebo nejbližších 15 min)
    const c = state.data.current, i = Math.floor(state.nowF);
    const nowMm = Math.max(c.precipitation ?? 0, (state.minutely?.[0]?.p ?? 0) * 4, H.precip[i + 1] ?? 0);
    c.weather_code = fogCode(dryCode(c.weather_code, nowMm, H.prob[i] ?? 0), c.visibility);
  }
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
  // iOS Safari ignoruje user-scalable=no → zoom gesty blokujeme ručně (kromě mapy radaru)
  for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => { if (!e.target.closest?.('#map')) e.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 && !e.target.closest?.('#map')) e.preventDefault(); }, { passive: false });
  let lastTap = 0;
  document.addEventListener('touchend', (e) => { const n = Date.now(); if (n - lastTap < 300 && !e.target.closest?.('#map, input, button, .tl, .dial')) e.preventDefault(); lastTap = n; }, { passive: false });
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
  $('#wear').addEventListener('click', (e) => { const b = e.target.closest('.wear__item'); if (b) toggleWear(b); });
  $('#buddy').addEventListener('click', (e) => { if (!e.target.closest('#orb')) mraq?.react(); });
  // při návratu do appky obnov, pokud jsou data starší než 10 min
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !state.place || Date.now() - (state.lastFetch || 0) < 10 * 60e3) return;
    if (state.place.auto) autoLocate().then((p) => (p ? setPlace(p) : refresh())); else refresh();
  });
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (state.data) { buildDial(); setScrollFor(state.sel || state.nowF, false); } }, 150); });
}

let mraq = null;
async function boot() {
  mraq = createMraq();
  window.__mraq = mraq; // pro náhledy výrazů
  applySettings();
  wire();
  wireSettings();
  await loadLines();
  const saved = load();
  // 1) okamžitě ukaž poslední data z cache
  if (saved.place && saved.cache) { state.place = saved.place; try { ingest(saved.cache.raw, saved.cache.mraw); } catch {} }
  // 2) poloha se zjišťuje při každém otevření, ale ptá se jen poprvé (ručně vybrané město platí do zavření appky)
  const st = settings();
  const p = st.placeMode === 'fixed' && st.fixed ? null : await autoLocate();
  state.place = (st.placeMode === 'fixed' && st.fixed) || p || (saved.place && { ...saved.place, auto: true }) || DEFAULT_PLACE;
  save({ place: state.place });
  await refresh();
}

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
boot();
