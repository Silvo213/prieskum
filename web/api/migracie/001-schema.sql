-- 001 · Schéma prieskumu „Aký Martin chceme"
--
-- Tri tabuľky s dátami respondentov: odpovede, anketa, kontakty.
-- Neexistuje medzi nimi žiadny spoločný kľúč a nikdy sa nesmú spájať.
-- Prečo je to takto, vysvetľuje DATA.md.

CREATE TABLE odpovede (
  id            TEXT    PRIMARY KEY NOT NULL,   -- UUIDv4, nie číselný rad
  vytvorene_o   TEXT    NOT NULL,
  zdroj         TEXT    NOT NULL CHECK (zdroj IN ('teren', 'web')),
  tim_kod       TEXT,
  miesto_zberu  TEXT,
  rotujuci_blok TEXT    NOT NULL CHECK (length(rotujuci_blok) = 1),
  mestska_cast  TEXT,
  vek           TEXT,
  pohlavie      TEXT,
  odpovede_json TEXT    NOT NULL,
  trvanie_s     INTEGER,
  podozrive     INTEGER NOT NULL DEFAULT 0,
  neplatne      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX odpovede_blok ON odpovede (rotujuci_blok);
CREATE INDEX odpovede_cas  ON odpovede (vytvorene_o);
CREATE INDEX odpovede_tim  ON odpovede (tim_kod);
CREATE INDEX odpovede_cast ON odpovede (mestska_cast);

-- WITHOUT ROWID nie je optimalizácia, je to ochrana.
-- SQLite inak drží riadky fyzicky v poradí vkladania a z holého súboru
-- databázy by sa dalo vyčítať, ktorá anketa prišla spolu s ktorým
-- kontaktom. Takto je fyzické poradie poradím náhodného UUID.
CREATE TABLE anketa (
  id           TEXT PRIMARY KEY NOT NULL,
  datum        TEXT NOT NULL,                   -- len dátum, nikdy čas
  kandidat     TEXT,
  ucast        TEXT,
  mestska_cast TEXT,
  vek          TEXT
) WITHOUT ROWID;

CREATE TABLE kontakty (
  id                TEXT    PRIMARY KEY NOT NULL,
  datum             TEXT    NOT NULL,           -- len dátum, nikdy čas
  email             TEXT,
  telefon           TEXT,
  suhlas_zrebovanie INTEGER NOT NULL DEFAULT 0,
  suhlas_informacie INTEGER NOT NULL DEFAULT 0,
  plnolety          INTEGER NOT NULL DEFAULT 0,
  odhlasovaci_token TEXT    NOT NULL,
  odhlasene_o       TEXT
) WITHOUT ROWID;

-- do žrebovania ide každý raz
CREATE UNIQUE INDEX kontakty_email ON kontakty (email)   WHERE email   IS NOT NULL;
CREATE UNIQUE INDEX kontakty_tel   ON kontakty (telefon) WHERE telefon IS NOT NULL;
CREATE UNIQUE INDEX kontakty_token ON kontakty (odhlasovaci_token);

-- Pomocné tabuľky. Nie sú to dáta respondentov a s tromi tabuľkami vyššie
-- nemajú nič spoločné okrem citátov, ktoré ukazujú na anonymné odpovede.
CREATE TABLE pocitadla (
  kluc    TEXT    PRIMARY KEY NOT NULL,
  hodnota INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

INSERT INTO pocitadla (kluc, hodnota) VALUES ('rotujuci_blok', 0);

CREATE TABLE citaty (
  odpoved_id TEXT NOT NULL,
  otazka_id  TEXT NOT NULL,
  oznacene_o TEXT NOT NULL,
  PRIMARY KEY (odpoved_id, otazka_id)
) WITHOUT ROWID;
