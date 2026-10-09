# Mraq – poznámky pro Clauda

**Mraq** (dřív „Líné počasí“) – webová aplikace (PWA) na počasí, kterou si majitel (Honza) přidává na plochu telefonu.
Celá v **češtině**, trochu vtipná, „pro líné“: otevřu a hned vím, co si vzít na sebe.

- Živě: https://mraq.jendovyapky.eu (dřív pocasi.jendovyapky.eu; Cloudflare Pages, záložně https://pocasi.pages.dev)
- Repo: `jendovyapky/pocasi`, větev `main`

## Nasazení
- Cloudflare Pages je napojený na tohle repo. **Každý push do `main` se sám nasadí** během ~1 min.
- Žádný build: statické soubory z kořene repa.
- Cloudflare účet: Jendovyapky (nový, samostatný). Doména `jendovyapky.eu` koupená na Webglobe, DNS spravuje Cloudflare.
- Po větší změně zvýšit `VERSION` v `sw.js` (např. `mraq-v2`), ať se telefonům stáhne nová verze.

## Přísná pravidla
- **Nikdy nesahat na nic, co souvisí se studiem** (`studiodepo.cz`, repozitáře DEPO / depo-app, studiový Cloudflare).
  Projekty pod `jendovyapky` drž úplně oddělené.
- Platby, hesla a API klíče zadává Honza sám.

## Soubory
- `index.html` – struktura stránky (hlavička, líný text, teplota, slunce, karty, části dne, radar, týden, dock s časovou osou, sheety pro hledání místa a radar)
- `style.css` – vzhled; barvy oblohy přes CSS proměnné `--c1 --c2 --c3 --glow` (registrované přes `@property`, plynule se animují)
- `app.js` – veškerá logika, bez frameworku a bez buildu
- `mraq.js` – maskot Mraq: obličej kreslený do SVG z parametrů (oči = elipsa oříznutá víčky, pusa = křivka), nálady `MOODS`, mrkání, reakce na ťuknutí, psaní vět
- `hlasky.txt` – **všechny hlášky Mraqa** po skupinách `[nálada]`, proměnné `{teplota}` apod. Appka si soubor načítá za běhu → Honza je může přepisovat sám
- `icons/mraq.svg` – zdroj ikonky (mrak jako Q, oči koukají stranou, zrnitý gradient appky); PNG se z něj renderují Playwrightem
- `sw.js` – service worker (vlastní soubory network-first s `cache: 'no-cache'`, fonty/Leaflet cache-first, API se necachuje)
- `manifest.webmanifest`, `icons/` – PWA

## Data (vše zdarma, bez klíčů)
- Předpověď: Open-Meteo `api.open-meteo.com/v1/forecast`, `best_match` (pro ČR ICON-D2 2 km + ICON-EU + ECMWF), `past_days=1` kvůli srovnání se včerejškem.
- Srážky po 15 min: Open-Meteo `minutely_15` (samostatný request, smí selhat).
- Radar: RainViewer `api.rainviewer.com/public/weather-maps.json` – **od 1. 1. 2026 jen minulé 2 h, žádný nowcast, max zoom 7, barevné schéma jen 2 (Universal Blue)**. Atribuce „RainViewer“ je povinná.
- Mapový podklad radaru: Esri World Dark Gray (CARTO chce nově API klíč – nepoužívat).
- Název místa: BigDataCloud reverse geocode (`localityLanguage=cs`); hledání měst: Open-Meteo geocoding (`language=cs`).

## Jak to funguje (klíčové části app.js)
- Časy z API jsou lokální časy místa → `parseLocal()` je ukládá jako UTC ms a všude se používají `getUTC*()`. „Teď“ = `Date.now() + utc_offset`.
- `compareYesterday()` – průměr pocitové teploty 8–21 h dnes vs. včera → `lazyPhrase()` („trochu tepleji“, „o dost chladněji“, „zhruba stejně“…).
- `mascotMood(f)` – nálada Mraqa podle počasí v čase `f` (bouřka → strach, noc → spí, ráno → ospalej, déšť → smutek, vedro → vztek…); mění se i při posouvání časové osy. První hláška dne je deterministická podle data + místa.
- `wearList()` – „Vem si:“ podle pocitové teploty, deště, UV, větru.
- `palAt()` / `applySky()` – barvy oblohy podle polohy slunce (noc, svítání, ráno, den, zlatá hodinka, soumrak), mix do šeda podle oblačnosti, při dešti čárky.
- Časová osa dole: horizontální scroller, 44 px = 1 hodina, 36 h dopředu; `renderAt(f)` překreslí teplotu, oblohu, slunce a karty pro desetinný index hodiny. ▶ přehraje den.
- `mood()` / `moodParts()` – „Pohoda venku“ 0–100 = 100 minus body za teplotu (od 21 °C), déšť, vítr, mraky a tmu; karta ukazuje, co to nejvíc kazí, a kdy bude nejlíp.
- Sluníčko na oblouku jde táhnout prstem → posouvá čas (`sunTimeFromPoint`).
- Poloha: při každém otevření se zjišťuje znovu, ale o povolení se appka ptá jen jednou (`autoLocate()` + `navigator.permissions`, příznak `geoAsked`); jinak bere poslední místo. Ručně vybrané město platí jen do zavření.
- Radar: celá obrazovka, tmavá Esri mapa, osa −2 h … +3 h. Minulost = RainViewer snímky. Budoucnost = vlastní odhad: `estimateMotion()` porovná poslední snímek se snímkem o 30 min starším (dlaždice zoom 6 do canvasu, hledá posun s nejmenším rozdílem) a poslední snímek posouvá CSS transformem, postupně slábne; čísla pro místo z `minutely_15` (RainViewer nowcast od 2026 nedává; kdyby se vrátil v `radar.nowcast`, kód ho použije).
- Poslední data se drží v `localStorage` (`lino:v1`) → appka funguje i offline.

## Design – inspirace od Honzy
- Lazy Weather: monospace text „Today's weather is ABOUT THE SAME as yesterday“, ráno/poledne/večer/noc se šipkami vs. včera.
- Oranžový/zelený gradientový screen: velká tečkovaná teplota (font **Doto**), oblouk slunce s východem/západem, dvě karty dole (vlevo nálada, vpravo – u nás – déšť), dial s červenou ručičkou dole.
- Sunset screen: zrnitý gradient, font a popisky.
- Video: posouvání časem přes den, obloha se plynule mění den → noc.
- Fonty: Geist, Geist Mono, Doto (Google Fonts).

## Testování
- Ze sandboxu se nedá dostat na API počasí → testovat přes Playwright s podvrženými odpověďmi (route na `api.open-meteo.com` apod.), viewport 390×844.
- Živou verzi ověřit ve vestavěném prohlížeči na https://mraq.jendovyapky.eu (preset mobile).

## Nápady na příště
- Hlášky klidně drzejší (Honza zvažuje).
- Rozcestník na `jendovyapky.eu` se všemi appkami.
- Další appky jako subdomény `*.jendovyapky.eu`, každá vlastní repo pod `jendovyapky`.
