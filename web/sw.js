/* Service worker. Drží celú aplikáciu v prehliadači, aby tablet
   na námestí fungoval aj bez signálu. Odosielanie rieši fronta
   v IndexedDB, tento súbor sa stará len o samotnú aplikáciu.

   Odpovede sa nikdy neukladajú do medzipamäte prehliadača. */

const VERZIA = "prieskum-2026-09-7";

const SUBORY = [
  "./",
  "./index.html",
  "./udaje.html",
  "./css/prieskum.css",
  "./js/prieskum.js",
  "./js/render.js",
  "./js/ulozisko.js",
  "./data/questions.json",
  "./data/ulice.json",
  "./assets/fonts/fonts.css",
  "./assets/fonts/archivo-black-latin-400-normal.woff2",
  "./assets/fonts/archivo-black-latin-ext-400-normal.woff2",
  "./assets/fonts/inter-latin-400-normal.woff2",
  "./assets/fonts/inter-latin-ext-400-normal.woff2",
  "./assets/fonts/inter-latin-700-normal.woff2",
  "./assets/fonts/inter-latin-ext-700-normal.woff2",
];

self.addEventListener("install", (udalost) => {
  udalost.waitUntil(
    caches.open(VERZIA)
      .then((sklad) => sklad.addAll(SUBORY))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (udalost) => {
  udalost.waitUntil(
    caches.keys()
      .then((mena) => Promise.all(mena.filter((m) => m !== VERZIA).map((m) => caches.delete(m))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (udalost) => {
  const poziadavka = udalost.request;
  if (poziadavka.method !== "GET") return;

  const adresa = new URL(poziadavka.url);
  if (adresa.origin !== self.location.origin) return;

  /* Volania na server sa nikdy neukladajú. Keď nie je signál, appka
     si poradí sama: blok si vyberie náhodne a odpovede idú do fronty. */
  if (adresa.pathname.includes("/api")) return;

  /* Terénny režim /t/KOD je tá istá stránka. */
  if (/\/t\/[^/]+\/?$/.test(adresa.pathname)) {
    udalost.respondWith(caches.match("./index.html").then((z) => z ?? fetch(poziadavka)));
    return;
  }

  udalost.respondWith(
    caches.match(poziadavka).then((zoSkladu) => {
      if (zoSkladu) {
        /* Na pozadí sa skúsi stiahnuť novšia verzia, ale človek nečaká. */
        fetch(poziadavka)
          .then((cerstve) => cerstve.ok && caches.open(VERZIA).then((s) => s.put(poziadavka, cerstve.clone())))
          .catch(() => {});
        return zoSkladu;
      }
      return fetch(poziadavka).catch(() => caches.match("./index.html"));
    })
  );
});
