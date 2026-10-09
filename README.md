# Líné počasí ☀︎

Otevřeš, víš, co si vzít na sebe. Webová aplikace (PWA), kterou si přidáš na plochu telefonu.

## Co umí
- **Dnes vs. včera**: „Dnes je TROCHU TEPLEJI než včera“ (porovnává pocitovou teplotu 8:00–21:00)
- **Vtipná hláška dne** podle počasí (každý den jiná, během dne se nemění)
- **„Vem si:“** s oblečením podle pocitové teploty, deště, UV a větru
- **Časová osa dole**: táhni prstem a projeď 36 hodin. Mění se teplota, obloha, slunce i karty. ▶ přehraje celý den.
- **Slunce**: oblouk s východem a západem, kde je slunce teď a kolik zbývá světla
- **Pohoda venku** (0–100) a **Déšť** (šance po hodinách v tečkách, klepnutím skočíš na čas)
- **Radar**: animace srážek za posledních 120 minut + graf srážek na příští 3 hodiny po 15 minutách
- Ráno / poledne / odpoledne / večer / noc oproti včerejšku, výhled na týden
- Funguje i offline (ukáže poslední stažená data)

## Odkud jsou data
| Co | Zdroj | Pozn. |
|---|---|---|
| Předpověď | [Open-Meteo](https://open-meteo.com) `best_match` | Pro ČR bere ICON-D2 od DWD (mřížka 2 km), dál ICON-EU a ECMWF |
| Srážky po 15 min | Open-Meteo `minutely_15` | ICON-D2, nejpřesnější pro „bude za půl hodiny pršet?“ |
| Radar | [RainViewer](https://www.rainviewer.com) | Zdarma už jen minulé 2 h, max. zoom 7 (od 1. 1. 2026 zrušili nowcast) |
| Název místa | BigDataCloud (zdarma, bez klíče) | |
| Hledání měst | Open-Meteo Geocoding | |

Žádné API klíče, nic se neplatí.

## Nasazení na GitHub Pages (zdarma)
1. Na github.com → **New repository** → název třeba `pocasi` → Public → Create.
2. **Add file → Upload files** → přetáhni sem *obsah* složky (index.html, app.js, style.css, sw.js, manifest.webmanifest, složku icons) → Commit.
3. **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main` / `(root)` → Save.
4. Za minutu běží na `https://TVUJNICK.github.io/pocasi/`.

Poloha funguje jen přes HTTPS, což GitHub Pages má automaticky.

## Přidání na telefon
- **iPhone (Safari)**: Sdílet → *Přidat na plochu*
- **Android (Chrome)**: ⋮ → *Přidat na plochu / Instalovat aplikaci*

## Úpravy
- Hlášky: `app.js` → objekt `JOKES`
- Oblečení: `app.js` → funkce `wearList`
- Barvy oblohy: `app.js` → objekt `PAL` (noc, svítání, ráno, den, zlatá hodina, soumrak)
- Po větší změně zvyš `VERSION` v `sw.js`, ať se telefonům stáhne nová verze.
