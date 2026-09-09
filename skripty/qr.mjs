/* Vygeneruje QR kód na prieskum ako SVG aj PNG.
   Jeden a ten istý kód pre visačky, kartičky, tašky aj noviny.
   Beží raz pri príprave, výsledok sa commituje. Aplikácia QR negeneruje.

   Spustenie: npm run qr */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CIEL = path.join(KOREN, "qr");
const ADRESA = process.argv[2] ?? "https://prieskum.pretoze.sk";

fs.mkdirSync(CIEL, { recursive: true });

/* Vysoká úroveň opravy chýb: kód prežije aj ohnutú visačku a dotlač. */
const NASTAVENIA = {
  errorCorrectionLevel: "H",
  margin: 2,
  color: { dark: "#0F0F0F", light: "#FFFFFF" },
};

const svg = await QRCode.toString(ADRESA, { ...NASTAVENIA, type: "svg" });
fs.writeFileSync(path.join(CIEL, "prieskum.svg"), svg, "utf8");

/* Žltá verzia na tmavé plochy kampane. */
const svgZlty = await QRCode.toString(ADRESA, {
  ...NASTAVENIA,
  type: "svg",
  color: { dark: "#0F0F0F", light: "#FEED01" },
});
fs.writeFileSync(path.join(CIEL, "prieskum-zlty.svg"), svgZlty, "utf8");

/* PNG v tlačovej veľkosti. 1200 px stačí na visačku aj na inzerát. */
await QRCode.toFile(path.join(CIEL, "prieskum.png"), ADRESA, { ...NASTAVENIA, width: 1200 });
await QRCode.toFile(path.join(CIEL, "prieskum-zlty.png"), ADRESA, {
  ...NASTAVENIA,
  width: 1200,
  color: { dark: "#0F0F0F", light: "#FEED01" },
});

fs.writeFileSync(
  path.join(CIEL, "ADRESA.txt"),
  `Všetky štyri súbory nesú tú istú adresu:\n${ADRESA}\n\n` +
  `Ak sa adresa zmení, spusti znova: npm run qr -- https://nova-adresa\n` +
  `a vymeň súbory všade, kde už sú vytlačené.\n`,
  "utf8"
);

console.log(`QR na ${ADRESA}`);
for (const subor of fs.readdirSync(CIEL).sort()) {
  const velkost = fs.statSync(path.join(CIEL, subor)).size;
  console.log(`  ${subor.padEnd(22)} ${(velkost / 1024).toFixed(1)} kB`);
}
