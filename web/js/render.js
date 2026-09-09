/* Vykresľovanie obrazoviek dotazníka.
   Všetko sa rendruje z data/questions.json, v tomto súbore nie je
   ani jedna otázka ani jedna možnosť napísaná ručne. */

export const ZNAK = {
  jedna: "jedna", viac: "viac", text: "text", ulica: "ulica", bateria: "bateria",
};

function prvok(znacka, trieda, text) {
  const e = document.createElement(znacka);
  if (trieda) e.className = trieda;
  if (text !== undefined) e.textContent = text;
  return e;
}

/* Poradie možností sa mieša raz za vyplnenie, nie pri každom návrate späť. */
export function poradie(stav, otazka) {
  if (!otazka.miesat) return otazka.moznosti;
  stav.poradia ??= {};
  if (!stav.poradia[otazka.id]) {
    const kopia = [...otazka.moznosti];
    for (let i = kopia.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [kopia[i], kopia[j]] = [kopia[j], kopia[i]];
    }
    stav.poradia[otazka.id] = kopia;
  }
  return stav.poradia[otazka.id];
}

function nadpisOtazky(otazka) {
  const kus = document.createDocumentFragment();
  kus.append(prvok("h2", "otazka", otazka.text));
  if (otazka.napoveda) kus.append(prvok("p", "napoveda", otazka.napoveda));
  return kus;
}

function tlacidloOdpovede(text, vybrate, rola) {
  const t = prvok("button", "odpoved", text);
  t.type = "button";
  t.setAttribute("role", rola);
  t.setAttribute(rola === "radio" ? "aria-checked" : "aria-pressed", vybrate ? "true" : "false");
  return t;
}

/* jedna z možností */
function vykresliJednu(otazka, stav, zmena) {
  const kus = document.createDocumentFragment();
  kus.append(nadpisOtazky(otazka));

  const zoznam = prvok("div", "odpovede");
  zoznam.setAttribute("role", "radiogroup");
  zoznam.setAttribute("aria-label", otazka.text);

  const tlacidla = [];
  const obnov = () => {
    for (const [t, moznost] of tlacidla) {
      t.setAttribute("aria-checked", stav.odpovede[otazka.id] === moznost ? "true" : "false");
    }
  };

  for (const moznost of poradie(stav, otazka)) {
    const t = tlacidloOdpovede(moznost, stav.odpovede[otazka.id] === moznost, "radio");
    t.addEventListener("click", () => {
      stav.odpovede[otazka.id] = stav.odpovede[otazka.id] === moznost && !otazka.povinne ? undefined : moznost;
      if (stav.odpovede[otazka.id] === undefined) delete stav.odpovede[otazka.id];
      obnov();
      zmena();
    });
    tlacidla.push([t, moznost]);
    zoznam.append(t);
  }
  kus.append(zoznam);
  return kus;
}

/* vyber presne toľko, koľko je v otázke */
function vykresliViac(otazka, stav, zmena) {
  const kus = document.createDocumentFragment();
  kus.append(nadpisOtazky(otazka));

  const vybrate = stav.odpovede[otazka.id] ?? [];
  const pocitadlo = prvok("p", "pocitadlo",
    `Vybrané ${vybrate.length} z ${otazka.pocet}.`);
  kus.append(pocitadlo);

  const zoznam = prvok("div", "odpovede");
  zoznam.setAttribute("role", "group");
  zoznam.setAttribute("aria-label", otazka.text);

  const tlacidla = [];
  const obnov = () => {
    const teraz = stav.odpovede[otazka.id] ?? [];
    for (const [t, moznost] of tlacidla) {
      t.setAttribute("aria-pressed", teraz.includes(moznost) ? "true" : "false");
    }
    pocitadlo.textContent = `Vybrané ${teraz.length} z ${otazka.pocet}.`;
  };

  for (const moznost of poradie(stav, otazka)) {
    const t = tlacidloOdpovede(moznost, vybrate.includes(moznost), "checkbox");
    t.addEventListener("click", () => {
      const teraz = stav.odpovede[otazka.id] ?? [];
      if (teraz.includes(moznost)) {
        stav.odpovede[otazka.id] = teraz.filter((m) => m !== moznost);
      } else if (teraz.length < otazka.pocet) {
        stav.odpovede[otazka.id] = [...teraz, moznost];
      } else {
        return;   /* viac ako toľko sa vybrať nedá, tlačidlo mlčí */
      }
      obnov();
      zmena();
    });
    tlacidla.push([t, moznost]);
    zoznam.append(t);
  }
  kus.append(zoznam);
  return kus;
}

/* voľný text */
function vykresliText(otazka, stav, zmena) {
  const kus = document.createDocumentFragment();
  kus.append(nadpisOtazky(otazka));

  const pole = prvok("textarea", "pole");
  pole.id = "pole-" + otazka.id;
  pole.maxLength = otazka.maxZnakov ?? 300;
  pole.value = stav.odpovede[otazka.id] ?? "";
  pole.setAttribute("aria-label", otazka.text);

  const zostava = prvok("p", "zostava");
  const prepocitaj = () => {
    zostava.textContent = `Zostáva ${pole.maxLength - pole.value.length} znakov.`;
  };
  prepocitaj();

  pole.addEventListener("input", () => {
    stav.odpovede[otazka.id] = pole.value.trim() === "" ? undefined : pole.value;
    if (stav.odpovede[otazka.id] === undefined) delete stav.odpovede[otazka.id];
    prepocitaj();
    zmena();
  });

  kus.append(pole, zostava);
  return kus;
}

/* ulica s našepkávačom zo zoznamu, ktorý je v aplikácii */
function vykresliUlicu(otazka, stav, zmena, ulice) {
  const kus = document.createDocumentFragment();
  kus.append(nadpisOtazky(otazka));

  const pole = prvok("input", "pole");
  pole.type = "text";
  pole.id = "pole-" + otazka.id;
  pole.autocomplete = "off";
  pole.setAttribute("list", "zoznam-ulic");
  pole.setAttribute("aria-label", otazka.text);
  pole.value = stav.odpovede[otazka.id] ?? "";

  const napoveda = prvok("datalist");
  napoveda.id = "zoznam-ulic";
  for (const ulica of ulice) napoveda.append(new Option(ulica, ulica));

  pole.addEventListener("input", () => {
    stav.odpovede[otazka.id] = pole.value.trim() === "" ? undefined : pole.value.trim();
    if (stav.odpovede[otazka.id] === undefined) delete stav.odpovede[otazka.id];
    zmena();
  });

  kus.append(pole, napoveda);
  return kus;
}

/* batéria výrokov: výrok a pod ním tri tlačidlá vedľa seba */
export function vykresliBateriu(blok, stav, zmena) {
  const kus = document.createDocumentFragment();
  kus.append(prvok("h2", "otazka", blok.nazov));
  kus.append(prvok("p", "napoveda", "Ku každej vete povedzte, či s ňou súhlasíte."));

  const vyroky = [...blok.vyroky];
  if (blok.miesat) {
    stav.poradia ??= {};
    if (!stav.poradia[blok.id]) {
      const kopia = [...vyroky];
      for (let i = kopia.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [kopia[i], kopia[j]] = [kopia[j], kopia[i]];
      }
      stav.poradia[blok.id] = kopia.map((v) => v.id);
    }
    vyroky.sort((a, b) => stav.poradia[blok.id].indexOf(a.id) - stav.poradia[blok.id].indexOf(b.id));
  }

  for (const vyrok of vyroky) {
    const obal = prvok("div", "vyrok");
    obal.append(prvok("p", "vyrok__text", vyrok.text));

    const volby = prvok("div", "vyrok__volby");
    volby.setAttribute("role", "radiogroup");
    volby.setAttribute("aria-label", vyrok.text);

    const tlacidla = [];
    const obnov = () => {
      for (const [t, stupen] of tlacidla) {
        t.setAttribute("aria-checked", stav.odpovede[vyrok.id] === stupen ? "true" : "false");
      }
    };

    for (const stupen of blok.skala) {
      const t = tlacidloOdpovede(stupen, stav.odpovede[vyrok.id] === stupen, "radio");
      t.addEventListener("click", () => { stav.odpovede[vyrok.id] = stupen; obnov(); zmena(); });
      tlacidla.push([t, stupen]);
      volby.append(t);
    }
    obal.append(volby);
    kus.append(obal);
  }
  return kus;
}

export function vykresliOtazku(otazka, stav, zmena, ulice) {
  switch (otazka.format) {
    case ZNAK.jedna: return vykresliJednu(otazka, stav, zmena);
    case ZNAK.viac:  return vykresliViac(otazka, stav, zmena);
    case ZNAK.ulica: return vykresliUlicu(otazka, stav, zmena, ulice);
    default:         return vykresliText(otazka, stav, zmena);
  }
}

/* Je obrazovka zodpovedaná natoľko, aby sa dalo ísť ďalej? */
export function hotova(obrazovka, stav) {
  if (obrazovka.bateria) {
    return obrazovka.bateria.vyroky.every((v) => stav.odpovede[v.id] !== undefined);
  }
  return (obrazovka.otazky ?? []).every((o) => {
    if (!o.povinne) return true;
    const h = stav.odpovede[o.id];
    if (h === undefined || h === "") return false;
    if (o.format === ZNAK.viac) return h.length === o.pocet;
    return true;
  });
}
