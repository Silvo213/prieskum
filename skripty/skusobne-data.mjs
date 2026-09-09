/* Naplní bežiaci prieskum vymyslenými odpoveďami, aby sa dala vyskúšať
   správa prieskumu. Nikdy to nespúšťaj proti ostrej databáze.

   Spustenie: npm run skusobne -- http://localhost:8123 60 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOTAZNIK = JSON.parse(fs.readFileSync(path.join(KOREN, "web", "data", "questions.json"), "utf8"));

const ADRESA = process.argv[2] ?? "http://localhost:8123";
const KOLKO = Number(process.argv[3] ?? 60);

const nahodne = (pole) => pole[Math.floor(Math.random() * pole.length)];

const HNEVA = [
  "Rozbité chodníky, po ktorých sa nedá prejsť s kočíkom.",
  "Že sa roky nič nedeje s plavárňou.",
  "Neporiadok okolo kontajnerov na sídlisku.",
  "Doprava cez mesto, keď sa ide do práce.",
  "Nedostatok parkovacích miest pri dome.",
  "Zanedbané budovy v centre.",
  "Že mladí odchádzajú a nemajú sa kam vrátiť.",
  "Kosenie, ktoré príde vždy neskoro.",
];
const ULICA = [
  "Opraviť chodník pred vchodom.",
  "Doplniť lampy, večer tam nie je vidieť.",
  "Vyriešiť státie, autá stoja na tráve.",
  "Osadiť lavičky a odpadkový kôš.",
  "Prerezať stromy, tienia do okien.",
];

function odpovede(pismeno) {
  const von = {};
  for (const blok of DOTAZNIK.bloky) {
    if (blok.ulozisko !== "odpovede" || blok.typ === "bonus") continue;
    if (blok.typ === "rotujuci" && blok.pismeno !== pismeno) continue;

    if (blok.format === "bateria") {
      for (const vyrok of blok.vyroky) von[vyrok.id] = nahodne(blok.skala);
      continue;
    }
    for (const otazka of blok.otazky ?? []) {
      if (otazka.format === "jedna") von[otazka.id] = nahodne(otazka.moznosti);
      else if (otazka.format === "viac") von[otazka.id] = [...otazka.moznosti].sort(() => Math.random() - 0.5).slice(0, otazka.pocet);
      else if (otazka.id === "b1q3") von[otazka.id] = nahodne(HNEVA);
      else if (otazka.id === "b4q1") von[otazka.id] = nahodne(ULICA);
      else if (otazka.format === "ulica") von[otazka.id] = nahodne(["Kollárova", "Priekopská", "Ľaukovská", "Východná", "Sučianska"]);
    }
  }
  return von;
}

const moznosti = (id) => {
  for (const blok of DOTAZNIK.bloky) {
    for (const otazka of blok.otazky ?? []) if (otazka.id === id) return otazka.moznosti;
  }
  return [];
};

async function posli(cesta, telo) {
  const o = await fetch(ADRESA + cesta, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(telo),
  });
  if (!o.ok) console.log("  neprešlo:", cesta, o.status, (await o.text()).slice(0, 120));
  return o.ok;
}

let hotovych = 0;
for (let i = 0; i < KOLKO; i++) {
  const { blok } = await fetch(`${ADRESA}/api/blok`).then((o) => o.json());
  const veci = odpovede(blok);

  const ok = await posli("/api/odpovede", {
    id: crypto.randomUUID(),
    /* Z webu smú byť len tri za deň z jedného zariadenia, tak sa to
       nastaví presne tak, aby bolo v prehľade vidieť oba zdroje. */
    zdroj: i < 3 ? "web" : "teren",
    tim_kod: "TIM" + (1 + Math.floor(Math.random() * 4)),
    miesto_zberu: nahodne(["námestie", "trhovisko", "poliklinika", "stanica", "Ľadoveň", "Košúty"]),
    rotujuci_blok: blok,
    trvanie_s: 150 + Math.floor(Math.random() * 220),
    odpovede: veci,
  });
  if (ok) hotovych++;

  if (Math.random() < 0.7) {
    await posli("/api/anketa", {
      kandidat: nahodne(moznosti("b7q1")),
      ucast: nahodne(moznosti("b7q2")),
      mestska_cast: veci.b6q1 ?? null,
      vek: veci.b6q2 ?? null,
    });
  }
  if (Math.random() < 0.5) {
    await posli("/api/kontakty", {
      email: `skusobny${i}@example.sk`,
      suhlas_zrebovanie: true,
      suhlas_informacie: Math.random() < 0.5,
      plnolety: true,
    });
  }
}

console.log(`Vložených ${hotovych} skúšobných dotazníkov do ${ADRESA}.`);
console.log("Toto sú vymyslené dáta. Pred ostrým zberom databázu zmaž.");
