/* Akceptačné kritériá z časti 12 zadania, merané v skutočnom prehliadači. */

import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { otvorPrieskum, vyplnObrazovku, spi, casNaPrecitanie, cakanie, KLIK, PISANIE } from "./prehliadac.mjs";

async function prejdiCelyDotaznik(strana, { kontakt = true, anketa = true } = {}) {
  await spi(casNaPrecitanie(await strana.locator("#obsah").innerText()));
  await spi(KLIK);
  await strana.click("#dalej");

  for (let obrazovka = 0; obrazovka < 20; obrazovka++) {
    if (await strana.locator("#pata.skryte").count()) break;

    const jeKontakt = (await strana.locator("#dalej").textContent()) === "Odoslať";
    const jeAnketa = (await strana.locator("#obsah h2").first().textContent()) === "Anketa";

    if (jeAnketa && !anketa) { await strana.click("#preskocit"); await strana.waitForTimeout(400); continue; }
    if (jeKontakt && !kontakt) { await strana.click("#preskocit"); await strana.waitForTimeout(400); continue; }

    if (jeKontakt) {
      await spi(casNaPrecitanie(await strana.locator("#obsah").innerText()));
      await strana.fill("#pole-email", "martincan@example.sk");
      await spi(PISANIE / 2);
      for (const box of await strana.locator("#obsah input[type=checkbox]").all()) {
        await spi(KLIK);
        await box.check();
      }
    } else {
      await vyplnObrazovku(strana);
    }

    await spi(KLIK);
    await strana.click("#dalej");
    await strana.waitForTimeout(200);
  }
}

test("celý dotazník sa vyplní do piatich minút", {
  timeout: 600000,
  /* S vypnutými pauzami by test meral rýchlosť prehliadača, nie človeka. */
  skip: cakanie.nasobok === 0 ? "PRIESKUM_TEMPO=0, čas sa nemeria" : false,
}, async (t) => {
  const p = await otvorPrieskum();
  t.after(() => p.zavri());

  const zaciatok = Date.now();
  await prejdiCelyDotaznik(p.strana);
  const sekundy = Math.round((Date.now() - zaciatok) / 1000);

  await p.strana.waitForSelector("#obsah h1");
  assert.equal(await p.strana.locator("#obsah h1").textContent(), "Ďakujeme");

  console.log(`      vyplnenie trvalo ${sekundy} s`);
  assert.ok(sekundy <= 300, `vyplnenie trvalo ${sekundy} s, rozpočet je 300 s`);

  await p.strana.waitForTimeout(1500);
  const db = new DatabaseSync(p.server.databaza, { readOnly: true });
  const riadok = db.prepare("SELECT * FROM odpovede").get();
  assert.equal(db.prepare("SELECT count(*) AS n FROM odpovede").get().n, 1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM anketa").get().n, 1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM kontakty").get().n, 1);
  assert.ok(riadok.trvanie_s > 45, "meranie trvania musí sedieť so skutočnosťou");
  assert.equal(riadok.podozrive, 0);
  db.close();
});

test("dotazník sa odošle bez ankety aj bez kontaktu", { timeout: 600000 }, async (t) => {
  const p = await otvorPrieskum();
  t.after(() => p.zavri());

  await prejdiCelyDotaznik(p.strana, { kontakt: false, anketa: false });
  await p.strana.waitForSelector("#obsah h1");
  await p.strana.waitForTimeout(1500);

  const db = new DatabaseSync(p.server.databaza, { readOnly: true });
  assert.equal(db.prepare("SELECT count(*) AS n FROM odpovede").get().n, 1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM anketa").get().n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM kontakty").get().n, 0);
  db.close();
});

test("aplikácia nevolá ani jednu cudziu doménu", { timeout: 600000 }, async (t) => {
  const p = await otvorPrieskum();
  t.after(() => p.zavri());

  await prejdiCelyDotaznik(p.strana);
  await p.strana.waitForTimeout(1000);

  assert.deepEqual(p.cudzieVolania, [], "všetko sa musí načítať z vlastného servera");
});

test("celý dotazník sa dá ovládať klávesnicou", { timeout: 600000 }, async (t) => {
  const p = await otvorPrieskum();
  t.after(() => p.zavri());

  await p.strana.keyboard.press("Enter");            // Začať
  await p.strana.waitForTimeout(300);
  assert.equal(await p.strana.locator("#postup-text").textContent(), "1 z 11");

  /* Tabulátorom sa dá dôjsť na prvú odpoveď a medzerníkom ju vybrať. */
  for (let i = 0; i < 12; i++) {
    const jeOdpoved = await p.strana.evaluate(() => document.activeElement?.classList.contains("odpoved"));
    if (jeOdpoved) break;
    await p.strana.keyboard.press("Tab");
  }
  assert.ok(await p.strana.evaluate(() => document.activeElement?.classList.contains("odpoved")),
    "na odpoveď sa musí dať dostať tabulátorom");

  await p.strana.keyboard.press("Space");
  await p.strana.waitForTimeout(200);
  assert.equal(
    await p.strana.evaluate(() => document.activeElement?.getAttribute("aria-checked")),
    "true",
    "medzerník má odpoveď vybrať"
  );

  const obrys = await p.strana.evaluate(() => getComputedStyle(document.activeElement).outlineWidth);
  assert.notEqual(obrys, "0px", "vybraný prvok musí byť vidieť");
});
