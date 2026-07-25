# mezobereny-status

Mezőberényi önkormányzati weboldalak élő Statuspage oldala, GitHub Pages-en.

Az ellenőrzést a `scripts/check-status.mjs` script végzi: leellenőrzi az
alábbi oldalakat, és az eredményt a `data/status.json` fájlba menti — ez
adja az utolsó 365 nap elérhetőségi statisztikáját (naponta összesítve:
hány ellenőrzésből hány volt sikeres), plusz a rögzített kimaradások
(incidensek) listáját. A folyamatos futtatás jelenleg **helyben** történik
(lásd lentebb) — a `.github/workflows/check-status.yml` GitHub Actions
workflow automatikus (percenkénti) ütemezése ki van kapcsolva, csak
kézzel indítható az Actions fülön (*Run workflow*).

Követett oldalak (`data/services.json`):

1. Mezőberény weboldala (SSL) – https://mezobereny.hu
2. Mezőberény weboldala – http://mezobereny.hu/s/elerhetosegek
3. Mezőberény Óvodai Intézménye – https://berenyiovodak.mezobereny.hu
4. Orlai Ház – https://orlaihaz.mezobereny.hu
5. Humánsegítő és Szociális Szolgálat – https://hunan.mezobereny.hu
6. Mezőberényi Általános Iskola – https://mai.mezobereny.hu

Új oldal felvételéhez elég bővíteni a `data/services.json` tömböt egy
`id`/`name`/`url` hármassal — a `data/status.json` a következő futáskor
automatikusan létrehozza hozzá a saját statisztikáját.

Egy oldal csak akkor számít kimaradásnak (és csak akkor kerül be az
incidensek közé, illetve vált "Nem elérhető" státuszra), ha **5 egymást
követő mérés** sem kapott választ — egy-egy elszigetelt sikertelen
ellenőrzés (átmeneti hálózati hiba, timeout) önmagában nem jelenik meg
kimaradásként.

## Admin felület – bejelentések és tervezett karbantartás

A `/admin/` alatt elérhető egy jelszóval védett admin felület, ahol kézzel
rögzíthetsz ismert incidenseket vagy tervezett karbantartást, saját
üzenettel, beállítható kezdési időponttal. Minden bejelentéshez
utólag is fel lehet venni új státusz-üzenetet (idővonalszerűen), és minden
egyes üzenetnél újra megadható a bejelentés aktuális státusza. Az öt
státusz:

| Státusz | Szín | Jelentés |
|---|---|---|
| Online | zöld | rendben működik |
| Offline | piros | nem elérhető |
| Tervezett karbantartás | kék | előre bejelentett, tervezett leállás |
| Teljes leállás | narancssárga | ismert, teljes körű hiba |
| Részleges leállás | citromsárga | ismert, részleges hiba |

Az aktív (még nem "Online"-ra lezárt) bejelentések kiemelten, színes
sávként jelennek meg a publikus oldal tetején, és az érintett
szolgáltatás kártyáján is felülírják az automatikus Elérhető/Nem elérhető
jelzést.

### Jelszó és biztonsági megjegyzés

A belépő jelszót az `admin/auth-config.js` fájl tartalmazza, egyszerű
szövegként (nincs hashelve/titkosítva, ahogy kérted). **Fontos tudni:**
mivel ez a GitHub Pages statikus oldal része, ez a fájl — és vele a
jelszó — mindenki számára látható, aki megnézi a nyilvános repót vagy az
oldal forráskódját. Ez tehát nem valódi hozzáférés-védelem, csak
megakadályozza, hogy a felület véletlenül, egy kattintással megnyíljon —
nincs is rá link a publikus oldalról, és a `robots.txt` is tiltja a
keresőmotoroknak. Jelszó módosítása: szerkeszd az `ADMIN_PASSWORD` értékét
az `admin/auth-config.js`-ben, majd commitold+pushold.

A tényleges publikáláshoz (hogy a bejelentés valóban felkerüljön a
publikus oldalra) egy **GitHub Personal Access Token** szükséges, amit az
admin felület Beállítások fülén adsz meg — ez a token **csak a te
böngésződ localStorage-ában marad**, soha nem kerül a repóba vagy a
publikus oldalba, tehát ez a rész valóban rejtve marad mindenki más elől.
Ajánlott egy fine-grained token, csak erre a repóra korlátozva, csak
„Contents: Read and write” jogosultsággal
(GitHub → Settings → Developer settings → Personal access tokens).

Token nélkül a felület is használható: a módosítások csak ideiglenesen, a
böngészőben érvényesülnek, és a „JSON letöltése” gombbal exportálhatod a
`data/incidents.json` tartalmát kézi commithoz.

## Beüzemelés

1. **Merge-eld a `main`-be** ezt az ágat.
2. **GitHub Pages bekapcsolása:** Settings → Pages → Source: *Deploy from a
   branch* → Branch: `main` / `/ (root)`.
3. Indítsd el a `scripts/run-status-cron.mjs`-t (vagy Windows alatt a
   `scripts/start-status-cron.bat`-ot) egy gépen, ami folyamatosan tud
   futni — ez tölti fel élő adattal a `data/status.json`-t, amit aztán ki
   is kell commitolni/pusholni a `main`-be, hogy a Pages oldal is lássa.

### GitHub Actions automatikus ütemezés újra bekapcsolása (opcionális)

Ha inkább a felhőben, GitHub Actionsön futna percenként az ellenőrzés
(helyi gép nélkül), vedd ki a kommentből a `schedule` blokkot a
`.github/workflows/check-status.yml`-ben, majd:

- **Actions jogosultság ellenőrzése:** Settings → Actions → General →
  Workflow permissions → *Read and write permissions* (kell, hogy a
  workflow tudjon commitolni a `data/status.json`-ba).

## Fejlesztés

Az ellenőrző script helyben is futtatható egyszeri futásra:

```bash
node scripts/check-status.mjs
```

### Folyamatos, helyi (nem GitHub Actions) ellenőrzés

A GitHub Actions workflow mellett/helyett a `scripts/run-status-cron.mjs`
egy interaktív, saját gépen/szerveren futtatható "cron" runner: indításkor
konzolon kiválasztod a gyakoriságot (1, 5, 10 vagy 15 perc), utána addig
futtatja folyamatosan a `check-status.mjs`-t ezzel az időközzel, amíg le
nem állítod (`q` + Enter, vagy Ctrl+C — ilyenkor megvárja, hogy a
folyamatban lévő ellenőrzés befejeződjön).

```bash
node scripts/run-status-cron.mjs
```

**Windows alatt** dupla kattintással is indítható a `scripts/start-status-cron.bat`
fájl — ez ugyanezt a `run-status-cron.mjs`-t futtatja Node.js-en keresztül
(előfeltétel: telepített Node.js, letölthető innen: https://nodejs.org/).
Ha kényelmesebb, hozz létre hozzá parancsikont az asztalon.

A frontend statikus fájlokból áll (`index.html`, `assets/`), bármilyen
statikus szerverrel tesztelhető, pl.:

```bash
python3 -m http.server 8080
```
