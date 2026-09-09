/* Správa prieskumu. Všetko beží proti tomu istému API ako dotazník. */

const API = "api/admin";
const obsah = document.getElementById("obsah");
const zalozky = document.getElementById("zalozky");
const odhlasit = document.getElementById("odhlasit");

let anketaOdomknuta = false;

/* ---------- základ ---------- */

function p(znacka, trieda, text) {
  const e = document.createElement(znacka);
  if (trieda) e.className = trieda;
  if (text !== undefined) e.textContent = text;
  return e;
}

async function ziadaj(cesta, moznosti = {}) {
  const odpoved = await fetch(API + cesta, {
    ...moznosti,
    headers: moznosti.body ? { "Content-Type": "application/json" } : {},
  });
  const telo = await odpoved.json().catch(() => ({}));
  if (!odpoved.ok) {
    throw new Error(telo.chyba ?? `Server odpovedal ${odpoved.status}.`);
  }
  return telo;
}

function chybovaHlaska(sprava) {
  const oznam = p("div", "chyba", sprava);
  oznam.setAttribute("role", "alert");
  obsah.prepend(oznam);
}

function cisla(hodnota) {
  return new Intl.NumberFormat("sk-SK").format(hodnota);
}

function trvanie(sekundy) {
  if (sekundy === null || sekundy === undefined) return "zatiaľ nič";
  return `${Math.floor(sekundy / 60)} min ${String(sekundy % 60).padStart(2, "0")} s`;
}

/* ---------- prihlásenie ---------- */

function vykresliPrihlasenie() {
  zalozky.classList.add("skryte");
  odhlasit.classList.add("skryte");
  obsah.replaceChildren();

  const obal = p("form", "prihlasenie");
  obal.append(p("h1", null, "Správa prieskumu"));

  const meno = p("input", "pole");
  meno.type = "text"; meno.placeholder = "Meno"; meno.autocomplete = "username"; meno.required = true;
  const heslo = p("input", "pole");
  heslo.type = "password"; heslo.placeholder = "Heslo"; heslo.autocomplete = "current-password"; heslo.required = true;

  const poslat = p("button", "dalej", "Prihlásiť");
  poslat.type = "submit";

  obal.addEventListener("submit", async (u) => {
    u.preventDefault();
    poslat.disabled = true;
    try {
      await ziadaj("/prihlasenie", { method: "POST", body: JSON.stringify({ meno: meno.value, heslo: heslo.value }) });
      spusti();
    } catch (problem) {
      chybovaHlaska(problem.message);
      poslat.disabled = false;
    }
  });

  obal.append(meno, heslo, poslat);
  obsah.append(obal);
  meno.focus();
}

odhlasit.addEventListener("click", async () => {
  await ziadaj("/odhlasenie", { method: "POST" }).catch(() => {});
  vykresliPrihlasenie();
});

/* ---------- prehľad ---------- */

async function panelPrehlad() {
  const d = await ziadaj("/prehlad");
  obsah.replaceChildren();
  obsah.append(p("h1", null, "Prehľad"));

  const karty = p("div", "karty");
  const karta = (cislo, popis, hlavna = false) => {
    const k = p("div", "karta" + (hlavna ? " karta--hlavna" : ""));
    /* Dlhší údaj ako „4 min 20 s" sa inak zalomí uprostred. */
    k.append(p("div", "karta__cislo" + (String(cislo).length > 6 ? " karta__cislo--kratsie" : ""), cislo));
    k.append(p("div", "karta__popis", popis));
    return k;
  };
  karty.append(
    karta(cisla(d.spolu), `z cieľa ${cisla(d.cielSpolu)} dotazníkov`, true),
    karta(cisla(d.dnes), "dnes"),
    karta(cisla(d.kontaktov), "kontaktov do žrebovania"),
    karta(trvanie(d.trvanieMedian), "medián vyplnenia"),
    karta(cisla(d.podozrive), "označených ako podozrivé"),
    karta(cisla(d.neplatne), "označených ako neplatné"),
  );
  obsah.append(karty);

  obsah.append(p("h2", null, "Naplnenosť tematických blokov"));
  const najviac = Math.max(1, ...Object.values(d.bloky));
  for (const [pismeno, pocet] of Object.entries(d.bloky)) {
    const riadok = p("div", "pas");
    riadok.append(p("span", "pas__meno", pismeno));
    const ciara = p("div", "pas__ciara");
    const vypln = p("div", "pas__vypln" + (pocet < najviac * 0.6 ? " pas__vypln--malo" : ""));
    vypln.style.width = `${Math.round((pocet / najviac) * 100)}%`;
    ciara.append(vypln);
    riadok.append(ciara, p("span", "pas__cislo", cisla(pocet)));
    obsah.append(riadok);
  }

  const rozpady = [
    ["Odkiaľ", d.podlaZdroja], ["Podľa tímu", d.podlaTimu], ["Podľa miesta zberu", d.podlaMiesta],
    ["Podľa mestskej časti", d.podlaCasti], ["Podľa veku", d.podlaVeku],
  ];
  for (const [nazov, riadky] of rozpady) {
    if (!riadky.length) continue;
    obsah.append(p("h2", null, nazov));
    obsah.append(tabulka(["", "počet"], riadky.map((r) => [r.kluc, cisla(r.pocet)])));
  }
}

function tabulka(hlavicka, riadky) {
  const t = p("table", "tabulka");
  const hlava = p("thead");
  const riadokHlavy = p("tr");
  for (const bunka of hlavicka) riadokHlavy.append(p("th", null, bunka));
  hlava.append(riadokHlavy);
  const telo = p("tbody");
  for (const riadok of riadky) {
    const r = p("tr");
    riadok.forEach((bunka, i) => r.append(p("td", i > 0 ? "cislo" : null, bunka)));
    telo.append(r);
  }
  t.append(hlava, telo);
  return t;
}

/* ---------- otvorené odpovede ---------- */

async function panelOtvorene(hladat = "", lenCitaty = false) {
  obsah.replaceChildren();
  obsah.append(p("h1", null, "Otvorené odpovede"));

  const riadok = p("div", "riadok");
  const pole = p("input", "pole");
  pole.type = "search"; pole.placeholder = "Hľadať v texte"; pole.value = hladat;
  const hladatTlacidlo = p("button", "spat", "Hľadať");
  const citatyTlacidlo = p("button", "spat", lenCitaty ? "Ukázať všetky" : "Len označené");
  riadok.append(pole, hladatTlacidlo, citatyTlacidlo);
  obsah.append(riadok);

  hladatTlacidlo.addEventListener("click", () => panelOtvorene(pole.value, lenCitaty));
  pole.addEventListener("keydown", (u) => { if (u.key === "Enter") panelOtvorene(pole.value, lenCitaty); });
  citatyTlacidlo.addEventListener("click", () => panelOtvorene(pole.value, !lenCitaty));

  const d = await ziadaj(`/otvorene?hladat=${encodeURIComponent(hladat)}&citaty=${lenCitaty ? 1 : 0}&limit=200`);
  obsah.append(p("p", "napoveda", `Nájdených ${cisla(d.pocet)}.`));

  /* Hromadné označenie: keď sa niekto v teréne zabaví a naklepe sériu
     nezmyslov, označia sa naraz a z prehľadu aj zo zoznamu vypadnú. */
  /* Jeden dotazník má viac otvorených odpovedí, takže sa v zozname objaví
     viackrát. Neplatnosť sa označuje na celý dotazník, preto sa zaškrtnutia
     tej istej odpovede držia spolu. */
  const vybrate = new Set();
  const zaskrtnutia = new Map();
  const lista = p("div", "riadok");
  const pocitadlo = p("p", "napoveda", "Vybraných dotazníkov: 0");
  const hromadne = p("button", "spat", "Označiť vybrané ako neplatné");
  hromadne.disabled = true;
  lista.append(pocitadlo, hromadne);
  obsah.append(lista);

  const prepocitaj = () => {
    pocitadlo.textContent = `Vybraných dotazníkov: ${vybrate.size}`;
    hromadne.disabled = vybrate.size === 0;
    for (const [id, boxy] of zaskrtnutia) {
      for (const box of boxy) box.checked = vybrate.has(id);
    }
  };

  hromadne.addEventListener("click", async () => {
    if (!confirm(`Označiť ${vybrate.size} dotazníkov ako neplatné? Vypadnú z prehľadu aj z Martinského zoznamu.`)) return;
    await ziadaj("/neplatne", { method: "POST", body: JSON.stringify({ id: [...vybrate], neplatne: true }) });
    panelOtvorene(hladat, lenCitaty);
  });

  for (const zaznam of d.odpovede) {
    const karta = p("div", "citat" + (zaznam.citat ? " citat--oznaceny" : ""));
    karta.append(p("p", "citat__text", `\u201E${zaznam.text}\u201C`));

    const udaje = p("div", "citat__udaje");
    const popis = [zaznam.otazka, zaznam.mestska_cast, zaznam.vek, zaznam.zdroj, zaznam.kedy]
      .filter(Boolean).join(" · ");
    udaje.append(p("span", null, popis));
    if (zaznam.podozrive) udaje.append(p("strong", null, "podozrivé"));
    if (zaznam.neplatne) udaje.append(p("strong", null, "neplatné"));

    const hviezda = p("button", "hviezda", zaznam.citat ? "Označené ako citát" : "Označiť ako citát");
    hviezda.type = "button";
    hviezda.setAttribute("aria-pressed", zaznam.citat ? "true" : "false");
    hviezda.addEventListener("click", async () => {
      const nove = hviezda.getAttribute("aria-pressed") !== "true";
      await ziadaj("/citat", {
        method: "POST",
        body: JSON.stringify({ odpoved_id: zaznam.odpoved_id, otazka_id: zaznam.otazka_id, oznacene: nove }),
      });
      hviezda.setAttribute("aria-pressed", nove ? "true" : "false");
      hviezda.textContent = nove ? "Označené ako citát" : "Označiť ako citát";
      karta.classList.toggle("citat--oznaceny", nove);
    });
    udaje.append(hviezda);

    if (zaznam.neplatne) {
      const vratit = p("button", "hviezda", "Vrátiť medzi platné");
      vratit.type = "button";
      vratit.addEventListener("click", async () => {
        await ziadaj("/neplatne", { method: "POST", body: JSON.stringify({ id: [zaznam.odpoved_id], neplatne: false }) });
        panelOtvorene(hladat, lenCitaty);
      });
      udaje.append(vratit);
    } else {
      const stitok = p("label", "hviezda");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.style.marginRight = ".4rem";
      box.addEventListener("change", () => {
        box.checked ? vybrate.add(zaznam.odpoved_id) : vybrate.delete(zaznam.odpoved_id);
        prepocitaj();
      });
      if (!zaskrtnutia.has(zaznam.odpoved_id)) zaskrtnutia.set(zaznam.odpoved_id, []);
      zaskrtnutia.get(zaznam.odpoved_id).push(box);
      stitok.append(box, document.createTextNode("vybrať dotazník"));
      udaje.append(stitok);
    }

    karta.append(udaje);
    obsah.append(karta);
  }
}

/* ---------- Martinský zoznam ---------- */

async function panelZoznam() {
  const d = await ziadaj("/zoznam");
  obsah.replaceChildren();
  obsah.append(p("h1", null, "Martinský zoznam"));
  obsah.append(p("p", "napoveda", `Zostavené z ${cisla(d.zoOdpovedi)} platných odpovedí.`));

  const odkazy = p("div", "odkazy");
  const odkaz = (adresa, popis, znacka) => {
    const a = document.createElement("a");
    a.className = "odkaz"; a.href = API + adresa; a.target = "_blank"; a.rel = "noopener";
    a.append(document.createTextNode(popis), p("span", null, znacka));
    return a;
  };
  odkazy.append(odkaz("/zoznam.html", "Stránka na grafiku", "HTML"));
  obsah.append(odkazy);

  obsah.append(p("h2", null, "Čo má mesto riešiť ako prvé"));
  obsah.append(tabulka(["", "počet"], d.coPrve.map((r, i) => [`${i + 1}. ${r.vec}`, cisla(r.pocet)])));

  obsah.append(p("h2", null, "Keby boli peniaze len na tri veľké veci"));
  obsah.append(tabulka(["", "počet"], d.trojeVelke.map((r, i) => [`${i + 1}. ${r.vec}`, cisla(r.pocet)])));

  obsah.append(p("h2", null, "Tri veci na každú mestskú časť"));
  for (const [cast, veci] of Object.entries(d.poCastiach)) {
    obsah.append(p("h3", null, cast));
    obsah.append(tabulka(["", "počet"], veci.map((v, i) => [`${i + 1}. ${v.vec}`, cisla(v.pocet)])));
  }
}

/* ---------- exporty ---------- */

function panelExporty() {
  obsah.replaceChildren();
  obsah.append(p("h1", null, "Exporty"));
  obsah.append(p("p", "napoveda",
    "Tri tabuľky, tri samostatné súbory. Nikdy sa nesťahujú spolu a nikdy sa nespájajú. " +
    "Anketa a kontakty vychádzajú v náhodnom poradí."));

  const skupiny = [
    ["Odpovede z dotazníka", "odpovede"],
    ["Anketa", "anketa"],
    ["Kontakty", "kontakty"],
    ["Označené citáty", "citaty"],
  ];
  const odkazy = p("div", "odkazy");
  for (const [popis, tabulka] of skupiny) {
    for (const format of ["csv", "xlsx"]) {
      const a = document.createElement("a");
      a.className = "odkaz";
      a.href = `${API}/export/${tabulka}.${format}`;
      a.append(document.createTextNode(popis), p("span", null, format.toUpperCase()));
      odkazy.append(a);
    }
  }
  obsah.append(odkazy);
}

/* ---------- žrebovanie ---------- */

function panelZrebovanie() {
  obsah.replaceChildren();
  obsah.append(p("h1", null, "Žrebovanie"));
  obsah.append(p("p", "napoveda",
    "Seed vyhláste pred kamerou a až potom ho sem napíšte. Rovnaký seed a rovnakí " +
    "účastníci dajú vždy rovnaký výsledok, takže sa dá zopakovať a overiť."));

  const riadok = p("div", "riadok");
  const seed = p("input", "pole");
  seed.type = "text"; seed.placeholder = "Seed vyhlásený pred kamerou";
  const pocet = p("input", "pole");
  pocet.type = "number"; pocet.value = "10"; pocet.min = "1"; pocet.max = "50"; pocet.style.maxWidth = "7rem";
  riadok.append(seed, pocet);
  obsah.append(riadok);

  const skusit = p("button", "spat", "Ukázať výsledok");
  const naostro = p("button", "dalej", "Vyžrebovať naostro a zapísať");
  const tlacidla = p("div", "riadok");
  tlacidla.append(skusit, naostro);
  obsah.append(tlacidla);

  const vysledok = p("div");
  obsah.append(vysledok);

  const zrebuj = async (zapisat) => {
    vysledok.replaceChildren();
    try {
      const d = await ziadaj("/zrebovanie", {
        method: "POST",
        body: JSON.stringify({ seed: seed.value, pocet: Number(pocet.value), naostro: zapisat }),
      });
      vysledok.append(p("h2", null, zapisat ? "Vyžrebované a zapísané" : "Skúšobný výsledok"));
      vysledok.append(p("p", "napoveda", `Seed „${d.seed}", účastníkov ${cisla(d.ucastnikov)}.`));
      vysledok.append(tabulka(["kontakt", ""], d.vyhercovia.map((v, i) => [`${i + 1}. ${v.kontakt}`, ""])));
      vysledok.append(p("p", "napoveda",
        "Krstné meno a mestskú časť tu nenájdeš. Kontakt ich neobsahuje a je to zámer. " +
        "Doplnia sa až od výhercu, keď mu napíšeš."));
    } catch (problem) {
      vysledok.append(p("div", "chyba", problem.message));
    }
  };

  skusit.addEventListener("click", () => zrebuj(false));
  naostro.addEventListener("click", () => {
    if (confirm("Zapísať do zrebovanie.log? Toto je záznam, ktorý sa dokladá.")) zrebuj(true);
  });
}

/* ---------- anketa ---------- */

async function panelAnketa() {
  obsah.replaceChildren();
  obsah.append(p("h1", null, "Anketa"));

  const varovanie = p("div", "varovanie", "Tieto čísla sa nezverejňujú a neposielajú nikomu.");
  obsah.append(varovanie);

  if (!anketaOdomknuta) {
    const obal = p("form", "prihlasenie");
    obal.append(p("p", "napoveda", "Anketa je za druhým heslom."));
    const heslo = p("input", "pole");
    heslo.type = "password"; heslo.placeholder = "Druhé heslo"; heslo.autocomplete = "off";
    const poslat = p("button", "dalej", "Odomknúť");
    poslat.type = "submit";
    obal.append(heslo, poslat);
    obal.addEventListener("submit", async (u) => {
      u.preventDefault();
      try {
        await ziadaj("/anketa/odomknut", { method: "POST", body: JSON.stringify({ heslo: heslo.value }) });
        anketaOdomknuta = true;
        panelAnketa();
      } catch (problem) {
        obal.append(p("div", "chyba", problem.message));
      }
    });
    obsah.append(obal);
    heslo.focus();
    return;
  }

  const d = await ziadaj("/anketa");
  obsah.append(p("p", "napoveda", `Odpovedí ${cisla(d.spolu)}.`));
  obsah.append(p("h2", null, "Koho by volili"));
  obsah.append(tabulka(["", "počet"], d.kandidati.map((r) => [r.kluc, cisla(r.pocet)])));
  obsah.append(p("h2", null, "Či pôjdu voliť"));
  obsah.append(tabulka(["", "počet"], d.ucast.map((r) => [r.kluc, cisla(r.pocet)])));
}

/* ---------- prepínanie ---------- */

const PANELY = {
  prehlad: panelPrehlad,
  otvorene: () => panelOtvorene(),
  zoznam: panelZoznam,
  exporty: panelExporty,
  zrebovanie: panelZrebovanie,
  anketa: panelAnketa,
};

zalozky.addEventListener("click", async (u) => {
  const tlacidlo = u.target.closest(".zalozka");
  if (!tlacidlo) return;
  for (const z of zalozky.querySelectorAll(".zalozka")) {
    z.setAttribute("aria-current", z === tlacidlo ? "true" : "false");
  }
  location.hash = tlacidlo.dataset.panel;
  try {
    await PANELY[tlacidlo.dataset.panel]();
  } catch (problem) {
    obsah.replaceChildren();
    chybovaHlaska(problem.message);
    if (problem.message.includes("prihlás")) vykresliPrihlasenie();
  }
});

async function spusti() {
  const kto = await ziadaj("/kto").catch(() => ({ prihlaseny: false }));
  if (!kto.prihlaseny) {
    vykresliPrihlasenie();
    return;
  }
  anketaOdomknuta = Boolean(kto.anketaOdomknuta);
  zalozky.classList.remove("skryte");
  odhlasit.classList.remove("skryte");
  const zvolena = location.hash.slice(1);
  const tlacidlo = zalozky.querySelector(`[data-panel="${PANELY[zvolena] ? zvolena : "prehlad"}"]`);
  tlacidlo.click();
}

spusti();
