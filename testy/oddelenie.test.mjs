/* Najdôležitejší test celého prieskumu.
   Po jednom vyplnení musia vzniknúť tri záznamy v troch tabuľkách
   a v žiadnom z nich nesmie byť nič, čím by sa dali spojiť. */

import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { spustiServer, posli, uuid4, platneOdpovede, moznostiPreStlpec } from "./pomocky.mjs";

test("tri odoslania, tri tabuľky, žiadny spoločný kľúč", async (t) => {
  const server = await spustiServer();
  t.after(() => server.zastav());

  const { telo: pridelenie } = await posli(server.adresa, "/api/blok", null, "GET");
  const blok = pridelenie.blok;
  assert.match(blok, /^[A-J]$/, "server má prideliť rotujúci blok");

  const id = uuid4();
  const dotaznik = await posli(server.adresa, "/api/odpovede", {
    id, zdroj: "web", rotujuci_blok: blok, trvanie_s: 214, prezyvka: "",
    odpovede: platneOdpovede(blok),
  });
  assert.equal(dotaznik.stav, 200, JSON.stringify(dotaznik.telo));

  const anketa = await posli(server.adresa, "/api/anketa", {
    kandidat: moznostiPreStlpec("kandidat")[0], ucast: moznostiPreStlpec("ucast")[0],
    mestska_cast: moznostiPreStlpec("mestska_cast")[0], vek: moznostiPreStlpec("vek")[0],
  });
  assert.equal(anketa.stav, 200, JSON.stringify(anketa.telo));

  const kontakt = await posli(server.adresa, "/api/kontakty", {
    email: "skuska@example.sk", suhlas_zrebovanie: true, suhlas_informacie: false, plnolety: true,
  });
  assert.equal(kontakt.stav, 200, JSON.stringify(kontakt.telo));

  const db = new DatabaseSync(server.databaza, { readOnly: true });
  const r = (sql) => db.prepare(sql).all();

  assert.equal(r("SELECT * FROM odpovede").length, 1, "jeden dotazník");
  assert.equal(r("SELECT * FROM anketa").length, 1, "jedna anketa");
  assert.equal(r("SELECT * FROM kontakty").length, 1, "jeden kontakt");

  const dotaznikRiadok = r("SELECT * FROM odpovede")[0];
  const anketaRiadok = r("SELECT * FROM anketa")[0];
  const kontaktRiadok = r("SELECT * FROM kontakty")[0];

  /* Naprieč tabuľkami sa smú opakovať len hrubé skupiny, do ktorých patria
     stovky ľudí: dátum, veková skupina a mestská časť. Čokoľvek iné spoločné
     by bol kľúč, ktorým sa dajú riadky spárovať. */
  const SKUPINY = new Set(["datum", "mestska_cast", "vek"]);
  const hodnoty = (riadok) =>
    Object.entries(riadok)
      .filter(([, h]) => h !== null && h !== 0 && h !== 1 && h !== "")
      .map(([pole, h]) => [pole, String(h)]);

  const spolocne = (a, b) => {
    const vB = new Map(hodnoty(b));
    const zdielane = [];
    for (const [poleA, hodnotaA] of hodnoty(a)) {
      for (const [poleB, hodnotaB] of vB) {
        if (hodnotaA !== hodnotaB) continue;
        if (SKUPINY.has(poleA) && SKUPINY.has(poleB)) continue;
        zdielane.push(`${poleA} = ${poleB} (${hodnotaA})`);
      }
    }
    return zdielane;
  };

  assert.deepEqual(spolocne(dotaznikRiadok, anketaRiadok), [], "dotazník a anketa nesmú mať spoločný kľúč");
  assert.deepEqual(spolocne(dotaznikRiadok, kontaktRiadok), [], "dotazník a kontakt nesmú mať spoločný kľúč");
  assert.deepEqual(spolocne(anketaRiadok, kontaktRiadok), [], "anketa a kontakt nesmú mať spoločný kľúč");

  /* Identifikátory sú UUID, nie číselný rad, z ktorého by sa dalo odvodiť poradie. */
  for (const riadok of [dotaznikRiadok, anketaRiadok, kontaktRiadok]) {
    assert.match(riadok.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }

  /* Anketa a kontakty smú mať len dátum, nie čas. */
  assert.match(anketaRiadok.datum, /^\d{4}-\d{2}-\d{2}$/, "anketa má len dátum");
  assert.match(kontaktRiadok.datum, /^\d{4}-\d{2}-\d{2}$/, "kontakt má len dátum");
  for (const [pole, hodnota] of [...Object.entries(anketaRiadok), ...Object.entries(kontaktRiadok)]) {
    if (pole === "datum" || typeof hodnota !== "string") continue;
    assert.ok(!/\d{2}:\d{2}/.test(hodnota), `pole ${pole} nesmie obsahovať čas: ${hodnota}`);
  }

  /* Nikde ani stopa po IP adrese. */
  const vsetkyHodnoty = JSON.stringify([dotaznikRiadok, anketaRiadok, kontaktRiadok]);
  assert.ok(!/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(vsetkyHodnoty), "v databáze nesmie byť IP adresa");

  db.close();
});

test("dotazník sa odošle aj bez ankety a bez kontaktu", async (t) => {
  const server = await spustiServer();
  t.after(() => server.zastav());

  const { telo: { blok } } = await posli(server.adresa, "/api/blok", null, "GET");
  const odpoved = await posli(server.adresa, "/api/odpovede", {
    id: uuid4(), zdroj: "web", rotujuci_blok: blok, trvanie_s: 200, odpovede: platneOdpovede(blok),
  });
  assert.equal(odpoved.stav, 200);

  const db = new DatabaseSync(server.databaza, { readOnly: true });
  assert.equal(db.prepare("SELECT count(*) AS n FROM odpovede").get().n, 1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM anketa").get().n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM kontakty").get().n, 0);
  db.close();
});

test("anketa odmietne pole, ktoré by ju s niečím spájalo", async (t) => {
  const server = await spustiServer();
  t.after(() => server.zastav());

  const pokus = await posli(server.adresa, "/api/anketa", {
    kandidat: moznostiPreStlpec("kandidat")[0],
    odpoved_id: uuid4(),
  });
  assert.equal(pokus.stav, 422, "server má takú požiadavku odmietnuť");
  assert.match(pokus.telo.chyba, /nepatrí/);

  const kontakt = await posli(server.adresa, "/api/kontakty", {
    email: "a@b.sk", suhlas_zrebovanie: true, plnolety: true, cas: "18:30",
  });
  assert.equal(kontakt.stav, 422);
});

test("fyzické poradie riadkov neprezradí poradie vkladania", async (t) => {
  const server = await spustiServer();
  t.after(() => server.zastav());

  const poslane = [];
  for (let i = 0; i < 25; i++) {
    await posli(server.adresa, "/api/kontakty", {
      email: `clovek${i}@example.sk`, suhlas_zrebovanie: true, plnolety: true,
    });
    poslane.push(`clovek${i}@example.sk`);
  }

  const db = new DatabaseSync(server.databaza, { readOnly: true });
  const zDatabazy = db.prepare("SELECT email FROM kontakty").all().map((r) => r.email);
  db.close();

  assert.equal(zDatabazy.length, 25);
  assert.notDeepEqual(zDatabazy, poslane, "riadky nesmú ležať v poradí, v akom prišli");
});
