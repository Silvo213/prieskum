/* Vygeneruje zoznam martinských ulíc pre našepkávač v otázke 4.2.
   Zdroj: OpenStreetMap cez Overpass API, relácia mesta Martin (okres Martin).
   Spúšťa sa raz pri príprave, výsledok sa commituje. Aplikácia sama nikam nevolá.
   Spustenie: node prieskum-app/skripty/ulice.mjs */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RELACIA = 2183317;                     // Martin, okres Martin
const OBLAST = 3600000000 + RELACIA;
const CIEL = path.join(KOREN, "data", "ulice.json");

const dopyt = `[out:json][timeout:180];
area(${OBLAST})->.mesto;
way(area.mesto)["highway"]["name"];
out tags;`;

const SERVERY = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

async function stiahni() {
  let posledna;
  for (let pokus = 1; pokus <= 3; pokus++) {
    for (const server of SERVERY) {
      try {
        const o = await fetch(server, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "hlavu-hore-martin/1.0 (priprava prieskumu)",
          },
          body: "data=" + encodeURIComponent(dopyt),
        });
        if (o.ok) return o.json();
        posledna = `${server} odpovedal ${o.status}`;
      } catch (chyba) {
        posledna = `${server}: ${chyba.message}`;
      }
      console.log("  neúspech:", posledna);
      await new Promise((r) => setTimeout(r, 3000 * pokus));
    }
  }
  throw new Error("Overpass sa nedá dosiahnuť. Posledná chyba: " + posledna);
}

const { elements } = await stiahni();

/* chodníky, schody a cyklotrasy nie sú adresa, ktorú človek povie */
const NEULICE = new Set(["footway", "path", "steps", "cycleway", "track", "construction", "proposed", "via_ferrata"]);

const mena = new Set();
for (const prvok of elements) {
  const t = prvok.tags ?? {};
  if (NEULICE.has(t.highway)) continue;
  const meno = (t.name ?? "").trim().replace(/\s+/g, " ");
  if (meno) mena.add(meno);
}

const zoradene = [...mena].sort((a, b) => a.localeCompare(b, "sk"));
fs.writeFileSync(
  CIEL,
  JSON.stringify({ zdroj: "OpenStreetMap, relácia " + RELACIA, stiahnute: new Date().toISOString().slice(0, 10), pocet: zoradene.length, ulice: zoradene }, null, 2) + "\n",
  "utf8"
);
console.log(`Ciest s názvom: ${elements.length}, jedinečných ulíc: ${zoradene.length}`);
console.log(`Zapísané do ${path.relative(process.cwd(), CIEL)}`);
