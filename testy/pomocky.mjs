/* Spoločné pomôcky pre testy: spustenie servera a zostavenie platných odpovedí. */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PHP = path.join(os.homedir(), ".local", "php", "php");
export const DOTAZNIK = JSON.parse(fs.readFileSync(path.join(KOREN, "web", "data", "questions.json"), "utf8"));

export async function spustiServer() {
  const udaje = fs.mkdtempSync(path.join(os.tmpdir(), "prieskum-test-"));
  fs.writeFileSync(path.join(udaje, ".env"), "TIMY=TIM1,TIM2,TIM3,TIM4\n");

  const port = 8100 + Math.floor(Math.random() * 800);
  const proces = spawn(PHP, ["-S", `127.0.0.1:${port}`, "-t", "web", "skripty/server.php"], {
    cwd: KOREN,
    env: { ...process.env, PRIESKUM_UDAJE: udaje },
    stdio: ["ignore", "ignore", "pipe"],
  });

  let chyby = "";
  proces.stderr.on("data", (kus) => { chyby += kus.toString(); });

  const adresa = `http://127.0.0.1:${port}`;
  for (let pokus = 0; pokus < 100; pokus++) {
    try {
      const o = await fetch(`${adresa}/api/zdravie`);
      if (o.ok) break;
    } catch { /* server ešte nebeží */ }
    await new Promise((r) => setTimeout(r, 100));
  }

  return {
    adresa,
    databaza: path.join(udaje, "prieskum.sqlite"),
    priecinok: udaje,
    zaznamChyb: () => chyby,
    zastav: () => { proces.kill(); fs.rmSync(udaje, { recursive: true, force: true }); },
  };
}

/* Server môže práve zapisovať, vtedy je súbor zamknutý. Pri čítaní z testu
   sa preto skúša znova, nie je to chyba aplikácie. */
export async function precitaj(cesta, praca, pokusov = 20) {
  const { DatabaseSync } = await import("node:sqlite");
  let posledna;
  for (let i = 0; i < pokusov; i++) {
    let db;
    try {
      db = new DatabaseSync(cesta, { readOnly: true });
      return praca(db);
    } catch (chyba) {
      posledna = chyba;
      await new Promise((r) => setTimeout(r, 250));
    } finally {
      try { db?.close(); } catch { /* už zavretá */ }
    }
  }
  throw posledna;
}

export async function posli(adresa, cesta, telo, sposob = "POST") {
  const bezTela = sposob === "GET" || sposob === "HEAD";
  const o = await fetch(adresa + cesta, {
    method: sposob,
    headers: bezTela ? {} : { "Content-Type": "application/json" },
    body: bezTela ? undefined : JSON.stringify(telo),
  });
  return { stav: o.status, telo: await o.json() };
}

export function uuid4() {
  return crypto.randomUUID();
}

/* Zostaví odpovede na všetky otázky, ktoré človek s daným blokom dostane. */
export function platneOdpovede(pismeno) {
  const odpovede = {};
  const rotujuce = DOTAZNIK.bloky.filter((b) => b.typ === "rotujuci");

  for (const blok of DOTAZNIK.bloky) {
    if (blok.ulozisko !== "odpovede" || blok.typ === "bonus") continue;
    if (blok.typ === "rotujuci" && blok.pismeno !== pismeno) continue;

    if (blok.format === "bateria") {
      for (const vyrok of blok.vyroky) odpovede[vyrok.id] = blok.skala[0];
      continue;
    }
    for (const otazka of blok.otazky ?? []) {
      if (!otazka.povinne) continue;
      if (otazka.format === "jedna") odpovede[otazka.id] = otazka.moznosti[0];
      else if (otazka.format === "viac") odpovede[otazka.id] = otazka.moznosti.slice(0, otazka.pocet);
      else odpovede[otazka.id] = "skúšobná odpoveď";
    }
  }
  if (rotujuce.length === 0) throw new Error("v questions.json nie sú rotujúce bloky");
  return odpovede;
}

export function moznosti(id) {
  for (const blok of DOTAZNIK.bloky) {
    for (const otazka of blok.otazky ?? []) if (otazka.id === id) return otazka.moznosti ?? [];
  }
  return [];
}

/* Otázky sa hľadajú podľa stĺpca, ktorý plnia, nie podľa čísla.
   Prečíslovanie dotazníka tak testy nerozbije. */
export function otazkaPreStlpec(stlpec) {
  for (const blok of DOTAZNIK.bloky) {
    for (const otazka of blok.otazky ?? []) if (otazka.stlpec === stlpec) return otazka;
  }
  throw new Error(`v questions.json nie je otázka pre stĺpec ${stlpec}`);
}

export function moznostiPreStlpec(stlpec) {
  return otazkaPreStlpec(stlpec).moznosti ?? [];
}

export function prvaOtvorena() {
  for (const blok of DOTAZNIK.bloky) {
    if (blok.typ === "bonus") continue;
    for (const otazka of blok.otazky ?? []) if (otazka.format === "jedna") return otazka;
  }
  throw new Error("v questions.json nie je zatvorená otázka");
}
