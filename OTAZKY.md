# Prečo sú otázky takto — verzia 3

Prvá verzia bola doslovný prepis zdroja. Druhá k nemu pridala obsah, ale ostala
zbierkou jednotlivých otázok, kde mala každá vlastnú sadu možností s vlastnou
logikou. Táto verzia je postavená ako **výskumný nástroj**: dve jednotné škály,
dve batérie a z nich vypočítateľný rozdiel medzi tým, čo ľudí trápi, a tým,
ako to podľa nich funguje.

Podkladom je `PRIESKUM-SENTIMENT.md`, `PRIESKUM-SENTIMENT-DOPLNOK.md` a korpus
komentárov. Tie hovoria, čo v Martine rezonuje. Dotazník má povedať, koľko ľudí
to naozaj je, lebo Facebook nie je Martin.

## Čo robí nástroj nástrojom

### Dve škály na celý dotazník

Všade, kde sa niečo hodnotí, je tá istá päťstupňová škála:

> veľmi dobre · dobre · ako-tak · zle · veľmi zle

Všade, kde sa meria postoj, je tá istá päťstupňová škála:

> určite áno · skôr áno · skôr nie · určite nie · neviem

Prvá škála nie je vymyslená, je to škála z otázky „Ako sa vám v Martine žije?",
ktorá je v schválenom zdroji. Zvyšok dotazníka sa jej prispôsobil, nie naopak.

Predtým mala každá otázka vlastnú sadu možností, raz tri, raz päť, s inou
logikou. To sa nedá porovnávať medzi otázkami a vyzerá to amatérsky.

### Batéria spokojnosti naprieč všetkými desiatimi oblasťami

Toto je nové a je to jadro celej verzie. Každý človek ohodnotí, ako v Martine
funguje všetkých desať oblastí programu. Nie výber, nie vzorka, všetkých desať
od každého.

Prečo: samotné poradie priorít nestačí. Keď ľudia povedia, že doprava je priorita,
neviete, či preto, že je zlá, alebo preto, že je dôležitá vždy. Až keď máte pri
tej istej oblasti aj hodnotenie, viete povedať to podstatné:

> **vysoká priorita a zlé hodnotenie = téma kampane.**
> vysoká priorita a dobré hodnotenie = netreba do toho tlačiť.
> nízka priorita a zlé hodnotenie = trápi to menšinu, hovoriť len k nej.

Toto je štandardný nástroj a je presne na tú úlohu, na ktorú je prieskum
objednaný, teda nastaviť komunikáciu.

### Vyvážená batéria tvrdení

Šesť viet, ku každej tá istá škála súhlasu. **Tri sú napísané v jednom smere
a tri v opačnom.** Kto súhlasí so všetkým, sa tým prezradí a jeho odpovede sa
dajú z analýzy vyradiť.

| Smer | Veta |
|---|---|
| za | Lanovka na Martinské hole je pre Martin dobrá investícia. |
| proti | Veľké stavby majú počkať, kým sa neopravia chodníky a cesty. |
| za | Východný mestský okruh treba postaviť čo najskôr, aj keď povedie popri záhradách a mokradiach. |
| proti | Na sídlisku je dôležitejšia zeleň než ďalšie parkovacie miesta. |
| za | Peniaze mesta na šport majú ísť najmä klubom, ktoré vychovávajú deti. |
| proti | Kosenie a čistotu zvládne súkromná firma lepšie ako mestský podnik. |

V druhej verzii som batériu zrušil celú, lebo trpela sklonom ľudí súhlasiť
s rozumne znejúcou vetou. To bola chyba. Správna odpoveď na ten problém je
vyvážiť znenie a dať poriadnu škálu, nie nástroj zahodiť.

**Respondentovi sa nehovorí, že niektoré vety sú otočené.** Keby to vedel,
začne odpovede kontrolovať a nástroj prestane fungovať.

### Možnosti, ktoré sa neprekrývajú

Pri kultúre bolo predtým „veľká akcia, na ktorú príde celé mesto" aj „poriadny
jarmok". To je to isté dvakrát. Teraz je päť možností, ktoré sa navzájom
vylučujú, plus poctivé „nič z uvedeného".

## Čo dotazník dá na výstupe

| Nástroj | Čo z neho vznikne |
|---|---|
| batéria hodnotenia (10 oblastí) | ako mesto funguje podľa Martinčanov, oblasť po oblasti |
| výber troch priorít | poradie tém, rozpad po mestských častiach |
| **obe naraz** | **rozdiel medzi prioritou a hodnotením, teda o čom hovoriť** |
| batéria tvrdení (6 viet) | kde presne sa mesto delí, so škálou a bez skreslenia |
| čo vás hnevá (otvorená) | citáty a spontánne poradie tém |
| vaša ulica (otvorená) | Martinský zoznam po uliciach |
| kultúra | čo v ponuke chýba |
| odkiaľ viete | kam dať obsah v druhej polovici kampane |
| čomu veríte | ako formulovať sľub, aby mu ľudia uverili |
| rotujúci blok A – J | prevádzkové podrobnosti po témach, asi dvesto ľudí na tému |

## Čo sa nezmenilo

- **Na osoby sa nepýtame.** Jediná výnimka je anketa o voľbe primátora
  v samostatnej tabuľke, ktorá sa nezverejňuje.
- **Zakázané slová sa nepoužívajú.**
- **Jazyk zostáva jednoduchý.** Profesionalita je v štruktúre a v škálach,
  nie v slovníku. `PRAVIDLA.md` žiada jazyk, ktorému rozumie sedemdesiatnik,
  a to sa s poriadnym nástrojom nebije.

## Čo treba rozhodnúť

**Jedno tvrdenie meria to, čo sa nikdy nezverejní.** Veta o lanovke dá číslo,
z ktorého sa dá spočítať, koľko ľudí ju nechce. Zdroj pravdy zakazuje takú vetu
**povedať**, nie ju **zmerať**. Kampaň to vedieť potrebuje. Ak to má byť inak,
tú vetu vyhodím a lanovka zostane len v poradí priorít.

**Dĺžka.** Namerané hodnoty sú v README. Nástroj je dlhší než zbierka otázok,
to je jeho cena. Ak treba ísť pod päť minút, prvý na rade je rotujúci blok:
odkedy hodnotí všetkých desať oblastí každý, jeho pôvodná úloha odpadla
a zostáva mu len prevádzková podrobnosť.

**`PRIESKUM-VELKY.md` časť 4 je zastaraná.** Po schválení ju prepíšem, aby zdroj
pravdy hovoril to isté, čo ľudia naozaj vypĺňajú.
