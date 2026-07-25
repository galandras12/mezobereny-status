// Admin belépő jelszó — sima szövegként, nincs titkosítva/hashelve.
//
// FONTOS: ez a fájl a publikus GitHub Pages oldal része, tehát bárki, aki
// megnézi a repót vagy az oldal forráskódját, el tudja olvasni. Ez a jelszó
// csak egy egyszerű "ne látszódjon rögtön" szintű védelem a felülettel
// szemben, NEM valódi biztonsági határ. A tényleges publikáláshoz (GitHub
// írás) szükséges token a böngésződ saját localStorage-ában marad, azt
// senki más nem látja — ld. admin/assets/app.js és a README-t.
//
// Amíg az alábbi sor kommentben van, az admin felület nem enged
// bejelentkezni — a jelszó mező helyett egy "Állítson be jelszót!"
// üzenetet mutat. Beállításhoz vedd ki a sor eleji "//" jelet, írd át a
// szöveget a saját jelszavadra, majd commitold+pushold:
//
// export const ADMIN_PASSWORD = "ide-jon-a-sajat-jelszavad";
