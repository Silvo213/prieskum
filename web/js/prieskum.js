/* Riadenie dotazníka „Aký Martin chceme".
   Jedna otázka alebo jeden blok na obrazovku, vždy Ďalej aj Späť.
   Funguje aj bez signálu: odoslané dotazníky idú do fronty v prehliadači. */

import { vykresliOtazku, vykresliBateriu, hotova, chyba } from "./render.js";
import * as ulozisko from "./ulozisko.js";

const API = "api";

const prvky = {
  obsah:    document.getElementById("obsah"),
  postup:   document.getElementById("postup"),
  postupText: document.getElementById("postup-text"),
  postupPas: document.getElementById("postup-pas"),
  pata:     document.getElementById("pata"),
  spat:     document.getElementById("spat"),
  dalej:    document.getElementById("dalej"),
  preskocit: document.getElementById("preskocit"),
  zvacsi:   document.getElementById("zvacsi"),
  fronta:   document.getElementById("fronta"),
  pasca:    document.getElementById("prezyvka"),
};

let dotaznik, ulice, obrazovky = [], stav, teren = null;

/* ---------- väčšie písmo ---------- */

function nastavZvacsenie(zapnute) {
  document.documentElement.style.setProperty("--zvacsenie", zapnute ? "1.25" : "1");
  prvky.zvacsi.setAttribute("aria-pressed", zapnute ? "true" : "false");
  try { localStorage.setItem("prieskum-vacsie-pismo", zapnute ? "1" : "0"); } catch { /* súkromné okno */ }
}

prvky.zvacsi.addEventListener("click", () => {
  nastavZvacsenie(prvky.zvacsi.getAttribute("aria-pressed") !== "true");
});

/* ---------- terénny režim ---------- */

const MIESTA = ["námestie", "trhovisko", "poliklinika", "stanica", "Ľadoveň",
                "Košúty", "Priekopa", "Záturčie", "Podháj", "Stráne", "iné"];

function zistiTeren() {
  const zAdresy = location.pathname.match(/\/t\/([A-Za-z0-9-]{1,20})\/?$/);
  if (zAdresy) {
    try {
      localStorage.setItem("prieskum-tim", zAdresy[1].toUpperCase());
      const pin = new URLSearchParams(location.search).get("pin");
      if (pin && /^\d{4}$/.test(pin)) localStorage.setItem("prieskum-pin", pin);
    } catch { /* súkromné okno */ }
    history.replaceState(null, "", location.pathname.replace(/\/t\/[^/]+\/?$/, "/"));
  }
  try {
    const kod = localStorage.getItem("prieskum-tim");
    return kod ? { kod, miesto: localStorage.getItem("prieskum-miesto") } : null;
  } catch { return null; }
}

/* ---------- zostavenie obrazoviek ---------- */

function zostavObrazovky(pismeno) {
  const zoznam = [];

  for (const blok of dotaznik.bloky) {
    if (blok.ulozisko !== "odpovede" || blok.typ === "bonus") continue;
    if (blok.typ === "rotujuci" && blok.pismeno !== pismeno) continue;

    if (blok.format === "bateria") {
      zoznam.push({ druh: "bateria", bateria: blok, nazov: blok.nazov });
      continue;
    }

    /* Krátke otázky na jedno klepnutie idú spolu, dlhé majú vlastnú obrazovku.
       Šetrí to klikanie a drží päťminútový rozpočet. */
    let skupina = [];
    for (const otazka of blok.otazky ?? []) {
      if (otazka.format === "jedna") { skupina.push(otazka); continue; }
      if (skupina.length) { zoznam.push({ druh: "otazky", otazky: skupina, nazov: blok.nazov }); skupina = []; }
      zoznam.push({ druh: "otazky", otazky: [otazka], nazov: blok.nazov });
    }
    if (skupina.length) zoznam.push({ druh: "otazky", otazky: skupina, nazov: blok.nazov });
  }

  zoznam.push({ druh: "anketa", blok: dotaznik.bloky.find((b) => b.ulozisko === "anketa") });
  zoznam.push({ druh: "kontakt", blok: dotaznik.bloky.find((b) => b.ulozisko === "kontakty") });
  return zoznam;
}

/* ---------- obrazovky ---------- */

function novyStav(pismeno) {
  return {
    id: crypto.randomUUID(),
    blok: pismeno,
    odpovede: {}, anketa: {}, kontakt: {},
    poradia: {},
    krok: -1,          // -1 je úvod
    zaciatok: null,
  };
}

function vycisti() {
  prvky.obsah.replaceChildren();
  prvky.obsah.scrollTo?.(0, 0);
  window.scrollTo(0, 0);
}

function p(znacka, trieda, text) {
  const e = document.createElement(znacka);
  if (trieda) e.className = trieda;
  if (text !== undefined) e.textContent = text;
  return e;
}

function vykresliUvod() {
  vycisti();
  prvky.postup.classList.add("skryte");
  prvky.spat.classList.add("skryte");
  prvky.preskocit.classList.add("skryte");
  prvky.dalej.textContent = "Začať";
  prvky.dalej.disabled = false;

  const obal = p("div", "uvod");
  obal.append(p("h1", null, dotaznik.uvod.nadpis.replace(/\.$/, "")));

  /* Text úvodu je doslovne zo zdroja. Vetu o tom, kto prieskum robí,
     len zvýrazníme, nikdy ju neskrývame ani nezmenšujeme. */
  const AUTORSTVO = "Prieskum pripravuje tím Pavla Zemka, kandidáta na primátora.";
  const odsek = p("p");
  const kde = dotaznik.uvod.text.indexOf(AUTORSTVO);
  if (kde >= 0) {
    odsek.append(dotaznik.uvod.text.slice(0, kde));
    odsek.append(p("strong", null, AUTORSTVO));
    odsek.append(dotaznik.uvod.text.slice(kde + AUTORSTVO.length));
  } else {
    odsek.textContent = dotaznik.uvod.text;
  }
  obal.append(odsek);

  const vek = p("div", "autorstvo");
  vek.append(p("p", null, dotaznik.uvod.vek));
  obal.append(vek);

  if (teren) {
    const kde = p("p", "napoveda", `Terénny režim, tím ${teren.kod}` + (teren.miesto ? `, ${teren.miesto}` : ""));
    obal.append(kde);
  }

  prvky.obsah.append(obal);
  document.title = dotaznik.nazov;
}

function vykresliMiesto() {
  vycisti();
  prvky.postup.classList.add("skryte");
  prvky.spat.classList.add("skryte");
  prvky.preskocit.classList.add("skryte");
  prvky.dalej.textContent = "Ďalej";
  prvky.dalej.disabled = false;

  prvky.obsah.append(p("h2", "otazka", "Kde dnes zbierate?"));
  prvky.obsah.append(p("p", "napoveda", "Vyberie sa raz za zmenu."));

  const zoznam = p("div", "odpovede");
  zoznam.setAttribute("role", "radiogroup");
  zoznam.setAttribute("aria-label", "Miesto zberu");
  for (const miesto of MIESTA) {
    const t = p("button", "odpoved", miesto);
    t.type = "button";
    t.setAttribute("role", "radio");
    t.setAttribute("aria-checked", teren.miesto === miesto ? "true" : "false");
    t.addEventListener("click", () => {
      teren.miesto = miesto;
      try { localStorage.setItem("prieskum-miesto", miesto); } catch { /* súkromné okno */ }
      vykresliMiesto();
    });
    zoznam.append(t);
  }
  prvky.obsah.append(zoznam);
}

function vykresliKrok() {
  const obrazovka = obrazovky[stav.krok];
  vycisti();
  prvky.postup.classList.remove("skryte");
  prvky.spat.classList.remove("skryte");
  prvky.dalej.textContent = obrazovka.druh === "kontakt" ? "Odoslať" : "Ďalej";

  const preskocitelna = obrazovka.druh === "anketa" || obrazovka.druh === "kontakt";
  prvky.preskocit.classList.toggle("skryte", !preskocitelna);

  ukazPostup();

  /* Tlačidlo Ďalej sa nezaškrtáva ako mŕtve. Vypnuté tlačidlo starším
     ľuďom nepovie nič, len ich zastaví. Radšej pustíme klik a povieme,
     čo ešte chýba, a odskočíme na to. */
  const zmena = () => { skryChybu(); ulozisko.ulozRozpracovane(stav).catch(() => {}); };

  switch (obrazovka.druh) {
    case "bateria":
      prvky.obsah.append(vykresliBateriu(obrazovka.bateria, stav, zmena));
      break;
    case "anketa":
      vykresliAnketu(obrazovka.blok, zmena);
      break;
    case "kontakt":
      vykresliKontakt(obrazovka.blok, zmena);
      break;
    default:
      for (const otazka of obrazovka.otazky) {
        prvky.obsah.append(vykresliOtazku(otazka, stav, zmena, ulice));
      }
  }

  prvky.dalej.disabled = false;
  if (stav.zaciatok === null) stav.zaciatok = Date.now();
}

function ukazChybu(sprava, kamOdskocit) {
  skryChybu();
  const oznam = p("div", "chyba");
  oznam.id = "oznam";
  oznam.setAttribute("role", "alert");
  oznam.textContent = sprava;
  prvky.obsah.prepend(oznam);

  const ciel = kamOdskocit
    ? prvky.obsah.querySelector(`[aria-label="${CSS.escape(kamOdskocit)}"]`)
    : null;
  (ciel ?? oznam).scrollIntoView({ block: "center" });
}

function skryChybu() {
  document.getElementById("oznam")?.remove();
}

function vykresliAnketu(blok, zmena) {
  prvky.obsah.append(p("h2", "otazka", "Anketa"));
  const upozornenie = p("div", "chyba");
  upozornenie.textContent = blok.upozornenie;
  prvky.obsah.append(upozornenie);

  for (const otazka of blok.otazky) {
    prvky.obsah.append(p("p", "vyrok__text", otazka.text));
    const zoznam = p("div", "odpovede");
    zoznam.setAttribute("role", "radiogroup");
    zoznam.setAttribute("aria-label", otazka.text);

    const tlacidla = [];
    const obnov = () => {
      for (const [t, moznost] of tlacidla) {
        t.setAttribute("aria-checked", stav.anketa[otazka.stlpec] === moznost ? "true" : "false");
      }
    };

    for (const moznost of otazka.moznosti) {
      const t = p("button", "odpoved", moznost);
      t.type = "button";
      t.setAttribute("role", "radio");
      t.setAttribute("aria-checked", stav.anketa[otazka.stlpec] === moznost ? "true" : "false");
      t.addEventListener("click", () => {
        stav.anketa[otazka.stlpec] = stav.anketa[otazka.stlpec] === moznost ? undefined : moznost;
        obnov();
        zmena();
      });
      tlacidla.push([t, moznost]);
      zoznam.append(t);
    }
    prvky.obsah.append(zoznam);
  }
  zmena();
}

function vykresliKontakt(blok, zmena) {
  prvky.obsah.append(p("h2", "otazka", "Kontakt"));
  prvky.obsah.append(p("p", "napoveda", blok.uvod));

  for (const pole of blok.polia) {
    const stitok = p("label", "stitok", pole.text);
    stitok.htmlFor = "pole-" + pole.id;
    const vstup = p("input", "pole");
    vstup.id = "pole-" + pole.id;
    vstup.type = pole.format === "email" ? "email" : "tel";
    vstup.autocomplete = pole.format === "email" ? "email" : "tel";
    vstup.inputMode = pole.format === "email" ? "email" : "tel";
    vstup.value = stav.kontakt[pole.id] ?? "";
    vstup.addEventListener("input", () => {
      stav.kontakt[pole.id] = vstup.value.trim();
      zmena();
    });
    prvky.obsah.append(stitok, vstup, p("div", "napoveda", " "));
  }

  for (const suhlas of blok.suhlasy) {
    const obal = p("label", "suhlas");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = Boolean(stav.kontakt[suhlas.id]);
    box.addEventListener("change", () => {
      stav.kontakt[suhlas.id] = box.checked;
      zmena();
    });
    obal.append(box, p("span", null, suhlas.text));
    prvky.obsah.append(obal);
  }

  const odkaz = document.createElement("a");
  odkaz.href = "udaje.html";
  odkaz.textContent = "Plné znenie o ochrane údajov";
  const riadok = p("p", "napoveda");
  riadok.append(odkaz);
  prvky.obsah.append(riadok);

  zmena();
}

function ukazPostup() {
  const spolu = obrazovky.length;
  const teraz = stav.krok + 1;
  prvky.postupText.textContent = `${teraz} z ${spolu}`;
  prvky.postupPas.replaceChildren();
  for (let i = 0; i < spolu; i++) {
    prvky.postupPas.append(p("span", "postup__dielik" + (i < teraz ? " postup__dielik--hotovy" : "")));
  }
}

/* ---------- odoslanie ---------- */

function zostavPoziadavky() {
  const poziadavky = [{
    cesta: `${API}/odpovede`,
    telo: {
      id: stav.id,
      zdroj: teren ? "teren" : "web",
      tim_kod: teren ? teren.kod : undefined,
      miesto_zberu: teren ? teren.miesto : undefined,
      rotujuci_blok: stav.blok,
      trvanie_s: stav.zaciatok ? Math.round((Date.now() - stav.zaciatok) / 1000) : null,
      prezyvka: prvky.pasca.value,
      odpovede: stav.odpovede,
    },
  }];

  if (stav.anketa.kandidat || stav.anketa.ucast) {
    poziadavky.push({
      cesta: `${API}/anketa`,
      telo: {
        kandidat: stav.anketa.kandidat ?? null,
        ucast: stav.anketa.ucast ?? null,
        mestska_cast: stav.odpovede.b6q1 ?? null,
        vek: stav.odpovede.b6q2 ?? null,
      },
    });
  }

  const email = (stav.kontakt.email ?? "").trim();
  const telefon = (stav.kontakt.telefon ?? "").trim();
  if ((email || telefon) && stav.kontakt.suhlas_zrebovanie && stav.kontakt.plnolety) {
    poziadavky.push({
      cesta: `${API}/kontakty`,
      telo: {
        email: email || null,
        telefon: telefon || null,
        suhlas_zrebovanie: true,
        suhlas_informacie: Boolean(stav.kontakt.suhlas_informacie),
        plnolety: true,
      },
    });
  }

  return poziadavky;
}

async function odosli() {
  prvky.dalej.disabled = true;
  /* Najprv do fronty, až potom sa skúša odoslať. V opačnom poradí by
     výpadok signálu v nesprávnej chvíli odpoveď stratil. */
  await ulozisko.doFronty(zostavPoziadavky());
  await ulozisko.zabudniRozpracovane();
  vykresliDakujeme();
  ulozisko.odosliFrontu().then(ukazFrontu).catch(() => ukazFrontu());
}

function vykresliDakujeme() {
  const idHotoveho = stav.id;
  vycisti();
  prvky.postup.classList.add("skryte");
  prvky.pata.classList.add("skryte");

  const obal = p("div", "dakujeme");
  obal.append(p("h1", null, "Ďakujeme"));
  obal.append(p("p", null, "Odpovede sú uložené. Výsledky zverejníme po skončení zberu."));
  prvky.obsah.append(obal);

  const bonus = dotaznik.bloky.find((b) => b.typ === "bonus");
  const bonusStav = { odpovede: {}, poradia: {} };
  prvky.obsah.append(p("h2", "otazka", bonus.uvod));

  for (const otazka of bonus.otazky) {
    prvky.obsah.append(vykresliOtazku(otazka, bonusStav, () => {}, ulice));
  }

  const poslat = p("button", "dalej", "Poslať aj toto");
  poslat.type = "button";
  poslat.style.marginTop = "1rem";
  poslat.addEventListener("click", async () => {
    poslat.disabled = true;
    if (Object.keys(bonusStav.odpovede).length > 0) {
      await ulozisko.doFronty([{ cesta: `${API}/odpovede/${idHotoveho}`, sposob: "PATCH", telo: { bonus: bonusStav.odpovede } }]);
      ulozisko.odosliFrontu().then(ukazFrontu).catch(() => {});
    }
    poslat.textContent = "Odoslané, ďakujeme";
  });
  prvky.obsah.append(poslat);

  if (teren) {
    const dalsi = p("button", "dalej", "Ďalší respondent");
    dalsi.type = "button";
    dalsi.style.marginTop = "1rem";
    dalsi.addEventListener("click", zacniOdznova);
    prvky.obsah.append(dalsi);
    naplanujNavrat();
  }
}

/* ---------- terén: ďalší respondent a návrat po nečinnosti ---------- */

let casovacNavratu = null;

function naplanujNavrat() {
  zrusNavrat();
  casovacNavratu = setTimeout(zacniOdznova, 20000);
}

function zrusNavrat() {
  if (casovacNavratu) { clearTimeout(casovacNavratu); casovacNavratu = null; }
}

async function zacniOdznova() {
  zrusNavrat();
  stav = novyStav(await pridelBlok());
  obrazovky = zostavObrazovky(stav.blok);
  prvky.pata.classList.remove("skryte");
  vykresliUvod();
}

/* ---------- fronta na odoslanie ---------- */

async function ukazFrontu() {
  let cakajuce = 0;
  try { cakajuce = await ulozisko.dlzkaFronty(); } catch { /* bez IndexedDB */ }
  prvky.fronta.classList.toggle("skryte", cakajuce === 0);
  prvky.fronta.textContent = `Čaká na odoslanie: ${cakajuce}. Odoslať teraz`;
}

prvky.fronta.addEventListener("click", async () => {
  prvky.fronta.textContent = "Odosielam…";
  await ulozisko.odosliFrontu().catch(() => {});
  ukazFrontu();
});

window.addEventListener("online", () => { ulozisko.odosliFrontu().then(ukazFrontu).catch(() => {}); });

/* ---------- pohyb medzi obrazovkami ---------- */

prvky.dalej.addEventListener("click", () => {
  if (stav.krok === -1 && teren && !teren.miesto) { vykresliMiesto(); stav.krok = -0.5; return; }
  if (stav.krok === -0.5) {
    if (!teren.miesto) { ukazChybu("Vyberte miesto zberu.", "Miesto zberu"); return; }
    stav.krok = 0; vykresliKrok(); return;
  }
  if (stav.krok === -1) { stav.krok = 0; vykresliKrok(); return; }

  const obrazovka = obrazovky[stav.krok];
  const cochyba = obrazovka.druh === "otazky" || obrazovka.druh === "bateria"
    ? chyba(obrazovka.druh === "bateria" ? { bateria: obrazovka.bateria } : obrazovka, stav)
    : chybaNaKontakte(obrazovka);

  if (cochyba) {
    ukazChybu(cochyba.sprava, cochyba.text ?? null);
    return;
  }

  if (obrazovka.druh === "kontakt") { odosli(); return; }
  stav.krok = Math.min(stav.krok + 1, obrazovky.length - 1);
  vykresliKrok();
});

function chybaNaKontakte(obrazovka) {
  if (obrazovka.druh !== "kontakt") return null;
  const maKontakt = (stav.kontakt.email ?? "") !== "" || (stav.kontakt.telefon ?? "") !== "";
  if (!maKontakt) return null;
  if (!stav.kontakt.suhlas_zrebovanie) {
    return { sprava: "Bez zaškrtnutia prvého políčka kontakt neuložíme. Dotazník sa dá odoslať aj bez kontaktu, stačí Preskočiť." };
  }
  if (!stav.kontakt.plnolety) {
    return { sprava: "Do žrebovania môžeme zaradiť len človeka, ktorý má 18 a viac rokov." };
  }
  return null;
}

prvky.spat.addEventListener("click", () => {
  if (stav.krok <= 0) { stav.krok = -1; vykresliUvod(); return; }
  stav.krok -= 1;
  vykresliKrok();
});

prvky.preskocit.addEventListener("click", () => {
  const obrazovka = obrazovky[stav.krok];
  if (obrazovka.druh === "anketa") stav.anketa = {};
  if (obrazovka.druh === "kontakt") { stav.kontakt = {}; odosli(); return; }
  stav.krok += 1;
  vykresliKrok();
});

document.addEventListener("keydown", (u) => {
  if (u.key === "Enter" && u.target.tagName !== "TEXTAREA" && !prvky.dalej.disabled) {
    prvky.dalej.click();
  }
});

if (teren) document.addEventListener("pointerdown", () => { if (casovacNavratu) naplanujNavrat(); });

/* ---------- štart ---------- */

async function pridelBlok() {
  const pismena = dotaznik.bloky.filter((b) => b.typ === "rotujuci").map((b) => b.pismeno);
  try {
    const odpoved = await fetch(`${API}/blok`, { signal: AbortSignal.timeout(4000) });
    if (odpoved.ok) {
      const { blok } = await odpoved.json();
      if (pismena.includes(blok)) return blok;
    }
  } catch { /* bez signálu sa vyberie náhodne, tak to má byť */ }
  return pismena[Math.floor(Math.random() * pismena.length)];
}

async function start() {
  try {
    nastavZvacsenie(localStorage.getItem("prieskum-vacsie-pismo") === "1");
  } catch { /* súkromné okno */ }

  teren = zistiTeren();

  const [d, u] = await Promise.all([
    fetch("data/questions.json").then((o) => o.json()),
    fetch("data/ulice.json").then((o) => o.json()).catch(() => ({ ulice: [] })),
  ]);
  dotaznik = d;
  ulice = u.ulice ?? [];

  stav = novyStav(await pridelBlok());
  obrazovky = zostavObrazovky(stav.blok);

  prvky.dalej.disabled = false;
  vykresliUvod();
  ukazFrontu();
  ulozisko.odosliFrontu().then(ukazFrontu).catch(() => {});

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

start().catch((problem) => {
  prvky.obsah.replaceChildren();
  const oznam = document.createElement("div");
  oznam.className = "chyba";
  oznam.setAttribute("role", "alert");
  oznam.textContent = "Dotazník sa nepodarilo načítať. Skúste stránku obnoviť.";
  prvky.obsah.append(oznam);
  prvky.dalej.textContent = "Skúsiť znova";
  prvky.dalej.disabled = false;
  prvky.dalej.addEventListener("click", () => location.reload(), { once: true });
  console.error(problem);
});
