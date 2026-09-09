/* Zmaže tabuľku kontaktov. Termín je 30. november 2026, viď DATA.md.
   Spustenie:  npm run vymaz-kontakty -- --naozaj
   Bez prepínača --naozaj len ukáže, čo by sa zmazalo. */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUBOR = process.env.PRIESKUM_UDAJE
  ? path.join(process.env.PRIESKUM_UDAJE, "prieskum.sqlite")
  : path.join(KOREN, "udaje", "prieskum.sqlite");

if (!fs.existsSync(SUBOR)) {
  console.error(`Databázu som nenašiel: ${SUBOR}`);
  console.error("Cestu vieš určiť premennou PRIESKUM_UDAJE.");
  process.exit(1);
}

const naozaj = process.argv.includes("--naozaj");
const db = new DatabaseSync(SUBOR);
const { pocet } = db.prepare("SELECT count(*) AS pocet FROM kontakty").get();

if (!naozaj) {
  console.log(`V tabuľke kontaktov je ${pocet} záznamov.`);
  console.log("Nič som nezmazal. Keď to naozaj chceš, spusti to znova s --naozaj.");
  db.close();
  process.exit(0);
}

/* Záloha pred zmazaním, aby sa dalo doložiť, koľko ich bolo. Samotné kontakty
   sa do zálohy nedávajú, to by bolo mazanie len naoko. */
const zaznam = path.join(path.dirname(SUBOR), "vymaz-kontaktov.log");
fs.appendFileSync(
  zaznam,
  `${new Date().toISOString()}\tzmazaných kontaktov: ${pocet}\tstroj: ${os.hostname()}\n`,
  "utf8"
);

db.exec("DELETE FROM kontakty");
db.exec("VACUUM");
db.close();

console.log(`Zmazaných kontaktov: ${pocet}`);
console.log(`Zapísané do ${zaznam}`);
console.log("Tabuľka ostáva prázdna, štruktúra sa nemení.");
