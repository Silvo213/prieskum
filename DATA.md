# Ako sú uložené odpovede z prieskumu „Aký Martin chceme"

Toto je podklad pre odpoveď na otázku, ktorá príde: „však vy si tých ľudí značkujete".
Neznačkujeme a nedá sa to, ani keby sme chceli.

## Tri kôpky, medzi ktorými nie je most

Jedno vyplnenie dotazníka vyrobí až tri záznamy a každý ide inam.

| Kde | Čo tam je | Čo tam nie je |
|---|---|---|
| `odpovede` | odpovede na otázky o meste, čas vyplnenia, tím a miesto zberu | nič, čím sa dá určiť človek |
| `anketa` | koho by volil, či pôjde voliť, veková skupina, mestská časť, **len dátum** | kontakt, presný čas, IP |
| `kontakty` | e-mail alebo telefón, tri súhlasy, **len dátum** | odpovede, anketa, IP |

Medzi tromi tabuľkami neexistuje spoločný kľúč. Žiadne číslo respondenta, žiadne
označenie sedenia, žiadny spoločný čas. Nedajú sa spojiť dopytom, lebo niet podľa čoho.

## Prečo to má takto byť

Otázka „koho by ste volili" je názor na politiku. Keby sa uložila spolu s e-mailom,
kampaň by spracúvala osobitnú kategóriu osobných údajov a potrebovala by na to výslovný
súhlas a poriadnu dokumentáciu. Takto sa jej celkom vyhneme. Zároveň je to pravdivá
odpoveď na otázku, či si niekoho značkujeme.

Na papieri to isté zabezpečuje odtrhávací kupón, ktorý sa hádže do inej schránky než
dotazník. Oddelenie je tam vidieť fyzicky.

## Čo to vynucuje kód, nie dobrá vôľa

Sľub, ktorý drží len na disciplíne, sa raz poruší. Preto:

1. **Tri samostatné odoslania na tri adresy.** Nie jedno veľké.
2. **Prísna schéma.** Adresa pre anketu a pre kontakty prijme presne vymenované polia
   a čokoľvek navyše odmietne s chybou. Keby do nich frontend raz omylom priložil
   označenie dotazníka, server to nepustí ďalej.
3. **Označenia sú náhodné UUID, nie číselný rad.** Z čísla by sa dalo odvodiť poradie.
4. **Anketa a kontakty ležia v databáze fyzicky v náhodnom poradí.** Toto je tichá
   diera, na ktorú sa zabúda: databáza si inak drží riadky v poradí, v akom prišli,
   a z holého súboru by sa dalo vyčítať, ktorá anketa prišla spolu s ktorým kontaktom.
   Obe tabuľky sú preto usporiadané podľa svojho náhodného označenia.
5. **Exporty vychádzajú v náhodnom poradí** a vždy len po jednom, nikdy spojené.
6. **IP adresa sa neukladá do databázy nikdy.** Na obmedzenie počtu odoslaní z jedného
   zariadenia sa počíta len jej odtlačok s náhodnou soľou, ktorá sa každý deň zahodí
   a nahradí novou. Odtlačok sa tým stáva bezcenným. Súbor s odtlackami sa denne
   prepisuje nanovo a leží mimo webu.
7. **Žiadne cookies** okrem jednej technickej pri prihlásení do správy prieskumu.
   Žiadne meranie, žiadny cudzí skript, žiadne písmo z internetu.

Kód sa rendruje z jedného súboru s otázkami a proti tomu istému súboru sa odpovede
aj overujú, takže sa obsah dotazníka a to, čo server prijme, nemôže rozísť.

## Čo je mimo našej kontroly a treba to povedať nahlas

Prieskum beží na bežnom hostingu a **každý webový server si vedie prístupový log**.
Sú v ňom IP adresa a presný čas každej požiadavky a rotuje sa asi dva týždne dozadu.
Tri odoslania jedného človeka prídu pár sekúnd po sebe z tej istej adresy, takže
v tom logu tá väzba nakrátko existuje, mimo našej databázy a mimo nášho dosahu.

Vypnúť sa to na zdieľanom hostingu nedá. Preto sa každú noc automaticky mažú
rotované logy tejto stránky. Presné znenie, ktoré sa hovorí ľuďom, je:
do databázy prieskumu sa IP adresa neukladá nikdy, technický log servera sa maže denne.

Nehovoríme, že logy neexistujú. To by sa dalo overiť za minútu a nebola by to pravda.

## Kto sa k tomu dostane a dokedy

- K exportom majú prístup dvaja ľudia. Tímy v teréne vedia odpovede len odoslať, nie čítať.
- Anketa je v správe prieskumu za druhým heslom a je pri nej veta, že sa nezverejňuje
  a neposiela nikomu.
- Kontakty sa mažú najneskôr **30. novembra 2026** príkazom `npm run vymaz-kontakty`.
  V každej správe je odhlasovací odkaz, ktorý funguje na jedno kliknutie bez prihlásenia.
- Dáta sú v Európskej únii. Nikam sa neposielajú.

## Dve veci, ktoré sa oproti pôvodnému zadaniu upresnili

**Pohlavie má vlastný stĺpec v tabuľke `odpovede`.** V zadaní vymenované nebolo, ale
otázka na pohlavie v dotazníku je a slúži na váženie rovnako ako vek a mestská časť.
Je to odpoveď ako každá iná a v tabuľke, kde nie je nič, čím sa dá určiť človek.

**Bonusové otázky za odoslaním sa dopisujú k tomu istému riadku odpovedí.** Nevzniká
pre ne štvrtá tabuľka a neposiela sa nič, čo by riadok spájalo s anketou alebo
s kontaktom. Označenie dotazníka si drží len prehliadač a len pre túto jednu tabuľku.

## Ako si to overiť

V priečinku `testy/` je test, ktorý po jednom vyplnení pozrie priamo do databázy
a skontroluje, že tri riadky v troch tabuľkách nemajú spoločnú hodnotu, ktorá by
ich spájala. Opakujú sa len hrubé skupiny, do ktorých patria stovky ľudí: dátum,
veková skupina a mestská časť. Ďalší test overuje, že riadky neležia v poradí,
v akom prišli.

    npm test

Keď niekto tvrdí, že sa to dá spárovať, nech spustí ten test.
