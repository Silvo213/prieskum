# Prieskum „Aký Martin chceme"

Dotazník, terénny režim pre tablety a správa prieskumu. Beží tri týždne,
od 14. septembra do 5. októbra 2026, potom sa už len vyhodnocuje.

Obsah dotazníka je v `web/data/questions.json` a je prepísaný doslovne z časti 4
súboru `PRIESKUM-VELKY.md`. Aplikácia sa celá rendruje z neho a proti tomu istému
súboru sa odpovede aj overujú na serveri.

Ako sú uložené dáta a prečo, vysvetľuje [DATA.md](DATA.md). Tú stránku si prečítaj
skôr, než budeš čokoľvek meniť v schéme.

## Kde to beží

| | |
|---|---|
| Adresa | `https://prieskum.pretoze.sk` |
| Terénny režim | `https://prieskum.pretoze.sk/t/TIM1` |
| Hosting | WebSupport, služba `cintula.sk`, doména `pretoze.sk` |
| Webový koreň | `/pretoze.sk/sub/prieskum/` (obsah priečinka `web/`) |
| Údaje | `/pretoze.sk/udaje-prieskum/` (mimo webu, nedá sa stiahnuť) |
| Nasadenie | `SSH_UID=... SSH_PORT=... npm run nasadit` |

Poddoména je zámerne mimo WordPressu, ktorý beží na `www.pretoze.sk`. Odpadá tým
Wordfence, ktorý si zapisuje IP adresy návštevníkov, aj prepisovacie pravidlá WordPressu.

## Čo treba mať

- **PHP 8.1 alebo novšie** s `pdo_sqlite`. Na hostingu to je, lokálne stačí prenosná
  verzia v `~/.local/php/php`.
- **Node 22** len na testy, na generovanie zoznamu ulíc a QR kódu. Na server nejde.

## Vyskúšanie prototypu

    npm run prototyp -- --nanovo

Zmaže starú skúšobnú databázu, spustí server, naplní ho osemdesiatimi vymyslenými
dotazníkmi a vypíše adresy. Bez `--nanovo` len naštartuje server a nechá, čo tam je.

| Kde | Adresa |
|---|---|
| Dotazník | `http://localhost:8123/` |
| Terénny tablet | `http://localhost:8123/t/TIM1` |
| Správa prieskumu | `http://localhost:8123/admin/` |
| Ochrana údajov | `http://localhost:8123/udaje.html` |

Skúšobné prihlásenie je `silvo` a `prieskum2026`, druhé heslo k ankete `anketa2026`.
Na ostrom serveri sa nastavia vlastné, tieto nikam nejdú.

Server počúva aj na sieti, takže z mobilu na tej istej wifi otvoríš tú istú adresu
s IP adresou Macu. Skript ju vypíše.

Skúšobné dáta sú vymyslené. Pred ostrým zberom databázu zmaž:

    rm udaje/prieskum.sqlite

## Spustenie bez skúšobných dát

    npm run server

Beží na `http://localhost:8123`. Databáza a nastavenia vzniknú v priečinku `udaje/`,
ktorý je mimo gitu.

## Testy

    npm test

Trinásť testov backendu za pár sekúnd. Testy v prehliadači sú oddelene:

    npm run test:prehliadac

Správnosť obsahu sa overuje vždy a rýchlo. Meranie času je samostatný test,
ktorý naozaj čaká, a preto sa púšťa len s pauzami:

| Priebeh | Čas |
|---|---|
| odpovie na všetko vrátane oboch otvorených otázok | 5 min 31 s |
| otvorené otázky preskočí, čo robí väčšina | 4 min 41 s |

Rozpočet je päť minút. Obvyklé vyplnenie sa doň zmestí, úplné ho prekračuje
o pol minúty. Otvorené otázky sú dobrovoľné a sú obsahom kampane, preto sa
neškrtajú. Ak treba ísť nižšie, prvý na rade je rotujúci blok, viď OTAZKY.md.

Ak chceš len overiť, že prechod funguje, a nie merať čas:

    PRIESKUM_TEMPO=0 npm run test:prehliadac

## Nasadenie

1. **Poddoména.** V správe WebSupportu pridaj k doméne `pretoze.sk` poddoménu
   `prieskum`. Vznikne priečinok `/pretoze.sk/sub/prieskum/`. Wildcard certifikát
   ju pokrýva, nič sa nedokupuje.

2. **Priečinok na údaje.** Vedľa `web`, `sub` a `logs` vytvor `udaje-prieskum`.
   Musí byť mimo webového koreňa.

3. **Nastavenia.** Do `/pretoze.sk/udaje-prieskum/.env` daj:

        TIMY=TIM1,TIM2,TIM3,TIM4
        ADMIN_MENO=...
        ADMIN_HESLO_HASH=...
        ANKETA_HESLO_HASH=...

   Hash hesla vyrobíš takto:

        php -r 'echo password_hash("tvoje-heslo", PASSWORD_DEFAULT), "\n";'

4. **Súbory.** Obsah priečinka `web/` nahraj FTP-čkom do `/pretoze.sk/sub/prieskum/`.
   Nič sa neskladá ani nekompiluje, ide to tak, ako to leží v gite.

5. **Cesta k údajom.** V nahranom `.htaccess` odkomentuj a doplň:

        SetEnv PRIESKUM_UDAJE /absolutna/cesta/pretoze.sk/udaje-prieskum

   Absolútnu cestu ti povie konzola WebSupportu príkazom `pwd`.

6. **Skúška.** Otvor `https://prieskum.pretoze.sk/api/zdravie`. Musí odpovedať
   `{"ok":true,...}`. Ak nie, je zle cesta k údajom alebo chýba `pdo_sqlite`.

7. **Logy servera sa mazať nedajú.** Skúšané a overené: priečinok `logs` patrí systému
   hostingu a náš účet v ňom nemá právo zápisu. Preto v textoch nikde netvrdíme, že
   logy mažeme. Znenie, ktoré hovoríme ľuďom, je v [DATA.md](DATA.md). Ak chceš ísť
   ďalej, požiadaj WebSupport o skrátenie doby držania logov alebo o ich vypnutie
   pre túto poddoménu.

## Stránka je zatiaľ zavretá heslom

Do 14. septembra nemá prieskum vidieť nikto cudzí. Celá poddoména je preto za
heslom. Kto nemá heslo, dostane od servera 401 a nič viac.

Heslo drží súbor `udaje-prieskum/.htpasswd`, ktorý leží mimo webu. Pravidlá sú
v `web/.htaccess` v bloku na konci, takže zavretie prežije aj nasadenie novej verzie.

**Otvorenie verejnosti 14. septembra:** zmaž z `web/.htaccess` celý blok označený
`DOČASNÉ ZAVRETIE PRED VEREJNOSŤOU` a nasaď novú verziu. Overenie, že je otvorené:

    curl -s -o /dev/null -w '%{http_code}\n' https://prieskum.pretoze.sk/

Musí odpovedať 200. Kým odpovedá 401, prieskum je zavretý.

## Vymazanie skúšobných dát pred ostrým zberom

Kým sa 14. septembra začne zbierať naozaj, treba databázu vyprázdniť. Cez konzolu:

    rm -f /cesta/pretoze.sk/udaje-prieskum/prieskum.sqlite

Vyrobí sa nanovo pri prvej odpovedi. Nastavenia v `.env` ostávajú, tie sú v inom súbore.

## Zálohovanie databázy

Súbor databázy je jeden a záloha je jeho kópia. Cez konzolu:

    sqlite3 /cesta/udaje-prieskum/prieskum.sqlite ".backup '/cesta/udaje-prieskum/zaloha-$(date +%F).sqlite'"

Rob to každý večer počas zberu. WebSupport zálohuje web denne aj sám, ale vlastná
kópia je vlastná kópia.

## Exporty a žrebovanie

Obidve sú v správe prieskumu na `/admin/`.

**Exporty** sú v záložke Exporty. Tri tabuľky, tri samostatné súbory, každý ako CSV
aj ako XLSX. Nikdy sa nesťahujú spolu a nikdy sa nespájajú. Anketa a kontakty
vychádzajú v náhodnom poradí. Štvrtý export sú označené citáty.

**Žrebovanie** je v záložke Žrebovanie. Seed vyhlás pred kamerou a až potom ho napíš
do poľa. Tlačidlo „Ukázať výsledok" nič nezapisuje, dá sa ním skúšať. „Vyžrebovať
naostro" zapíše do `udaje-prieskum/zrebovanie.log` seed, čas, počet účastníkov
a vyžrebované označenia.

Krstné meno a mestskú časť výhercu tam neuvidíš. Kontakt ich neobsahuje a je to
zámer, viď [DATA.md](DATA.md). Vypýtaj si ich od výhercu, keď mu napíšeš; vtedy ti
zároveň dá súhlas so zverejnením mena.

## Kontakty sa mažú 30. novembra 2026

Termín je v súhlase, ktorý ľudia zaškrtli. Nie je to odporúčanie.

    npm run vymaz-kontakty              # ukáže, koľko ich je
    npm run vymaz-kontakty -- --naozaj  # zmaže ich

Zapíše sa počet a čas do `udaje-prieskum/vymaz-kontaktov.log`, aby sa dalo doložiť,
že sa to stalo. Samotné kontakty sa nikam nezálohujú, to by bolo mazanie naoko.

## QR kód

    npm run qr

Vytvorí do `qr/` štyri súbory na ten istý odkaz: čierny na bielom a čierny na žltom,
každý ako SVG aj ako PNG v tlačovej veľkosti. Jeden a ten istý kód pre visačky,
kartičky, tašky aj noviny. Ak sa adresa zmení:

    npm run qr -- https://nova-adresa

## Zoznam ulíc

Našepkávač pri otázke na ulicu beží zo súboru `web/data/ulice.json`. Vygeneroval sa raz
z OpenStreetMap. Aplikácia sama nikam nevolá. Ak by ho bolo treba obnoviť:

    npm run ulice

## GitHub

Aplikácia má vlastný repozitár <https://github.com/Silvo213/prieskum>. Je v ňom len
priečinok `prieskum-app/`, nič z vnútra kampane. Vzniká cez subtree, takže ďalšie
zmeny sa posielajú z koreňa kampaňového repozitára takto:

    git subtree push --prefix=prieskum-app prieskum main

Pozor, ten repozitár je verejný. Nikdy doň nesmie prísť `udaje/`, `.env` ani nič,
čo obsahuje heslá alebo odpovede respondentov. Zabraňuje tomu `.gitignore`,
ale pred nahratím sa to oplatí skontrolovať.

## Čo tu zámerne nie je

Žiadny framework, žiadny bundler, žiadny Docker, žiadne skladanie. Nahrá sa to FTP-čkom
a funguje. Žiadne písmo z internetu, žiadne meranie, žiadny cudzí skript. Hlavička
`Content-Security-Policy` v `.htaccess` to vynúti aj v prehliadači, nielen v dobrej vôli.
