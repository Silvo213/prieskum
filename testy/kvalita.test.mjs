/* Kvalita dát a pravidlá zberu z častí 6 a 7 zadania. */

import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { spustiServer, posli, uuid4, platneOdpovede, moznosti } from "./pomocky.mjs";

async function odosli(server, { zdroj = "teren", tim = "TIM1", trvanie = 200, prepis = {} } = {}) {
  const { telo: { blok } } = await posli(server.adresa, "/api/blok", null, "GET");
  return posli(server.adresa, "/api/odpovede", {
    id: uuid4(), zdroj, tim_kod: zdroj === "teren" ? tim : undefined,
    rotujuci_blok: blok, trvanie_s: trvanie, odpovede: platneOdpovede(blok), ...prepis,
  });
}

test("sto odoslaní rozdelí rotujúce bloky rovnomerne", async (t) => {
  const server = await spustiServer();
  t.after(() => server.zastav());

  for (let i = 0; i < 100; i++) {
    const o = await odosli(server);
    assert.equal(o.stav, 200, JSON.stringify(o.telo));
  }

  const db = new DatabaseSync(server.databaza, { readOnly: true });
  const pocty = db.prepare("SELECT rotujuci_blok, count(*) AS n FROM odpovede GROUP BY rotujuci_blok").all();
  db.close();

  assert.equal(pocty.length, 10, "musí byť zastúpených všetkých desať blokov");
  for (const { rotujuci_blok, n } of pocty) {
    assert.ok(n >= 8 && n <= 12, `blok ${rotujuci_blok} má ${n}, čakalo sa 10 plus mínus 2`);
  }
});

test("robot v pasci sa zahodí ticho a nič sa neuloží", async (t) => {
  const server = await spustiServer();
  t.after(() => server.zastav());

  const o = await odosli(server, { prepis: { prezyvka: "http://spam.example" } });
  assert.equal(o.stav, 200, "robot nesmie zistiť, že ho odhalili");

  const db = new DatabaseSync(server.databaza, { readOnly: true });
  assert.equal(db.prepare("SELECT count(*) AS n FROM odpovede").get().n, 0);
  db.close();
});

test("odoslanie pod štyridsaťpäť sekúnd sa označí, ale neodmietne", async (t) => {
  const server = await spustiServer();
  t.after(() => server.zastav());

  assert.equal((await odosli(server, { trvanie: 20 })).stav, 200);
  assert.equal((await odosli(server, { trvanie: 300 })).stav, 200);

  const db = new DatabaseSync(server.databaza, { readOnly: true });
  const pocty = Object.fromEntries(
    db.prepare("SELECT podozrive, count(*) AS n FROM odpovede GROUP BY podozrive").all().map((r) => [r.podozrive, r.n])
  );
  db.close();
  assert.equal(pocty[1], 1, "rýchle vyplnenie má byť označené");
  assert.equal(pocty[0], 1, "pokojné vyplnenie označené nie je");
});

test("ten istý e-mail sa neuloží druhýkrát", async (t) => {
  const server = await spustiServer();
  t.after(() => server.zastav());

  const kontakt = { email: "Jano@Example.SK", suhlas_zrebovanie: true, plnolety: true };
  assert.equal((await posli(server.adresa, "/api/kontakty", kontakt)).stav, 200);
  const druhy = await posli(server.adresa, "/api/kontakty", { ...kontakt, email: "jano@example.sk" });
  assert.equal(druhy.stav, 200);
  assert.equal(druhy.telo.uzMame, true);

  const db = new DatabaseSync(server.databaza, { readOnly: true });
  assert.equal(db.prepare("SELECT count(*) AS n FROM kontakty").get().n, 1, "do žrebovania ide každý raz");
  db.close();
});

test("kontakt bez súhlasu sa neuloží", async (t) => {
  const server = await spustiServer();
  t.after(() => server.zastav());

  await posli(server.adresa, "/api/blok", null, "GET");   // ako keď človek otvorí dotazník

  const bezSuhlasu = await posli(server.adresa, "/api/kontakty", { email: "a@b.sk", suhlas_zrebovanie: false, plnolety: true });
  assert.equal(bezSuhlasu.stav, 422);
  const bezVeku = await posli(server.adresa, "/api/kontakty", { email: "a@b.sk", suhlas_zrebovanie: true, plnolety: false });
  assert.equal(bezVeku.stav, 422);

  const db = new DatabaseSync(server.databaza, { readOnly: true });
  assert.equal(db.prepare("SELECT count(*) AS n FROM kontakty").get().n, 0);
  db.close();
});

test("z webu najviac tri za deň, v teréne bez obmedzenia", async (t) => {
  const server = await spustiServer();
  t.after(() => server.zastav());

  for (let i = 0; i < 3; i++) {
    assert.equal((await odosli(server, { zdroj: "web" })).stav, 200, `webové odoslanie ${i + 1}`);
  }
  const stvrty = await odosli(server, { zdroj: "web" });
  assert.equal(stvrty.stav, 429);
  assert.match(stvrty.telo.chyba, /tri dotazníky/);

  for (let i = 0; i < 5; i++) {
    assert.equal((await odosli(server, { zdroj: "teren" })).stav, 200, `terénne odoslanie ${i + 1}`);
  }
});

test("terénny režim bez platného kódu tímu neprejde", async (t) => {
  const server = await spustiServer();
  t.after(() => server.zastav());

  const o = await odosli(server, { zdroj: "teren", tim: "CUDZI" });
  assert.equal(o.stav, 403);
});

test("odpoveď mimo ponuky sa odmietne", async (t) => {
  const server = await spustiServer();
  t.after(() => server.zastav());

  const { telo: { blok } } = await posli(server.adresa, "/api/blok", null, "GET");
  const odpovede = platneOdpovede(blok);
  odpovede.b1q1 = "vymyslená odpoveď";

  const o = await posli(server.adresa, "/api/odpovede", {
    id: uuid4(), zdroj: "teren", tim_kod: "TIM1", rotujuci_blok: blok, trvanie_s: 200, odpovede,
  });
  assert.equal(o.stav, 422);
  assert.match(o.telo.chyba, /nie je v ponuke/);
});

test("bonus sa pripíše k tomu istému riadku a nevznikne štvrtá tabuľka", async (t) => {
  const server = await spustiServer();
  t.after(() => server.zastav());

  const { telo: { blok } } = await posli(server.adresa, "/api/blok", null, "GET");
  const id = uuid4();
  await posli(server.adresa, "/api/odpovede", {
    id, zdroj: "teren", tim_kod: "TIM1", rotujuci_blok: blok, trvanie_s: 200, odpovede: platneOdpovede(blok),
  });

  const bonus = await posli(server.adresa, `/api/odpovede/${id}`, {
    bonus: { bonus_q1: "keď opravili chodník", bonus_q2: moznosti("bonus_q2")[0] },
  }, "PATCH");
  assert.equal(bonus.stav, 200, JSON.stringify(bonus.telo));

  const db = new DatabaseSync(server.databaza, { readOnly: true });
  const riadky = db.prepare("SELECT count(*) AS n FROM odpovede").get();
  const obsah = JSON.parse(db.prepare("SELECT odpovede_json FROM odpovede WHERE id = ?").get(id).odpovede_json);
  const tabulky = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
  db.close();

  assert.equal(riadky.n, 1, "bonus nesmie vyrobiť nový riadok");
  assert.equal(obsah.bonus.bonus_q1, "keď opravili chodník");
  assert.deepEqual(tabulky.sort(), ["anketa", "citaty", "kontakty", "migracie", "odpovede", "pocitadla"]);
});
