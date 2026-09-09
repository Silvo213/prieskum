/* Fronta na odoslanie a rozpracovaný dotazník.
   Všetko leží v IndexedDB, takže zavretie prehliadača nič nestratí.
   Toto je jediná vec, ktorá drží terénny režim pri živote bez signálu. */

const NAZOV = "prieskum-martin";
const VERZIA = 2;

function otvor() {
  return new Promise((hotovo, zle) => {
    const ziadost = indexedDB.open(NAZOV, VERZIA);
    ziadost.onupgradeneeded = () => {
      const db = ziadost.result;
      if (!db.objectStoreNames.contains("fronta")) {
        db.createObjectStore("fronta", { keyPath: "poradie", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("stav")) {
        db.createObjectStore("stav");
      }
      if (!db.objectStoreNames.contains("zlyhane")) {
        db.createObjectStore("zlyhane", { keyPath: "poradie", autoIncrement: true });
      }
    };
    ziadost.onsuccess = () => hotovo(ziadost.result);
    ziadost.onerror = () => zle(ziadost.error);
  });
}

function operacia(sklad, rezim, praca) {
  return otvor().then((db) => new Promise((hotovo, zle) => {
    const transakcia = db.transaction(sklad, rezim);
    const vysledok = praca(transakcia.objectStore(sklad));
    transakcia.oncomplete = () => { db.close(); hotovo(vysledok?.result ?? vysledok); };
    transakcia.onerror = () => { db.close(); zle(transakcia.error); };
  }));
}

/* Jedno odoslané vyplnenie je jedna položka fronty a v nej sú všetky tri
   požiadavky. Odosielajú sa samostatne, ako káže dátový model, ale vo fronte
   čakajú spolu, aby sa nestalo, že sa odošle kontakt a odpovede nie. */
export function doFronty(poziadavky) {
  return operacia("fronta", "readwrite", (sklad) => sklad.add({ poziadavky, pridane: Date.now() }));
}

export function fronta() {
  return operacia("fronta", "readonly", (sklad) => sklad.getAll());
}

export async function dlzkaFronty() {
  return (await fronta()).length;
}

function zFronty(poradie) {
  return operacia("fronta", "readwrite", (sklad) => sklad.delete(poradie));
}

/* Pošle, čo sa dá. Čo neprejde, ostáva vo fronte na ďalší pokus. */
export async function odosliFrontu(zaklad = "") {
  const cakajuce = await fronta();
  let odoslane = 0;

  for (const polozka of cakajuce) {
    let vsetkoPreslo = true;
    const zvysok = [];

    for (const poziadavka of polozka.poziadavky) {
      try {
        const odpoved = await fetch(zaklad + poziadavka.cesta, {
          method: poziadavka.sposob ?? "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(poziadavka.telo),
        });
        /* Server obsah odmietol. Opakovanie by nepomohlo, ale zahodiť to ticho
           sa nesmie, inak by odpoveď zmizla a nikto by o tom nevedel.
           Odkladá sa nabok, aby sa dala pozrieť. */
        if (!odpoved.ok && odpoved.status >= 400 && odpoved.status < 500) {
          const dovod = await odpoved.text().catch(() => "");
          await operacia("zlyhane", "readwrite", (sklad) =>
            sklad.add({ poziadavka, stav: odpoved.status, dovod, kedy: Date.now() }));
          continue;
        }
        if (!odpoved.ok) throw new Error("server " + odpoved.status);
      } catch {
        vsetkoPreslo = false;
        zvysok.push(poziadavka);
      }
    }

    if (vsetkoPreslo) {
      await zFronty(polozka.poradie);
      odoslane++;
    } else if (zvysok.length < polozka.poziadavky.length) {
      /* Časť prešla. Zapíšeme len zvyšok, aby sa to neposlalo dvakrát. */
      await operacia("fronta", "readwrite", (sklad) =>
        sklad.put({ ...polozka, poziadavky: zvysok }));
    }
  }
  return odoslane;
}

/* Rozpracovaný dotazník, aby sa nestratil ani pri zavretí prehliadača. */
export function ulozRozpracovane(stav) {
  return operacia("stav", "readwrite", (sklad) => sklad.put(stav, "rozpracovane"));
}

export function nacitajRozpracovane() {
  return operacia("stav", "readonly", (sklad) => sklad.get("rozpracovane"));
}

export function zlyhane() {
  return operacia("zlyhane", "readonly", (sklad) => sklad.getAll());
}

export function zabudniRozpracovane() {
  return operacia("stav", "readwrite", (sklad) => sklad.delete("rozpracovane"));
}
