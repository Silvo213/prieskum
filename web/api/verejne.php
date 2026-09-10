<?php
declare(strict_types=1);

require_once __DIR__ . '/pomocky.php';
require_once __DIR__ . '/db.php';

/* Rotujúci blok prideľuje server tak, aby boli počty vyrovnané: vždy ten,
   ktorý má najmenej odoslaných dotazníkov. Keď je ich viac rovnako nízko,
   rozhodne počítadlo, aby dvaja ľudia naraz nedostali ten istý blok.
   Tablet bez signálu si vyberie náhodne, to rieši frontend. */
function dajRotujuciBlok(): never
{
    $bloky = rotujuceBloky();
    $pocty = array_fill_keys($bloky, 0);

    $dopyt = db()->query('SELECT rotujuci_blok, COUNT(*) AS pocet FROM odpovede WHERE neplatne = 0 GROUP BY rotujuci_blok');
    foreach ($dopyt as $riadok) {
        if (array_key_exists($riadok['rotujuci_blok'], $pocty)) {
            $pocty[$riadok['rotujuci_blok']] = (int) $riadok['pocet'];
        }
    }

    $najmenej = array_keys($pocty, min($pocty), true);
    sort($najmenej);

    db()->exec("UPDATE pocitadla SET hodnota = hodnota + 1 WHERE kluc = 'rotujuci_blok'");
    $poradie = (int) db()->query("SELECT hodnota FROM pocitadla WHERE kluc = 'rotujuci_blok'")->fetchColumn();

    posli(['blok' => $najmenej[$poradie % count($najmenej)]]);
}

function ulozOdpoved(): never
{
    $data = telo();

    /* Pasca na roboty. Človek toto pole nevidí, robot ho vyplní.
       Odpoveď sa zahodí ticho, aby robot nevedel, že ho odhalili. */
    if (trim((string) ($data['prezyvka'] ?? '')) !== '') {
        posli(['ok' => true]);
    }

    lenTietoPolia($data, [
        'id', 'zdroj', 'tim_kod', 'miesto_zberu', 'rotujuci_blok',
        'odpovede', 'trvanie_s', 'prezyvka',
    ]);

    $id = $data['id'] ?? '';
    if (!jeUuid4($id)) {
        chyba('Chýba platné označenie dotazníka.');
    }

    /* Tablet bez signálu posiela z fronty a môže poslať dvakrát.
       Druhé odoslanie toho istého dotazníka je v poriadku, len sa neuloží. */
    $uz = db()->prepare('SELECT 1 FROM odpovede WHERE id = ?');
    $uz->execute([$id]);
    if ($uz->fetchColumn() !== false) {
        posli(['ok' => true, 'uzUlozene' => true]);
    }

    $zdroj = (string) ($data['zdroj'] ?? 'web');
    if (!in_array($zdroj, ['web', 'teren'], true)) {
        chyba('Neznámy zdroj odpovede.');
    }

    $timKod = $data['tim_kod'] ?? null;
    if ($zdroj === 'teren') {
        if (!is_string($timKod) || !in_array($timKod, kodyTimov(), true)) {
            chyba('Kód tímu neplatí.', 403);
        }
    } else {
        $timKod = null;
        /* Z jedného zariadenia najviac tri dotazníky za deň. V teréne
           toto neplatí, tam sa na jednom tablete strieda veľa ľudí. */
        if (pocetOdoslaniDnes(adresaVolajuceho()) >= 3) {
            chyba('Z tohto zariadenia už boli dnes odoslané tri dotazníky. Ďakujeme.', 429);
        }
    }

    $blok = (string) ($data['rotujuci_blok'] ?? '');
    if (!in_array($blok, rotujuceBloky(), true)) {
        chyba('Neznámy tematický blok.');
    }

    $odpovede = $data['odpovede'] ?? null;
    if (!is_array($odpovede)) {
        chyba('Chýbajú odpovede.');
    }
    $chyby = skontrolujOdpovede($odpovede, $blok);
    if ($chyby !== []) {
        chyba(implode(' ', $chyby), 422);
    }

    $trvanie = $data['trvanie_s'] ?? null;
    $trvanie = is_numeric($trvanie) ? max(0, (int) $trvanie) : null;

    /* Vyplnené pod tri štvrtiny minúty sa neodmieta, len sa označí,
       aby sa to dalo v exporte odfiltrovať. */
    $podozrive = ($trvanie !== null && $trvanie < 45) ? 1 : 0;

    $miesto = $data['miesto_zberu'] ?? null;
    if ($miesto !== null && !in_array($miesto, miestaZberu(), true)) {
        chyba('Neznáme miesto zberu.');
    }

    $vloz = db()->prepare(
        'INSERT INTO odpovede
            (id, vytvorene_o, zdroj, tim_kod, miesto_zberu, rotujuci_blok,
             mestska_cast, vek, pohlavie, odpovede_json, trvanie_s, podozrive)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stlpce = stlpceOdpovedi();
    $zOdpovedi = fn(string $stlpec) => isset($stlpce[$stlpec]) ? ($odpovede[$stlpce[$stlpec]] ?? null) : null;

    $vloz->execute([
        $id,
        terazIso(),
        $zdroj,
        $timKod,
        is_string($miesto) ? $miesto : null,
        $blok,
        $zOdpovedi('mestska_cast'),
        $zOdpovedi('vek'),
        $zOdpovedi('pohlavie'),
        (string) json_encode($odpovede, JSON_UNESCAPED_UNICODE),
        $trvanie,
        $podozrive,
    ]);

    if ($zdroj === 'web') {
        zapocitajOdoslanie(adresaVolajuceho());
    }

    posli(['ok' => true]);
}

/* Bonusové otázky prídu až za odoslaním a patria k tomu istému riadku.
   Nevzniká pre ne štvrtá tabuľka a nikam sa neposiela nič nové. */
function ulozBonus(string $id): never
{
    if (!jeUuid4($id)) {
        chyba('Chýba platné označenie dotazníka.');
    }

    $data = telo();
    lenTietoPolia($data, ['bonus']);
    $bonus = $data['bonus'] ?? null;
    if (!is_array($bonus) || $bonus === []) {
        chyba('Chýbajú bonusové odpovede.');
    }

    $povolene = bonusovePravidla();
    foreach ($bonus as $otazka => $hodnota) {
        if (!isset($povolene[$otazka])) {
            chyba('Otázka ' . $otazka . ' do bonusu nepatrí.', 422);
        }
        $p = $povolene[$otazka];
        if ($p['moznosti'] !== null) {
            if (!is_string($hodnota) || !in_array($hodnota, $p['moznosti'], true)) {
                chyba('Otázka ' . $otazka . ' má odpoveď, ktorá nie je v ponuke.', 422);
            }
        } elseif (!is_string($hodnota) || mb_strlen($hodnota) > (int) $p['maxZnakov']) {
            chyba('Odpoveď na otázku ' . $otazka . ' je pridlhá.', 422);
        }
    }

    $riadok = db()->prepare('SELECT odpovede_json FROM odpovede WHERE id = ?');
    $riadok->execute([$id]);
    $ulozene = $riadok->fetchColumn();
    if ($ulozene === false) {
        chyba('Taký dotazník tu nie je.', 404);
    }

    $obsah = json_decode((string) $ulozene, true);
    if (isset($obsah['bonus'])) {
        posli(['ok' => true, 'uzUlozene' => true]);
    }
    $obsah['bonus'] = $bonus;

    $uprav = db()->prepare('UPDATE odpovede SET odpovede_json = ? WHERE id = ?');
    $uprav->execute([(string) json_encode($obsah, JSON_UNESCAPED_UNICODE), $id]);

    posli(['ok' => true]);
}

function bonusovePravidla(): array
{
    $mapa = [];
    foreach (dotaznik()['bloky'] as $blok) {
        if (($blok['typ'] ?? '') !== 'bonus') {
            continue;
        }
        foreach ($blok['otazky'] as $otazka) {
            $mapa[$otazka['id']] = [
                'moznosti'  => $otazka['moznosti'] ?? null,
                'maxZnakov' => $otazka['maxZnakov'] ?? 500,
            ];
        }
    }
    return $mapa;
}

/* Anketa. Vlastné odoslanie, vlastná tabuľka, len dátum bez času
   a žiadne pole, ktoré by ju spájalo s dotazníkom alebo s kontaktom. */
function ulozAnketu(): never
{
    $data = telo();
    lenTietoPolia($data, ['kandidat', 'ucast', 'mestska_cast', 'vek']);

    /* Ktorá otázka patrí ku ktorému stĺpcu ankety, hovorí questions.json. */
    $ankOtazky = [];
    foreach (dotaznik()['bloky'] as $blok) {
        if (($blok['ulozisko'] ?? '') !== 'anketa') {
            continue;
        }
        foreach ($blok['otazky'] ?? [] as $otazka) {
            if (isset($otazka['stlpec'])) {
                $ankOtazky[$otazka['stlpec']] = $otazka['id'];
            }
        }
    }
    $dvojice = [
        'kandidat'     => $ankOtazky['kandidat'] ?? '',
        'ucast'        => $ankOtazky['ucast'] ?? '',
        'mestska_cast' => otazkaPreStlpec('mestska_cast') ?? '',
        'vek'          => otazkaPreStlpec('vek') ?? '',
    ];

    $hodnoty = [];
    foreach ($dvojice as $pole => $otazka) {
        $hodnota = $data[$pole] ?? null;
        if ($hodnota === null || $hodnota === '') {
            $hodnoty[$pole] = null;
            continue;
        }
        if (!is_string($hodnota) || !in_array($hodnota, moznostiOtazky($otazka), true)) {
            chyba('Pole ' . $pole . ' má hodnotu, ktorá nie je v ponuke.', 422);
        }
        $hodnoty[$pole] = $hodnota;
    }

    if ($hodnoty['kandidat'] === null && $hodnoty['ucast'] === null) {
        posli(['ok' => true, 'preskocene' => true]);
    }

    $vloz = db()->prepare('INSERT INTO anketa (id, datum, kandidat, ucast, mestska_cast, vek) VALUES (?, ?, ?, ?, ?, ?)');
    $vloz->execute([uuid4(), dnesnyDatum(), $hodnoty['kandidat'], $hodnoty['ucast'], $hodnoty['mestska_cast'], $hodnoty['vek']]);

    posli(['ok' => true]);
}

/* Kontakt. Vlastné odoslanie, vlastná tabuľka, len dátum bez času. */
function ulozKontakt(): never
{
    $data = telo();
    lenTietoPolia($data, ['email', 'telefon', 'suhlas_zrebovanie', 'suhlas_informacie', 'plnolety']);

    $email = trim((string) ($data['email'] ?? ''));
    $telefon = preg_replace('/[^0-9+]/', '', (string) ($data['telefon'] ?? '')) ?? '';

    if ($email === '' && $telefon === '') {
        posli(['ok' => true, 'preskocene' => true]);
    }

    if ($email !== '') {
        $email = mb_strtolower($email);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            chyba('E-mailová adresa nie je správna.');
        }
    }
    if ($telefon !== '' && (mb_strlen($telefon) < 9 || mb_strlen($telefon) > 16)) {
        chyba('Telefónne číslo nie je správne.');
    }

    $zrebovanie = !empty($data['suhlas_zrebovanie']);
    $informacie = !empty($data['suhlas_informacie']);
    $plnolety   = !empty($data['plnolety']);

    if (!$zrebovanie) {
        chyba('Bez zaškrtnutia prvého políčka kontakt neukladáme.', 422);
    }
    if (!$plnolety) {
        chyba('Do žrebovania môžeme zaradiť len človeka, ktorý má 18 a viac rokov.', 422);
    }

    $vloz = db()->prepare(
        'INSERT INTO kontakty
            (id, datum, email, telefon, suhlas_zrebovanie, suhlas_informacie, plnolety, odhlasovaci_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );

    try {
        $vloz->execute([
            uuid4(),
            dnesnyDatum(),
            $email !== '' ? $email : null,
            $telefon !== '' ? $telefon : null,
            1,
            $informacie ? 1 : 0,
            1,
            bin2hex(random_bytes(24)),
        ]);
    } catch (PDOException $problem) {
        /* Ten istý e-mail sa neuloží druhýkrát. Do žrebovania ide každý raz. */
        if (str_contains($problem->getMessage(), 'UNIQUE')) {
            posli(['ok' => true, 'uzMame' => true]);
        }
        throw $problem;
    }

    posli(['ok' => true]);
}

/* Ktorá otázka plní ktorý stĺpec. Berie sa to z questions.json podľa poľa
   stlpec, takže prečíslovanie otázok nič nerozbije. */
function stlpceOdpovedi(): array
{
    static $mapa = null;
    if ($mapa !== null) {
        return $mapa;
    }
    $mapa = [];
    foreach (dotaznik()['bloky'] as $blok) {
        if (($blok['ulozisko'] ?? '') !== 'odpovede') {
            continue;
        }
        foreach ($blok['otazky'] ?? [] as $otazka) {
            if (isset($otazka['stlpec'])) {
                $mapa[$otazka['stlpec']] = $otazka['id'];
            }
        }
    }
    return $mapa;
}

function otazkaPreStlpec(string $stlpec): ?string
{
    return stlpceOdpovedi()[$stlpec] ?? null;
}

function moznostiOtazky(string $id): array
{
    foreach (dotaznik()['bloky'] as $blok) {
        foreach ($blok['otazky'] ?? [] as $otazka) {
            if ($otazka['id'] === $id) {
                return $otazka['moznosti'] ?? [];
            }
        }
    }
    return [];
}

function miestaZberu(): array
{
    return ['námestie', 'trhovisko', 'poliklinika', 'stanica', 'Ľadoveň',
            'Košúty', 'Priekopa', 'Záturčie', 'Podháj', 'Stráne', 'iné'];
}
