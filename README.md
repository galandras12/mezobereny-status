# mezobereny-status

Mezőberényi önkormányzati weboldalak élő Statuspage oldala, GitHub Pages-en.

A `.github/workflows/check-status.yml` workflow percenként (best-effort,
GitHub-oldalon dokumentált minimum ~5 perc, terheléstől függően csúszhat)
lekéri az alábbi oldalakat, és az eredményt a `data/status.json` fájlba
menti — ez adja az utolsó 365 nap elérhetőségi statisztikáját (naponta
összesítve: hány ellenőrzésből hány volt sikeres), plusz a rögzített
kimaradások (incidensek) listáját.

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

## Beüzemelés

1. **Merge-eld a `main`-be** ezt az ágat (a schedule trigger csak az
   alapértelmezett ágon fut).
2. **GitHub Pages bekapcsolása:** Settings → Pages → Source: *Deploy from a
   branch* → Branch: `main` / `/ (root)`.
3. **Actions jogosultság ellenőrzése:** Settings → Actions → General →
   Workflow permissions → *Read and write permissions* (kell, hogy a
   workflow tudjon commitolni a `data/status.json`-ba).
4. Az első futás után (max. néhány perc, vagy manuálisan az Actions fülön
   *Run workflow*-val azonnal kiváltható) a `data/status.json` megtelik
   valós adattal, és az oldal élesben mutatja a státuszokat.

## Fejlesztés

Az ellenőrző script helyben is futtatható:

```bash
node scripts/check-status.mjs
```

A frontend statikus fájlokból áll (`index.html`, `assets/`), bármilyen
statikus szerverrel tesztelhető, pl.:

```bash
python3 -m http.server 8080
```
