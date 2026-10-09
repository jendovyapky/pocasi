/* Mraq – notifikace.
   - POST /subscribe   přihlásí telefon (push subscription + místo + nastavení)
   - POST /unsubscribe odhlásí
   - POST /test        pošle hned zkušební notifikaci
   - GET  /vapid       veřejný VAPID klíč (telefon ho potřebuje k přihlášení)
   - cron každých 15 min: ranní shrnutí, déšť za chvíli, extrémy na zítřek
   Web Push je napsaný ručně přes WebCrypto (VAPID + šifrování aes128gcm, RFC 8291/8292),
   žádné knihovny. VAPID klíče si Worker vygeneruje sám při prvním spuštění a uloží do KV. */

const ALLOWED = [/^https:\/\/([a-z0-9-]+\.)?mraq\.jendovyapky\.eu$/, /^https:\/\/([a-z0-9-]+\.)?pocasi\.pages\.dev$/, /^https:\/\/pocasi\.jendovyapky\.eu$/, /^http:\/\/localhost(:\d+)?$/];

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED.some((r) => r.test(origin)) ? origin : 'https://mraq.jendovyapky.eu',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(req.url);
    try {
      if (url.pathname === '/vapid') return json({ key: (await vapidKeys(env)).publicKey });
      if (req.method !== 'POST') return json({ ok: true, app: 'mraq-push' });
      const body = await req.json();
      const sub = body.sub || body;
      if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint)) return json({ error: 'chybí subscription' }, 400);
      const id = await sha(sub.endpoint);
      if (url.pathname === '/subscribe') {
        const old = await getRec(env, id);
        const place = body.place || old?.place;
        if (!place || typeof place.lat !== 'number' || typeof place.lon !== 'number') return json({ error: 'chybí místo' }, 400);
        const rec = {
          sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys?.p256dh, auth: sub.keys?.auth } },
          place: { lat: +place.lat.toFixed(3), lon: +place.lon.toFixed(3), name: String(place.name || '').slice(0, 60) },
          prefs: cleanPrefs(body.prefs || old?.prefs),
          state: old?.state || {},
          updated: Date.now(),
        };
        await env.SUBS.put('sub:' + id, JSON.stringify(rec));
        return json({ ok: true, id });
      }
      if (url.pathname === '/unsubscribe') { await env.SUBS.delete('sub:' + id); return json({ ok: true }); }
      if (url.pathname === '/test') {
        const rec = await getRec(env, id);
        const s = rec?.sub || sub;
        const texts = await loadTexts(env);
        const line = pick(texts.lines.radost || ['Funguju!'], Date.now());
        const r = await sendPush(env, s, { title: 'Mraq · zkouška', body: fill(line, { teplota: '21', misto: rec?.place?.name || '' }) + '\nNotifikace fungujou.', tag: 'test' });
        return json({ ok: r.ok, status: r.status });
      }
      return json({ error: 'neznámá cesta' }, 404);
    } catch (e) {
      return json({ error: String(e?.message || e) }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runChecks(env));
  },
};

/* ---------------- Kontrola počasí pro všechny ---------------- */
async function runChecks(env) {
  const texts = await loadTexts(env);
  let cursor;
  do {
    const list = await env.SUBS.list({ prefix: 'sub:', cursor });
    cursor = list.list_complete ? null : list.cursor;
    for (const k of list.keys) {
      try { await checkOne(env, k.name, texts); } catch (e) { console.log('check failed', k.name, e?.message); }
    }
  } while (cursor);
}

async function checkOne(env, key, texts) {
  const rec = JSON.parse((await env.SUBS.get(key)) || 'null');
  if (!rec) return;
  const p = rec.prefs;
  if (!p.morning && !p.rain && !p.extreme) return;
  const w = await forecast(rec.place);
  const now = Date.now() + w.offset; // „lokální“ čas místa jako UTC ms
  const d = new Date(now);
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  const today = d.toISOString().slice(0, 10);
  const st = rec.state || (rec.state = {});
  const out = [];

  // 1) Ranní shrnutí v nastavený čas
  const [th, tm] = p.time.split(':').map(Number);
  const tMin = th * 60 + tm;
  if (p.morning && st.morning !== today && mins >= tMin && mins < tMin + 30) {
    out.push(morningMsg(w, rec.place, texts));
    st.morning = today;
  }

  // 2) Déšť do hodiny (jen přes den, max jednou za 3 h)
  if (p.rain && mins >= 7 * 60 && mins < 22 * 60 && Date.now() - (st.rain || 0) > 3 * 3600e3) {
    const m = w.minutely;
    const dryNow = m.length && m[0].p < 0.1;
    const k = m.findIndex((x, i) => i > 0 && i <= 4 && x.p >= 0.3);
    if (dryNow && k > 0) {
      const inMin = Math.max(5, Math.round((m[k].t - now) / 60e3));
      out.push({
        title: `Mraq · za ${inMin} min prší`,
        body: T(texts, 'dest.zacne', { cas: hhmm(m[k].t) }, 'Pozor, kolem {cas} začne pršet.') + ` (${intensity(m[k].p, texts)})`,
        tag: 'rain',
      });
      st.rain = Date.now();
    }
  }

  // 3) Extrémy na zítřek – večer v 19:00
  if (p.extreme && st.extreme !== today && mins >= 19 * 60 && mins < 19 * 60 + 30) {
    const msg = extremeMsg(w, texts);
    if (msg) out.push(msg);
    st.extreme = today;
  }

  for (const msg of out) {
    const r = await sendPush(env, rec.sub, msg);
    if (r.status === 404 || r.status === 410) { await env.SUBS.delete(key); return; }
  }
  if (out.length || JSON.stringify(st) !== JSON.stringify(rec.state)) await env.SUBS.put(key, JSON.stringify({ ...rec, state: st }));
}

/* ---------------- Počasí (Open-Meteo) ---------------- */
async function forecast(place) {
  const q = new URLSearchParams({
    latitude: place.lat, longitude: place.lon, timezone: 'auto', forecast_days: 2, wind_speed_unit: 'kmh',
    current: 'temperature_2m,weather_code',
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_gusts_10m,uv_index,cloud_cover',
    daily: 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum',
    minutely_15: 'precipitation', forecast_minutely_15: 8,
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
  if (!r.ok) throw new Error('open-meteo ' + r.status);
  const j = await r.json();
  const pl = (s) => { const [a, b = '00:00'] = s.split('T'); const [y, mo, dd] = a.split('-').map(Number); const [h, mi] = b.split(':').map(Number); return Date.UTC(y, mo - 1, dd, h, mi); };
  const H = j.hourly;
  return {
    offset: j.utc_offset_seconds * 1000,
    current: j.current,
    hourly: H.time.map((t, i) => ({ t: pl(t), temp: H.temperature_2m[i], feels: H.apparent_temperature[i], prob: H.precipitation_probability[i] ?? 0, mm: H.precipitation[i] ?? 0, code: H.weather_code[i], gust: H.wind_gusts_10m[i] ?? 0, uv: H.uv_index[i] ?? 0, cloud: H.cloud_cover[i] ?? 0 })),
    daily: j.daily.time.map((t, i) => ({ day: t, max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i], code: j.daily.weather_code[i], sum: j.daily.precipitation_sum[i] ?? 0 })),
    minutely: (j.minutely_15?.time || []).map((t, i) => ({ t: pl(t), p: j.minutely_15.precipitation[i] ?? 0 })),
  };
}

const WMO = { 0: 'jasno', 1: 'skoro jasno', 2: 'polojasno', 3: 'zataženo', 45: 'mlha', 48: 'mlha', 51: 'mrholení', 53: 'mrholení', 55: 'mrholení', 61: 'slabý déšť', 63: 'déšť', 65: 'silný déšť', 66: 'mrznoucí déšť', 67: 'mrznoucí déšť', 71: 'slabé sněžení', 73: 'sněžení', 75: 'silné sněžení', 77: 'sněžení', 80: 'přeháňky', 81: 'přeháňky', 82: 'prudké přeháňky', 85: 'sněhové přeháňky', 86: 'sněhové přeháňky', 95: 'bouřka', 96: 'bouřka s kroupami', 99: 'bouřka s kroupami' };
const kind = (c) => c >= 95 ? 'storm' : (c >= 71 && c <= 77) || c === 85 || c === 86 ? 'snow' : c >= 51 ? 'rain' : c >= 45 ? 'fog' : c === 3 ? 'cloud' : 'clear';
const hhmm = (ms) => { const d = new Date(ms); return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const fmt = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');

function morningMsg(w, place, texts) {
  const day = w.daily[0];
  const hrs = w.hourly.filter((h) => new Date(h.t).toISOString().slice(0, 10) === day.day && new Date(h.t).getUTCHours() >= 8 && new Date(h.t).getUTCHours() <= 21);
  const feels = hrs.map((h) => h.feels);
  const s = {
    maxFeels: Math.max(...feels), minFeels: Math.min(...feels),
    maxProb: Math.max(...hrs.map((h) => h.prob)), sumRain: hrs.reduce((a, h) => a + h.mm, 0),
    maxUv: Math.max(...hrs.map((h) => h.uv)), maxGust: Math.max(...hrs.map((h) => h.gust)),
    storm: hrs.some((h) => h.code >= 95), snow: hrs.some((h) => kind(h.code) === 'snow'),
    cloudy: hrs.reduce((a, h) => a + h.cloud, 0) / (hrs.length || 1) > 70,
  };
  const mood = s.storm ? 'strach' : s.snow ? 'snih' : s.sumRain >= 1 || s.maxProb >= 60 ? 'smutek' : s.maxGust >= 55 ? 'nervy' : s.maxFeels >= 29 ? 'vztek' : s.maxFeels <= 4 ? 'zima' : s.cloudy ? 'nuda' : s.maxFeels >= 14 ? 'radost' : 'pohoda';
  const vars = { teplota: Math.round(w.current?.temperature_2m ?? day.min), pocitove: Math.round(s.maxFeels), mm: fmt(s.sumRain), stav: WMO[day.code] || '', misto: place.name, sance: s.maxProb, vitr: Math.round(s.maxGust / 1.6), narazy: Math.round(s.maxGust) };
  const line = fill(pick(texts.lines[mood] || texts.lines.pohoda || [''], hash(day.day + place.name)), vars);
  const rainStart = hrs.find((h) => h.mm >= 0.2 || h.prob >= 60);
  const rain = rainStart ? T(texts, 'dest.sucho-do', { cas: hhmm(rainStart.t) }, 'Do {cas} sucho, pak to začne kapat.') : '';
  const wear = wearList(s, texts);
  return {
    title: `${place.name ? place.name + ' · ' : ''}${Math.round(day.min)}° → ${Math.round(day.max)}°, ${WMO[day.code] || ''}`,
    body: [line, rain, wear.length ? `${T(texts, 'obleceni.nadpis', {}, 'Vem si:')} ${wear.join(', ')}` : ''].filter(Boolean).join('\n'),
    tag: 'morning',
  };
}

function extremeMsg(w, texts) {
  const day = w.daily[1]; if (!day) return null;
  const hrs = w.hourly.filter((h) => new Date(h.t).toISOString().slice(0, 10) === day.day && new Date(h.t).getUTCHours() >= 6 && new Date(h.t).getUTCHours() <= 22);
  if (!hrs.length) return null;
  const maxFeels = Math.max(...hrs.map((h) => h.feels)), minFeels = Math.min(...w.hourly.filter((h) => new Date(h.t).toISOString().slice(0, 10) === day.day).map((h) => h.feels));
  const gust = Math.max(...hrs.map((h) => h.gust));
  const storm = hrs.find((h) => h.code >= 95);
  const snowHr = hrs.find((h) => kind(h.code) === 'snow' && h.mm >= 0.5);
  const items = [];
  let mood = null;
  if (storm) { items.push(`bouřka kolem ${hhmm(storm.t)}`); mood = mood || 'strach'; }
  if (day.sum >= 15) { items.push(`hodně vody (~${fmt(day.sum)} mm)`); mood = mood || 'smutek'; }
  if (gust >= 60) { items.push(`vítr v nárazech až ${Math.round(gust)} km/h`); mood = mood || 'nervy'; }
  if (maxFeels >= 30) { items.push(`vedro, pocitově ${Math.round(maxFeels)}°`); mood = mood || 'vztek'; }
  if (minFeels <= -8) { items.push(`mráz, pocitově ${Math.round(minFeels)}°`); mood = mood || 'zima'; }
  if (snowHr) { items.push(`sníh od ${hhmm(snowHr.t)}`); mood = mood || 'snih'; }
  if (!items.length) return null;
  const vars = { pocitove: Math.round(mood === 'zima' ? minFeels : maxFeels), narazy: Math.round(gust), vitr: Math.round(gust / 1.6), mm: fmt(day.sum), teplota: Math.round(day.max), stav: WMO[day.code] || '' };
  const line = fill(pick(texts.lines[mood] || [''], hash(day.day)), vars);
  return { title: `Zítra: ${items[0]}`, body: [items.length > 1 ? 'A k tomu ' + items.slice(1).join(', ') + '.' : '', line].filter(Boolean).join('\n'), tag: 'extreme' };
}

function wearList(s, texts) {
  const f = (s.maxFeels + s.minFeels) / 2, w = [];
  const add = (k, d) => w.push(...T(texts, 'obleceni.' + k, {}, d).split('|').map((x) => x.trim()).filter(Boolean));
  if (f >= 25) add('25', 'triko | kraťasy');
  else if (f >= 20) add(s.minFeels < 15 ? '20-vecer' : '20', 'triko | lehké kalhoty');
  else if (f >= 15) add('15', 'lehká mikina');
  else if (f >= 10) add('10', 'mikina | lehká bunda');
  else if (f >= 4) add('4', 'bunda | něco pod ni');
  else if (f >= -2) add('-2', 'zimní bunda | čepice');
  else add('mraz', 'termoprádlo | zimní bunda | čepice | rukavice');
  if (s.storm || s.maxProb >= 55 || s.sumRain >= 1) add('destnik', 'deštník ☂');
  else if (s.maxProb >= 30) add('destnik-asi', 'deštník do batohu, pro jistotu');
  if (s.snow) add('snih', 'boty, co nepromoknou');
  if (s.maxUv >= 6) add('uv-silne', 'brýle + krém');
  return w;
}
const intensity = (mm15, texts) => { const h = mm15 * 4; return h < 1 ? T(texts, 'radar.slaby', {}, 'slabý déšť') : h < 4 ? T(texts, 'radar.dest', {}, 'déšť') : h < 10 ? T(texts, 'radar.silny', {}, 'silný déšť') : T(texts, 'radar.lijak', {}, 'liják'); };

/* ---------------- Hlášky z appky (hlasky.txt) ---------------- */
async function loadTexts(env) {
  const out = { lines: {}, texty: {} };
  try {
    const r = await fetch(`${env.APP_URL}/hlasky.txt`, { cf: { cacheTtl: 300 } });
    let cur = null;
    for (const raw of (await r.text()).split(/\r?\n/)) {
      const l = raw.trim();
      if (!l || l.startsWith('#')) continue;
      const m = l.match(/^\[(.+)\]$/);
      if (m) { cur = m[1].trim().toLowerCase(); continue; }
      if (cur === 'texty') { const kv = l.match(/^([\w.\-]+)\s*=\s*(.*)$/); if (kv) out.texty[kv[1]] = kv[2]; continue; }
      if (cur) (out.lines[cur] = out.lines[cur] || []).push(l);
    }
  } catch {}
  return out;
}
const T = (texts, key, vars, def) => fill(texts.texty[key] ?? def, vars);
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));
function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];

/* ---------------- Uložené záznamy ---------------- */
async function getRec(env, id) { return JSON.parse((await env.SUBS.get('sub:' + id)) || 'null'); }
function cleanPrefs(p = {}) {
  const time = /^\d{1,2}:\d{2}$/.test(p.time || '') ? p.time : '07:00';
  return { morning: !!p.morning, time, rain: !!p.rain, extreme: !!p.extreme };
}
async function sha(s) {
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...b.slice(0, 16)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/* ---------------- Web Push (VAPID + aes128gcm) ---------------- */
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
const concat = (...arrs) => { const n = arrs.reduce((a, x) => a + x.length, 0), o = new Uint8Array(n); let i = 0; for (const a of arrs) { o.set(a, i); i += a.length; } return o; };
const enc = (s) => new TextEncoder().encode(s);

let vapidCache = null;
async function vapidKeys(env) {
  if (vapidCache) return vapidCache;
  let stored = JSON.parse((await env.SUBS.get('vapid')) || 'null');
  if (!stored) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
    stored = { jwk, publicKey: b64u(pub) };
    await env.SUBS.put('vapid', JSON.stringify(stored));
  }
  const privateKey = await crypto.subtle.importKey('jwk', stored.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  vapidCache = { privateKey, publicKey: stored.publicKey };
  return vapidCache;
}

async function vapidAuth(env, endpoint) {
  const { privateKey, publicKey } = await vapidKeys(env);
  const aud = new URL(endpoint).origin;
  const header = b64u(enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.CONTACT || 'mailto:admin@example.com' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, enc(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${publicKey}`;
}

async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}

async function encryptPayload(sub, payload) {
  const uaPublic = unb64u(sub.keys.p256dh), authSecret = unb64u(sub.keys.auth);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

async function sendPush(env, sub, msg) {
  const body = await encryptPayload(sub, JSON.stringify({ ...msg, url: env.APP_URL + '/' }));
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': await vapidAuth(env, sub.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '3600',
      'Urgency': msg.tag === 'rain' ? 'high' : 'normal',
    },
    body,
  });
  return { ok: r.ok, status: r.status };
}
