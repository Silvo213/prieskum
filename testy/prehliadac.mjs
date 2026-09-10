/* Pomôcky pre testy v prehliadači. Používa playwright-core a Chrome,
   ktorý je na stroji, tak ako zvyšok projektu v qa/. */

import { chromium } from "playwright-core";
import { spustiServer } from "./pomocky.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export async function otvorPrieskum({ mobil = true, terenKod = null } = {}) {
  const server = await spustiServer();
  const prehliadac = await chromium.launch({ executablePath: CHROME });
  const kontext = await prehliadac.newContext(
    mobil ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true } : {}
  );

  const cudzieVolania = [];
  kontext.on("request", (poziadavka) => {
    const adresa = new URL(poziadavka.url());
    if (adresa.origin !== server.adresa && adresa.protocol !== "data:") {
      cudzieVolania.push(poziadavka.url());
    }
  });

  const strana = await kontext.newPage();
  await strana.goto(server.adresa + (terenKod ? `/t/${terenKod}` : "/"));
  await strana.waitForSelector("#dalej:not([disabled])");

  return {
    server, strana, kontext, cudzieVolania,
    zavri: async () => { await prehliadac.close(); server.zastav(); },
  };
}

/* Model správania respondenta.
   Text sa číta rýchlosťou dvesto slov za minútu, čo je bežné tiché čítanie
   dospelého. Každá ponúknutá odpoveď sa musí prečítať, kým sa človek rozhodne.
   Otvorenú odpoveď vlastnými slovami píše asi pol minúty.
   Prepínačom PRIESKUM_TEMPO=0 sa pauzy vypnú, keď sa testuje len prechod. */

const MS_NA_SLOVO   = 300;
const MS_NA_MOZNOST = 600;
const MS_NA_KLIK    = 700;
const MS_PISANIE    = 25000;
const MS_KRATKE_PISANIE = 8000;

export const cakanie = { nasobok: Number(process.env.PRIESKUM_TEMPO ?? 1) };

export async function spi(ms) {
  const skutocne = Math.round(ms * cakanie.nasobok);
  if (skutocne > 0) await new Promise((r) => setTimeout(r, skutocne));
}

function slov(text) {
  return (text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

export function casNaPrecitanie(text) {
  return slov(text) * MS_NA_SLOVO;
}

/* Vyplní jednu obrazovku tak, ako by to robil človek: najprv si prečíta,
   čo je na nej, potom klepe. */
/* Väčšina ľudí otvorenú otázku preskočí, sú dobrovoľné. Prepínač
   PRIESKUM_OTVORENE=0 meria taký priebeh, teda ten obvyklý. */
const PISE_OTVORENE = process.env.PRIESKUM_OTVORENE !== "0";

export async function vyplnObrazovku(strana) {
  await strana.locator("#obsah .odpoved, #obsah textarea, #obsah input").first().waitFor({ timeout: 10000 }).catch(() => {});
  const textNaObrazovke = await strana.locator("#obsah").innerText();
  const pocetMoznosti = await strana.locator("#obsah .odpoved").count();

  await spi(casNaPrecitanie(textNaObrazovke) - pocetMoznosti * MS_NA_SLOVO * 2);
  await spi(pocetMoznosti * MS_NA_MOZNOST);

  for (const pole of await strana.locator("#obsah textarea").all()) {
    if (!PISE_OTVORENE) continue;
    await pole.fill("Chodník pred domom je rozbitý roky a nikto s tým nič nerobí.");
    await spi(MS_PISANIE);
  }
  for (const pole of await strana.locator("#obsah input[type=text]").all()) {
    await pole.fill("Kollárova");
    await spi(MS_KRATKE_PISANIE);
  }

  /* Skupiny bez odpovede sa vyplnia zhora nadol, jedna po druhej. */
  for (const skupina of await strana.locator("#obsah [role=radiogroup], #obsah [role=group]").all()) {
    const uzVybrate = await skupina.locator('.odpoved[aria-checked="true"], .odpoved[aria-pressed="true"]').count();
    const tlacidla = await skupina.locator(".odpoved").all();
    const treba = (await skupina.getAttribute("role")) === "group" ? 3 : 1;
    for (let i = uzVybrate; i < treba && i < tlacidla.length; i++) {
      await spi(MS_NA_KLIK);
      await tlacidla[i].click();
    }
  }
  await spi(MS_NA_KLIK);
}

export const KLIK = MS_NA_KLIK;
export const PISANIE = MS_PISANIE;
