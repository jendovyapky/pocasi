# jendovyapky.eu – rozcestník (poznámky pro Clauda)

Úvodní stránka na **jendovyapky.eu** s proklikem na Honzovy appky. Česky.
Složka `web/` v repu `jendovyapky/pocasi` (jako `push/`), vlastní Cloudflare Pages projekt `jendovyapky-web` (účet Jendovyapky, výstupní složka `web`), každý push do `main` se sám nasadí. Žádný build, statické soubory.

## Přísná pravidla
- **Nikdy nesahat na nic, co souvisí se studiem** (`studiodepo.cz`, DEPO / depo-app, studiový Cloudflare).
- Platby, hesla a API klíče zadává Honza sám.
- Nikde nepoužívat slogan „appky pro líný lidi“ (Honza nechce).

## Soubory
- `index.html` – celá stránka (CSS + JS uvnitř). Nadpis JENDOVY APKY (Doto), Mraq uprostřed, dole skleněný dok s ikonkami appek.
- `icons/mraq.png` – ikonka Mraqa (kopie z repa pocasi), `icons/klapqa.png` – ikonka Klapqa (z repa `jendovyapky/klapqa`), `icons/quba.svg` + `icons/quba.png` – ikonka Quest Castu (Quba = bílé brýle Questu s tečkovýma očima z repa `jendovyapky/quest`; PNG 192 px renderované Playwrightem; na rozcestníku je popisek „Quba“ – Honza chtěl; na quest.jendovyapky.eu se jméno dál neukazuje), `icons/favicon.svg`, `icons/phasmapp.png` – ikonka Phasmapp (duch s tečkovýma očima, kopie `icons/icon-192.png` z projektu Phasmapp, `E:\phasmoappka`).

## Jak to funguje
- Canvas scéna jako úvodní animace Mraqa: obloha podle denní doby (stejné palety `PAL` jako Mraq), mraky ve 3 hloubkách s hloubkou ostrosti, vítr, v noci hvězdy.
- Paralaxa podle myši / prstu / náklonu telefonu (iOS se na náklon zeptá po prvním ťuknutí).
- Mraq: tečkové oči sledují myš/prst, sám se rozhlíží, mrká, občas obrátí oči v sloup / usměje se, v noci po 15 s nečinnosti usíná.
- Reakce (jen tyhle hlášky, Honza je schválil):
  - najetí na Mraq → vykulí oči a usměje se: „Klikni. Řeknu ti, co si vzít na sebe.“
  - najetí / ťuknutí na Klapqa (zatím šedá, neklikací, „pracuje se“, `data-app="soon"`) → přimhouří oko: „Jak brzo? Brzo.“
  - šťouchnutí do Mraqa → nadskočí: „Hej, co zkoušíš?“
  - klik na Mraq → nadskočí a pak přesměruje na https://mraq.jendovyapky.eu
  - najetí na Qubu → „Chceš streamovat brejle?“, klik → Mraq nadskočí a pak https://quest.jendovyapky.eu
  - najetí na Phasmapp (pomocník do Phasmophobie) → „Bojíš se duchů? Já jim aspoň rozumím.“, klik → Mraq nadskočí a pak https://phasmapp.pages.dev (až bude DNS záznam `phasmapp` → `phasmapp.pages.dev`, přepnout na https://phasmapp.jendovyapky.eu)
- **Klapqa beta:** 5× ťuknout na šedou Klapqa (do 2,5 s) → z ikonky vyletí klapka (canvas, stejná kresba jako úvod Klapqy: žluté rameno, tečkové oči sledují prst, při psaní koukají na kód, mrkají) a pod ní papírové tělo s polem na kód a tlačítkem „Akce!“. Špatný kód = klapka cukne, oči přimhouří, zatřese se. Kód `beta` (velikost písmen nevadí) = klapka klapne (záblesk, otřes, oči ∩), Mraq nadskočí, tmavá clona se zavře z klapky a pak https://klapqa.jendovyapky.eu (tam naváže úvod Klapqy). Zařízení si to pamatuje (`localStorage` `beta.klapqa`), pak stačí jedno ťuknutí. Ikonka zůstává šedá „pracuje se“. Mimo / Escape = klapka zaletí zpátky do ikonky.
- `?doba=rano|den|vecer|noc` – náhled jiné denní doby.

## Přidání další appky
Do `.dock` přidat `<a class="app" data-app="…" href="https://….jendovyapky.eu">` s ikonkou; případně hlášku do `LINES`.

Klapqa až bude hotová: z `.app.soon` udělat `<a class="app" data-app="klapqa" href="https://klapqa.jendovyapky.eu">` a dát jí hlášku do `LINES`.
