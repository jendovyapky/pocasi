# Mraq – poznámky pro Clauda

**Mraq** (dřív „Líné počasí“) – webová aplikace (PWA) na počasí, kterou si majitel (Honza) přidává na plochu telefonu.
Celá v **češtině**, trochu vtipná, „pro líné“: otevřu a hned vím, co si vzít na sebe.

- Živě: https://mraq.jendovyapky.eu (dřív pocasi.jendovyapky.eu; Cloudflare Pages, záložně https://pocasi.pages.dev)
- Repo: `jendovyapky/pocasi`, větev `main`

## Nasazení
- Cloudflare Pages je napojený na tohle repo. **Každý push do `main` se sám nasadí** během ~1 min.
- Žádný build: statické soubory z kořene repa.
- Cloudflare účet: Jendovyapky (nový, samostatný). Doména `jendovyapky.eu` koupená na Webglobe, DNS spravuje Cloudflare.
- Ve vestavěném prohlížeči (Honzův Mac) je přihlášený GitHub i Cloudflare účet Jendovyapky → nové repo pod `jendovyapky` nebo Pages projekt jde založit tam (z terminálu nové repo vytvořit nejde).
- Po větší změně zvýšit `VERSION` v `sw.js` (např. `mraq-v2`), ať se telefonům stáhne nová verze.

## Přísná pravidla
- **Nikdy nesahat na nic, co souvisí se studiem** (`studiodepo.cz`, repozitáře DEPO / depo-app, studiový Cloudflare).
  Projekty pod `jendovyapky` drž úplně oddělené.
- Platby, hesla a API klíče zadává Honza sám.

## Soubory
- `index.html` – struktura stránky (hlavička, líný text, teplota, slunce, karty, části dne, radar, týden, dock s časovou osou, sheety pro hledání místa a radar)
- `style.css` – vzhled; barvy oblohy přes CSS proměnné `--c1 --c2 --c3 --glow` (registrované přes `@property`, plynule se animují)
- `app.js` – veškerá logika, bez frameworku a bez buildu
- `mraq.js` – maskot Mraq: tělo = rozmazaný mrak s ocáskem Q (stejný tvar jako ikonka), obličej = robotí tečkové oči (styl Cozmo / RoboEyes, tečky jako písmo Doto), bez pusy. `pixelEye()` počítá každý snímek, které tečky svítí (zaoblený obdélník oříznutý víčky, `happy` = oblouček ∩). Nálady `MOODS`, mrkání, reakce na ťuknutí, psaní vět. Náhled všech výrazů: `window.__mraq.set(nálada)`
- `intro.js` – úvodní animace při spuštění (canvas přes celou obrazovku, 2,25 s): Mraq se rozhlédne (doleva, doprava, mrkne), nadechne se a kamera proletí 3 vrstvami mraků (paralaxa, perspektivní projekce, hloubka ostrosti přes zmenšené sprity) až do něj; appka se vynoří z mlhy. Barvy z `state.skyPal` (nastavuje `applySky`), ve tmě fialový Mraq + hvězdy + tmavá mlha. Ťuknutí = přeskočit. Nehraje při úsporných animacích a vypnutém Mraqovi („omezit pohyb“ v systému ji schválně nevypíná – Honzův Mac ho má zapnutý). Start bez problikávání: do intra jen **černá** – iOS `apple-touch-startup-image` (černé PNG v `icons/start/`, iOS je načte jen při přidání na plochu; bez nich iOS při startu ukáže bílou) – na začátku `<head>` `color-scheme: dark` + černé `html` + CSS kryt `body::after`, který zmizí třídou `noboot` (dá ji intro, když jeho plátno kryje appku, nebo app.js / inline skript, když se intro nehraje); intro z černé plynule vyjede. `style.css` i Google Fonts se načítají neblokujícím `preload` (jinak iOS do stažení stylů ukazuje bílou); `window.__css` = promise načtení stylů, intro i odkrytí bez intra na ni čekají.
- `hlasky.txt` – **všechny hlášky Mraqa** po skupinách `[nálada]`, proměnné `{teplota}` apod. Appka si soubor načítá za běhu → Honza je může přepisovat sám
- `icons/mraq.svg` – zdroj ikonky (mrak jako Q, oči koukají stranou, zrnitý gradient appky); PNG se z něj renderují Playwrightem
- `sw.js` – service worker: vlastní soubory **stale-while-revalidate** (start hned z cache, nová verze se stáhne na pozadí → projeví se při dalším otevření; install bere soubory s `cache: 'reload'`), fonty/Leaflet cache-first, API se necachuje
- `manifest.webmanifest`, `icons/` – PWA
- `push/` – **server pro notifikace** (Cloudflare Worker `mraq-push`, nasazuje se sám z GitHubu přes Workers Builds, root `/push`). API na https://mraq-api.jendovyapky.eu (`/vapid`, `/subscribe`, `/unsubscribe`, `/test`). Cron každých 15 min: ranní shrnutí v nastavený čas, déšť do hodiny (7–22 h, max 1× za 3 h), extrémy na zítřek v 19:00. Web Push je ručně přes WebCrypto (VAPID + aes128gcm). VAPID klíče si Worker vygeneroval sám a má je v KV `mraq-push` (klíč `vapid`) – **nemazat**, jinak přestanou fungovat všechny přihlášené telefony. Texty bere z `hlasky.txt` z webu.

- `web/` – **rozcestník jendovyapky.eu** (samostatný Cloudflare Pages projekt `jendovyapky-web`, výstupní složka `web`). Detaily v `web/CLAUDE.md`. Nikde nepoužívat slogan „appky pro líný lidi“.

## Data (vše zdarma, bez klíčů)
- Předpověď: Open-Meteo `api.open-meteo.com/v1/forecast`, `best_match` (pro ČR ICON-D2 2 km + ICON-EU + ECMWF), `past_days=1` kvůli srovnání se včerejškem.
- Srážky po 15 min: Open-Meteo `minutely_15` (samostatný request, smí selhat).
- **Pozor:** mlhu (kód 45/48) bereme jen při dohlednosti pod 1,5 km (`fogCode()`, `visibility` z API). `weather_code` z modelu občas hlásí i slabý déšť/mrholení i při 0 mm. `dryCode()` takové kódy mění na „zataženo“, pokud reálně nic nepadá (hodinové srážky, aktuální srážky, nejbližších 15 min). Mraq, obloha, animace i nápis řídí `codeAt(f)`.
- Radar: RainViewer `api.rainviewer.com/public/weather-maps.json` – **od 1. 1. 2026 jen minulé 2 h, žádný nowcast, max zoom 7, barevné schéma jen 2 (Universal Blue)**. Atribuce „RainViewer“ je povinná.
- Mapový podklad radaru: Esri World Dark Gray (CARTO chce nově API klíč – nepoužívat).
- Název místa: BigDataCloud reverse geocode (`localityLanguage=cs`); hledání měst: Open-Meteo geocoding (`language=cs`).

## Jak to funguje (klíčové části app.js)
- Časy z API jsou lokální časy místa → `parseLocal()` je ukládá jako UTC ms a všude se používají `getUTC*()`. „Teď“ = `Date.now() + utc_offset`.
- `compareYesterday()` – průměr pocitové teploty 8–21 h dnes vs. včera → `lazyPhrase()` („trochu tepleji“, „o dost chladněji“, „zhruba stejně“…).
- `mascotMood(f)` – nálada Mraqa podle počasí v čase `f` (bouřka → strach, 22–9 h spí, 9–10:30 ospalej, déšť → smutek, vedro → vztek, mlha jen při dohlednosti < 1,5 km, `radost` jen přes den při jasnu, po západu `vecer`); mění se i při posouvání časové osy. První hláška dne je deterministická podle data + místa.
- Pojistky hlášek (`usable()` v mraq.js i v push/): hláška s `{mm}` až od 0,5 mm, `{sance}` od 50 %, `{vitr}` od 30, `{narazy}` od 45 km/h; první písmeno vždy velké. **Při přidávání nálady hlídat, aby texty ve skupině seděly na všechny situace, kdy se skupina ukazuje.**
- `wearList()` – „Vem si:“ podle pocitové teploty, deště, UV, větru. Okno: přes den teď → 22 h; v noci (`daySummary(true)`) den, kdy půjdeš ven, 6–22 h – nadpis „Ráno si vem:“ (0–6 h) / „Zítra si vem:“ (od 21 h). Deštník jen při reálném dešti (≥ 1,5 mm, nebo ≥ 2 h s ≥ 0,3 mm a šancí ≥ 50 %), ne jen podle vysoké šance. `wearPick()` ukáže max 2 věci (deštník/sníh přednost, jinak se skupiny i věci střídají podle `wearSeed`, který se zvedne při každém otevření); když se dvě nevejdou na řádek, zůstane jedna. V `hlasky.txt`: `|` = samostatné věci, `+` = patří k sobě (ukážou se jen spolu). Věci jde ťuknutím odškrtnout (tmavá pilulka s ✓), pamatuje se do konce dne (`localStorage` → `wear`).
- `palAt()` / `applySky()` – barvy oblohy podle polohy slunce (noc, svítání, ráno, den, zlatá hodinka, soumrak), mix do šeda podle oblačnosti. Efekty počasí na pozadí (třídy na `#sky`): `cloudy` plující mraky, `rain`/`heavy` dvě vrstvy kapek, `snow` vločky, `fog` mléčné pruhy, `storm` záblesky.
- Časová osa dole: horizontální scroller, 44 px = 1 hodina, 36 h dopředu; `renderAt(f)` překreslí teplotu, oblohu, slunce a karty pro desetinný index hodiny. ▶ přehraje den.
- `mood()` / `moodParts()` – „Pohoda venku“ 0–100 = 100 minus body za teplotu (od 21 °C), déšť, vítr, mraky a tmu; karta ukazuje, co to nejvíc kazí, a kdy bude nejlíp.
- Sluníčko jde táhnout prstem jako kolečko: vodorovný posun = čas, celá šířka grafu = jeden den, za pravým koncem plynule navazuje další den (`wireSunDrag`, `sunXToMs`/`sunMsToX`).
- Poloha: při každém otevření se zjišťuje znovu, ale o povolení se appka ptá jen jednou (`autoLocate()` + `navigator.permissions`, příznak `geoAsked`); jinak bere poslední místo. Ručně vybrané město platí jen do zavření.
- Radar: celá obrazovka, tmavá Esri mapa, osa −2 h … +3 h. Minulost = RainViewer snímky. Budoucnost = **předpověď modelu na mapě**: `loadModelGrid()` stáhne jedním requestem `minutely_15` pro mřížku 15×19 bodů (~25–35 km) kolem místa (Open-Meteo bere víc souřadnic oddělených čárkou, každý bod = 1 volání, limit 600/min → hustší mřížku ne; cache 10 min), z toho `imageOverlay` vrstvy po 15 min – interpolují se hodnoty (ne barvy), přepočet na Mercator, měkké okraje, mezi nimi plynulé prolínání; radar končí 3 min za posledním snímkem a hned je naplno model (žádné posouvání starého snímku; to jen záložně bez modelu). Záložně, když model nejde, starý odhad: `estimateMotion()` porovná poslední snímek se snímkem o 30 min starším (dlaždice zoom 6 do canvasu, hledá posun s nejmenším rozdílem) a poslední snímek posouvá CSS transformem, postupně slábne; čísla pro místo z `minutely_15` (RainViewer nowcast od 2026 nedává; kdyby se vrátil v `radar.nowcast`, kód ho použije).
- Nastavení (tlačítko dole): vzhled (Automaticky = podle telefonu / Světlý / Tmavý – `themeNow()`, tmavý ztlumí barvy denní doby do tmava, světlý zesvětlí noc), notifikace, místo (podle polohy / pořád stejné), Mraq zap/vyp, vibrace, úsporné animace. Uloženo v `localStorage` pod `settings`.
- Mraq má kolem sebe animace počasí (`weatherFx()` → `data-fx` na `#orb`: sun, moon, rain, drizzle, storm, snow, fog, wind) a mluví v tmavé myšlenkové bublině.
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
- Další appky jako subdomény `*.jendovyapky.eu`, každá vlastní repo pod `jendovyapky`.
