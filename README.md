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
