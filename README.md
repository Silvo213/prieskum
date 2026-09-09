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

Poddoména je zámerne mimo WordPressu, ktorý beží na `www.pretoze.sk`. Odpadá tým
Wordfence, ktorý si zapisuje IP adresy návštevníkov, aj prepisovacie pravidlá WordPressu.

## Čo treba mať

- **PHP 8.1 alebo novšie** s `pdo_sqlite`. Na hostingu to je, lokálne stačí prenosná
  verzia v `~/.local/php/php`.
- **Node 22** len na testy, na generovanie zoznamu ulíc a QR kódu. Na server nejde.

## Spustenie lokálne

    npm run server

Beží na `http://localhost:8123`. Databáza a nastavenia vzniknú v priečinku `udaje/`,
ktorý je mimo gitu.

Pred prvým spustením si tam vytvor `udaje/.env`:

    TIMY=TIM1,TIM2,TIM3,TIM4

## Testy

    npm test

Prejde trinásť testov backendu za pár sekúnd. Testy v prehliadači sú oddelene,
lebo jeden z nich naozaj čaká päť minút, aby zmeral, ako dlho vyplnenie trvá:

    npm run test:prehliadac

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

7. **Mazanie logov.** V správe WebSupportu pridaj úlohu CRON na každú noc:

        find /absolutna/cesta/pretoze.sk/logs -name 'access_log*' -mtime +0 -delete

   Prečo to tam je, vysvetľuje DATA.md. Bez toho nesedí to, čo hovoríme ľuďom.

## Zálohovanie databázy

Súbor databázy je jeden a záloha je jeho kópia. Cez konzolu:

    sqlite3 /cesta/udaje-prieskum/prieskum.sqlite ".backup '/cesta/udaje-prieskum/zaloha-$(date +%F).sqlite'"

Rob to každý večer počas zberu. WebSupport zálohuje web denne aj sám, ale vlastná
kópia je vlastná kópia.

## Kontakty sa mažú 30. novembra 2026

Termín je v súhlase, ktorý ľudia zaškrtli. Nie je to odporúčanie.

    npm run vymaz-kontakty              # ukáže, koľko ich je
    npm run vymaz-kontakty -- --naozaj  # zmaže ich

Zapíše sa počet a čas do `udaje-prieskum/vymaz-kontaktov.log`, aby sa dalo doložiť,
že sa to stalo. Samotné kontakty sa nikam nezálohujú, to by bolo mazanie naoko.

## Zoznam ulíc

Našepkávač pri otázke na ulicu beží zo súboru `web/data/ulice.json`. Vygeneroval sa raz
z OpenStreetMap. Aplikácia sama nikam nevolá. Ak by ho bolo treba obnoviť:

    npm run ulice

## Čo tu zámerne nie je

Žiadny framework, žiadny bundler, žiadny Docker, žiadne skladanie. Nahrá sa to FTP-čkom
a funguje. Žiadne písmo z internetu, žiadne meranie, žiadny cudzí skript. Hlavička
`Content-Security-Policy` v `.htaccess` to vynúti aj v prehliadači, nielen v dobrej vôli.
