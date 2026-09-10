/* Terénny režim bez signálu.
   Päť dotazníkov za sebou, zavretie prehliadača, znovuotvorenie
   a po pripojení sa odošlú všetky. Ani jedna odpoveď sa nesmie stratiť. */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { DatabaseSync } from "node:sqlite";
import { spustiServer, precitaj } from "./pomocky.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function vyplnRychlo(strana) {
  await strana.click("#dalej");                       // úvod
  await strana.waitForTimeout(150);

  for (let obrazovka = 0; obrazovka < 20; obrazovka++) {
    if (await strana.locator("#pata.skryte").count()) break;

    const popis = await strana.locator("#dalej").textContent();
    if (popis === "Ďalej" && (await strana.locator("#obsah h2").first().textContent()) === "Kde dnes zbierate?") {
      await strana.locator("#obsah .odpoved").first().click();
      await strana.waitForTimeout(100);
      await strana.click("#dalej");
      await strana.waitForTimeout(150);
      continue;
    }
    if (!(await strana.locator("#preskocit.skryte").count())) {
      await strana.click("#preskocit");               // anketu aj kontakt preskočíme
      await strana.waitForTimeout(300);
      continue;
    }

    for (const pole of await strana.locator("#obsah textarea, #obsah input[type=text]").all()) {
      await pole.fill("skúšobná odpoveď");
    }
    for (const skupina of await strana.locator("#obsah [role=radiogroup], #obsah [role=group]").all()) {
      const treba = (await skupina.getAttribute("role")) === "group" ? 3 : 1;
      const tlacidla = await skupina.locator(".odpoved").all();
      for (let i = 0; i < treba && i < tlacidla.length; i++) await tlacidla[i].click();
    }
    await strana.click("#dalej");
    await strana.waitForTimeout(150);
  }
  await strana.waitForSelector("#obsah h1");
}

test("päť dotazníkov bez signálu prežije zavretie prehliadača", { timeout: 300000 }, async (t) => {
  const server = await spustiServer();
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), "prieskum-tablet-"));
  t.after(() => { server.zastav(); fs.rmSync(profil, { recursive: true, force: true }); });

  /* --- tablet v teréne, najprv so signálom, aby sa aplikácia uložila --- */
  let tablet = await chromium.launchPersistentContext(profil, {
    executablePath: CHROME,
    viewport: { width: 800, height: 1180 },
  });
  let strana = await tablet.newPage();
  await strana.goto(`${server.adresa}/t/TIM1`);
  await strana.waitForSelector("#dalej:not([disabled])");
  await strana.waitForTimeout(600);                   // service worker si stiahne aplikáciu

  /* --- signál preč --- */
  await tablet.setOffline(true);

  for (let clovek = 0; clovek < 5; clovek++) {
    await vyplnRychlo(strana);
    if (clovek < 4) {
      await strana.getByText("Ďalší respondent").click();
      await strana.waitForSelector("#dalej:not([disabled])");
      await strana.waitForTimeout(200);
    }
  }

  const cakajucich = await strana.evaluate(async () => {
    const { dlzkaFronty } = await import("/js/ulozisko.js");
    return dlzkaFronty();
  });
  assert.equal(cakajucich, 5, "všetkých päť musí čakať vo fronte");

  assert.equal(
    await precitaj(server.databaza, (db) => db.prepare("SELECT count(*) AS n FROM odpovede").get().n),
    0, "bez signálu sa neuložilo nič");

  /* --- zavretie prehliadača --- */
  await tablet.close();

  /* --- znovu otvorený, signál späť --- */
  tablet = await chromium.launchPersistentContext(profil, {
    executablePath: CHROME,
    viewport: { width: 800, height: 1180 },
  });
  strana = await tablet.newPage();
  await strana.goto(`${server.adresa}/`);
  await strana.waitForSelector("#dalej:not([disabled])");

  /* Čaká sa na to, čo sa naozaj overuje: päť riadkov v databáze na serveri.
     Prázdna fronta v prehliadači by bola len nepriamy odhad. */
  for (let pokus = 0; pokus < 60; pokus++) {
    const kolko = await precitaj(server.databaza, (db) => db.prepare("SELECT count(*) AS n FROM odpovede").get().n);
    if (kolko >= 5) break;
    await strana.waitForTimeout(500);
  }

  const voFronte = await strana.evaluate(async () => {
    const { dlzkaFronty, zlyhane } = await import("/js/ulozisko.js");
    return { caka: await dlzkaFronty(), zlyhane: (await zlyhane()).length };
  });
  assert.equal(voFronte.caka, 0, "fronta musí byť prázdna");
  assert.equal(voFronte.zlyhane, 0, "nič sa nesmelo odložiť ako odmietnuté");

  const { pocet, zTerenu, miesta } = await precitaj(server.databaza, (db) => ({
    pocet: db.prepare("SELECT count(*) AS n FROM odpovede").get().n,
    zTerenu: db.prepare("SELECT count(*) AS n FROM odpovede WHERE zdroj = 'teren' AND tim_kod = 'TIM1'").get().n,
    miesta: db.prepare("SELECT DISTINCT miesto_zberu FROM odpovede").all().map((r) => r.miesto_zberu),
  }));
  await tablet.close();

  assert.equal(pocet, 5, "po pripojení sa musia odoslať všetky");
  assert.equal(zTerenu, 5, "všetkých päť je z terénu od tímu TIM1");
  assert.deepEqual(miesta, ["námestie"], "miesto zberu sa vyberá raz za zmenu");
});
