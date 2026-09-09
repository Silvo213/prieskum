<?php
declare(strict_types=1);

require_once __DIR__ . '/pomocky.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/export.php';

function zacniSedenie(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $priecinok = priecinokUdajov() . '/sedenia';
    if (!is_dir($priecinok)) {
        @mkdir($priecinok, 0750, true);
    }
    session_save_path($priecinok);
    session_name('prieskum_sprava');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => ($_SERVER['HTTPS'] ?? '') !== '' || ($_SERVER['SERVER_PORT'] ?? '') === '443',
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

function prihlaseny(): bool
{
    zacniSedenie();
    return ($_SESSION['prihlaseny'] ?? false) === true;
}

function vyzadujPrihlasenie(): void
{
    if (!prihlaseny()) {
        chyba('Najprv sa prihláste.', 401);
    }
}

function admin(string $sposob, string $cesta): never
{
    $cesta = '/' . trim($cesta, '/');

    if ($sposob === 'POST' && $cesta === '/prihlasenie') {
        prihlas();
    }
    if ($sposob === 'POST' && $cesta === '/odhlasenie') {
        zacniSedenie();
        $_SESSION = [];
        session_destroy();
        posli(['ok' => true]);
    }
    if ($sposob === 'GET' && $cesta === '/kto') {
        posli(['prihlaseny' => prihlaseny(), 'anketaOdomknuta' => ($_SESSION['anketa'] ?? false) === true]);
    }

    vyzadujPrihlasenie();

    match (true) {
        $sposob === 'GET'  && $cesta === '/prehlad'          => prehlad(),
        $sposob === 'GET'  && $cesta === '/otvorene'         => otvoreneOdpovede(),
        $sposob === 'POST' && $cesta === '/citat'            => oznacCitat(),
        $sposob === 'POST' && $cesta === '/neplatne'         => oznacNeplatne(),
        $sposob === 'GET'  && $cesta === '/zoznam'           => martinskyZoznam(),
        $sposob === 'GET'  && $cesta === '/zoznam.html'      => martinskyZoznamHtml(),
        $sposob === 'POST' && $cesta === '/zrebovanie'       => zrebovanie(),
        $sposob === 'POST' && $cesta === '/anketa/odomknut'  => odomkniAnketu(),
        $sposob === 'GET'  && $cesta === '/anketa'           => vysledkyAnkety(),
        $sposob === 'GET'  && str_starts_with($cesta, '/export/') => export(substr($cesta, 8)),
        default => chyba('Taká adresa v správe prieskumu nie je.', 404),
    };
}

function prihlas(): never
{
    $data = telo();
    lenTietoPolia($data, ['meno', 'heslo']);

    $meno = (string) ($data['meno'] ?? '');
    $heslo = (string) ($data['heslo'] ?? '');
    $spravneMeno = nastavenie('ADMIN_MENO');
    $hash = nastavenie('ADMIN_HESLO_HASH');

    /* Rovnaký čas pri správnom aj nesprávnom mene, aby sa nedalo hádať. */
    if ($spravneMeno === '' || $hash === '') {
        chyba('Prihlásenie nie je nastavené. Doplňte ADMIN_MENO a ADMIN_HESLO_HASH.', 503);
    }
    $sedi = hash_equals($spravneMeno, $meno) & password_verify($heslo, $hash);
    usleep(random_int(150000, 400000));

    if (!$sedi) {
        chyba('Meno alebo heslo nesedí.', 401);
    }

    zacniSedenie();
    session_regenerate_id(true);
    $_SESSION['prihlaseny'] = true;
    posli(['ok' => true]);
}

function odomkniAnketu(): never
{
    $data = telo();
    lenTietoPolia($data, ['heslo']);
    $hash = nastavenie('ANKETA_HESLO_HASH');
    if ($hash === '' || !password_verify((string) ($data['heslo'] ?? ''), $hash)) {
        usleep(random_int(150000, 400000));
        chyba('Heslo k ankete nesedí.', 401);
    }
    zacniSedenie();
    $_SESSION['anketa'] = true;
    posli(['ok' => true]);
}

/* ---------- prehľad ---------- */

function prehlad(): never
{
    $db = db();
    $skupina = function (string $stlpec): array {
        $riadky = db()->query("SELECT COALESCE($stlpec, 'neuvedené') AS kluc, COUNT(*) AS pocet
                               FROM odpovede WHERE neplatne = 0 GROUP BY kluc ORDER BY pocet DESC")->fetchAll();
        return array_map(fn($r) => ['kluc' => $r['kluc'], 'pocet' => (int) $r['pocet']], $riadky);
    };

    $dnes = dnesnyDatum();

    /* Naplnenosť rotujúcich blokov, aby bolo vidieť, či niektorý zaostáva. */
    $bloky = array_fill_keys(rotujuceBloky(), 0);
    foreach ($db->query('SELECT rotujuci_blok, COUNT(*) AS pocet FROM odpovede WHERE neplatne = 0 GROUP BY rotujuci_blok') as $r) {
        if (array_key_exists($r['rotujuci_blok'], $bloky)) {
            $bloky[$r['rotujuci_blok']] = (int) $r['pocet'];
        }
    }

    posli([
        'spolu'        => (int) $db->query('SELECT COUNT(*) FROM odpovede WHERE neplatne = 0')->fetchColumn(),
        'neplatne'     => (int) $db->query('SELECT COUNT(*) FROM odpovede WHERE neplatne = 1')->fetchColumn(),
        'podozrive'    => (int) $db->query('SELECT COUNT(*) FROM odpovede WHERE podozrive = 1 AND neplatne = 0')->fetchColumn(),
        'dnes'         => (int) $db->query("SELECT COUNT(*) FROM odpovede WHERE neplatne = 0 AND substr(vytvorene_o, 1, 10) = '$dnes'")->fetchColumn(),
        'kontaktov'    => (int) $db->query('SELECT COUNT(*) FROM kontakty WHERE odhlasene_o IS NULL')->fetchColumn(),
        'odhlasenych'  => (int) $db->query('SELECT COUNT(*) FROM kontakty WHERE odhlasene_o IS NOT NULL')->fetchColumn(),
        'anketa'       => (int) $db->query('SELECT COUNT(*) FROM anketa')->fetchColumn(),
        'trvanieMedian' => medianTrvania(),
        'podlaZdroja'  => $skupina('zdroj'),
        'podlaTimu'    => $skupina('tim_kod'),
        'podlaMiesta'  => $skupina('miesto_zberu'),
        'podlaCasti'   => $skupina('mestska_cast'),
        'podlaVeku'    => $skupina('vek'),
        'bloky'        => $bloky,
        'cielSpolu'    => 2000,
    ]);
}

/* Medián je poctivejší ako priemer: jeden tablet zabudnutý otvorený
   na obed by priemer roztiahol do nezmyslu. */
function medianTrvania(): ?int
{
    $hodnoty = db()->query('SELECT trvanie_s FROM odpovede WHERE neplatne = 0 AND trvanie_s IS NOT NULL ORDER BY trvanie_s')
        ->fetchAll(PDO::FETCH_COLUMN);
    $pocet = count($hodnoty);
    if ($pocet === 0) {
        return null;
    }
    $stred = intdiv($pocet, 2);
    return $pocet % 2 ? (int) $hodnoty[$stred] : (int) round(($hodnoty[$stred - 1] + $hodnoty[$stred]) / 2);
}

/* ---------- otvorené odpovede ---------- */

function otvoreneOdpovede(): never
{
    $hladat = trim((string) ($_GET['hladat'] ?? ''));
    $lenCitaty = ($_GET['citaty'] ?? '') === '1';
    $limit = min(500, max(1, (int) ($_GET['limit'] ?? 50)));

    $riadky = db()->query('SELECT id, vytvorene_o, zdroj, mestska_cast, vek, odpovede_json, podozrive, neplatne
                           FROM odpovede ORDER BY vytvorene_o DESC')->fetchAll();

    $oznacene = [];
    foreach (db()->query('SELECT odpoved_id, otazka_id FROM citaty') as $c) {
        $oznacene[$c['odpoved_id'] . '|' . $c['otazka_id']] = true;
    }

    $otvorene = otvoreneOtazky();
    $vysledok = [];

    foreach ($riadky as $riadok) {
        $obsah = json_decode($riadok['odpovede_json'], true) ?: [];
        $bonus = $obsah['bonus'] ?? [];
        foreach ($otvorene as $otazkaId => $znenie) {
            $text = $obsah[$otazkaId] ?? $bonus[$otazkaId] ?? null;
            if (!is_string($text) || trim($text) === '') {
                continue;
            }
            $jeCitat = isset($oznacene[$riadok['id'] . '|' . $otazkaId]);
            if ($lenCitaty && !$jeCitat) {
                continue;
            }
            if ($hladat !== '' && mb_stripos($text, $hladat) === false) {
                continue;
            }
            $vysledok[] = [
                'odpoved_id'   => $riadok['id'],
                'otazka_id'    => $otazkaId,
                'otazka'       => $znenie,
                'text'         => $text,
                'kedy'         => substr($riadok['vytvorene_o'], 0, 10),
                'mestska_cast' => $riadok['mestska_cast'],
                'vek'          => $riadok['vek'],
                'zdroj'        => $riadok['zdroj'],
                'citat'        => $jeCitat,
                'podozrive'    => (bool) $riadok['podozrive'],
                'neplatne'     => (bool) $riadok['neplatne'],
            ];
            if (count($vysledok) >= $limit) {
                break 2;
            }
        }
    }

    posli(['odpovede' => $vysledok, 'pocet' => count($vysledok)]);
}

function otvoreneOtazky(): array
{
    $mapa = [];
    foreach (dotaznik()['bloky'] as $blok) {
        foreach ($blok['otazky'] ?? [] as $otazka) {
            if (($otazka['format'] ?? '') === 'text') {
                $mapa[$otazka['id']] = $otazka['text'];
            }
        }
    }
    return $mapa;
}

function oznacCitat(): never
{
    $data = telo();
    lenTietoPolia($data, ['odpoved_id', 'otazka_id', 'oznacene']);
    $odpovedId = (string) ($data['odpoved_id'] ?? '');
    $otazkaId = (string) ($data['otazka_id'] ?? '');
    if (!jeUuid4($odpovedId) || !isset(otvoreneOtazky()[$otazkaId])) {
        chyba('Takú odpoveď označiť neviem.');
    }

    if (!empty($data['oznacene'])) {
        $vloz = db()->prepare('INSERT OR REPLACE INTO citaty (odpoved_id, otazka_id, oznacene_o) VALUES (?, ?, ?)');
        $vloz->execute([$odpovedId, $otazkaId, terazIso()]);
    } else {
        $zmaz = db()->prepare('DELETE FROM citaty WHERE odpoved_id = ? AND otazka_id = ?');
        $zmaz->execute([$odpovedId, $otazkaId]);
    }
    posli(['ok' => true]);
}

/* Hromadné označenie série ako neplatnej, keď sa niekto zabaví. */
function oznacNeplatne(): never
{
    $data = telo();
    lenTietoPolia($data, ['id', 'neplatne']);
    $zoznam = $data['id'] ?? [];
    if (!is_array($zoznam) || $zoznam === []) {
        chyba('Neposlali ste, ktoré odpovede označiť.');
    }
    $priznak = empty($data['neplatne']) ? 0 : 1;
    $uprav = db()->prepare('UPDATE odpovede SET neplatne = ? WHERE id = ?');
    $zmenene = 0;
    foreach ($zoznam as $id) {
        if (jeUuid4($id)) {
            $uprav->execute([$priznak, $id]);
            $zmenene += $uprav->rowCount();
        }
    }
    posli(['ok' => true, 'zmenene' => $zmenene]);
}

/* ---------- Martinský zoznam ---------- */

function martinskyZoznam(): never
{
    posli(zostavMartinskyZoznam());
}

function zostavMartinskyZoznam(): array
{
    $riadky = db()->query('SELECT mestska_cast, odpovede_json FROM odpovede WHERE neplatne = 0')->fetchAll();

    $celkom = ['b2q1' => [], 'b2q2' => []];
    $poCastiach = [];
    $ulice = [];

    foreach ($riadky as $riadok) {
        $obsah = json_decode($riadok['odpovede_json'], true) ?: [];
        $cast = $riadok['mestska_cast'] ?? 'neuvedené';

        foreach (['b2q1', 'b2q2'] as $otazka) {
            foreach ((array) ($obsah[$otazka] ?? []) as $vec) {
                $celkom[$otazka][$vec] = ($celkom[$otazka][$vec] ?? 0) + 1;
                if ($otazka === 'b2q1') {
                    $poCastiach[$cast][$vec] = ($poCastiach[$cast][$vec] ?? 0) + 1;
                }
            }
        }

        $text = trim((string) ($obsah['b4q1'] ?? ''));
        if ($text !== '') {
            $ulice[$cast][] = ['text' => $text, 'ulica' => $obsah['b4q2'] ?? null];
        }
    }

    $zoradene = function (array $pocty): array {
        arsort($pocty);
        $vysledok = [];
        foreach ($pocty as $vec => $pocet) {
            $vysledok[] = ['vec' => $vec, 'pocet' => $pocet];
        }
        return $vysledok;
    };

    $tri = [];
    foreach ($poCastiach as $cast => $pocty) {
        $tri[$cast] = array_slice($zoradene($pocty), 0, 3);
    }
    ksort($tri);

    return [
        'coPrve'      => $zoradene($celkom['b2q1']),
        'trojeVelke'  => $zoradene($celkom['b2q2']),
        'poCastiach'  => $tri,
        'ulice'       => $ulice,
        'zoOdpovedi'  => count($riadky),
        'zostavene'   => terazIso(),
    ];
}

function martinskyZoznamHtml(): never
{
    $z = zostavMartinskyZoznam();
    $e = fn($t) => htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8');

    $riadky = '';
    foreach ($z['coPrve'] as $i => $polozka) {
        $riadky .= '<tr><td>' . ($i + 1) . '.</td><td>' . $e($polozka['vec']) . '</td><td>' . $polozka['pocet'] . '</td></tr>';
    }
    $velke = '';
    foreach ($z['trojeVelke'] as $i => $polozka) {
        $velke .= '<tr><td>' . ($i + 1) . '.</td><td>' . $e($polozka['vec']) . '</td><td>' . $polozka['pocet'] . '</td></tr>';
    }
    $casti = '';
    foreach ($z['poCastiach'] as $cast => $veci) {
        $casti .= '<h3>' . $e($cast) . '</h3><ol>';
        foreach ($veci as $vec) {
            $casti .= '<li>' . $e($vec['vec']) . ' <span class="pocet">' . $vec['pocet'] . '</span></li>';
        }
        $casti .= '</ol>';
    }

    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    echo <<<HTML
    <!DOCTYPE html><html lang="sk"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Martinský zoznam</title>
    <link rel="stylesheet" href="../css/prieskum.css">
    <style>
      body { background: var(--zlta); }
      .obsah { background: var(--biela); border: 3px solid var(--cierna); margin: 1.5rem auto; }
      h1 { font-size: 2.2rem; }
      h2 { font-family: var(--titulok); text-transform: uppercase; font-size: 1.2rem; margin: 2rem 0 .8rem; }
      h3 { font-weight: 700; margin: 1.2rem 0 .3rem; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: .5rem .4rem; border-bottom: 2px solid var(--cierna); }
      td:first-child { width: 2.5rem; font-family: var(--titulok); }
      td:last-child { width: 4rem; text-align: right; font-weight: 700; }
      ol { padding-left: 1.4rem; }
      li { margin-bottom: .3rem; }
      .pocet { font-weight: 700; }
      .zdroj { font-size: .8rem; margin-top: 2rem; }
    </style></head><body><main class="obsah">
    <h1>Martinský zoznam</h1>
    <p>Čo majú Martinčania za prvé. Zostavené z {$z['zoOdpovedi']} odpovedí.</p>
    <h2>Čo má mesto riešiť ako prvé</h2><table>{$riadky}</table>
    <h2>Keby boli peniaze len na tri veľké veci</h2><table>{$velke}</table>
    <h2>Tri veci na každú mestskú časť</h2>{$casti}
    <p class="zdroj">Prieskum „Aký Martin chceme“, zber 14. 9. až 5. 10. 2026. Zostavené {$z['zostavene']}.</p>
    </main></body></html>
    HTML;
    exit;
}

/* ---------- žrebovanie ---------- */

function zrebovanie(): never
{
    $data = telo();
    lenTietoPolia($data, ['seed', 'pocet', 'naostro']);

    $seed = trim((string) ($data['seed'] ?? ''));
    if (mb_strlen($seed) < 4) {
        chyba('Zadajte seed, ktorý ste vyhlásili pred kamerou. Aspoň štyri znaky.');
    }
    $pocet = min(50, max(1, (int) ($data['pocet'] ?? 10)));

    /* Poradie musí byť dané dátami, nie databázou, inak sa výsledok
       nedá zopakovať. Preto sa účastníci najprv zoradia podľa označenia. */
    $ucastnici = db()->query(
        "SELECT id, email, telefon FROM kontakty
         WHERE suhlas_zrebovanie = 1 AND plnolety = 1 AND odhlasene_o IS NULL
         ORDER BY id"
    )->fetchAll();

    if (count($ucastnici) < $pocet) {
        chyba('V žrebovaní je menej účastníkov ako výhier.', 422);
    }

    $vyzrebovani = vyberSoSeedom($ucastnici, $pocet, $seed);

    if (!empty($data['naostro'])) {
        $zaznam = sprintf(
            "%s\tseed: %s\túčastníkov: %d\tvýhercov: %d\tid: %s\n",
            terazIso(), $seed, count($ucastnici), $pocet,
            implode(',', array_column($vyzrebovani, 'id'))
        );
        file_put_contents(priecinokUdajov() . '/zrebovanie.log', $zaznam, FILE_APPEND | LOCK_EX);
    }

    posli([
        'seed'        => $seed,
        'ucastnikov'  => count($ucastnici),
        'zapisane'    => !empty($data['naostro']),
        /* Krstné meno ani mestskú časť tu neuvidíš. Kontakt ich neobsahuje
           a je to zámer, viď DATA.md. Doplnia sa až od výhercu pri prevzatí. */
        'vyhercovia'  => array_map(fn($u) => [
            'id'      => $u['id'],
            'kontakt' => zahmliKontakt($u['email'], $u['telefon']),
        ], $vyzrebovani),
    ]);
}

/* Deterministický výber: rovnaký seed a rovnakí účastníci dajú
   vždy rovnaký výsledok, takže sa dá zopakovať a overiť. */
function vyberSoSeedom(array $ucastnici, int $pocet, string $seed): array
{
    $poradie = [];
    foreach ($ucastnici as $index => $ucastnik) {
        $poradie[$index] = hash('sha256', $seed . '|' . $ucastnik['id']);
    }
    asort($poradie, SORT_STRING);
    $vybrate = array_slice(array_keys($poradie), 0, $pocet);
    return array_map(fn($i) => $ucastnici[$i], $vybrate);
}

function zahmliKontakt(?string $email, ?string $telefon): string
{
    if ($email !== null && $email !== '') {
        [$meno, $domena] = array_pad(explode('@', $email, 2), 2, '');
        $viditelne = mb_substr($meno, 0, 2);
        return $viditelne . str_repeat('*', max(3, mb_strlen($meno) - 2)) . '@' . $domena;
    }
    if ($telefon !== null && $telefon !== '') {
        return str_repeat('*', max(0, mb_strlen($telefon) - 3)) . mb_substr($telefon, -3);
    }
    return 'bez kontaktu';
}

/* ---------- anketa ---------- */

function vysledkyAnkety(): never
{
    zacniSedenie();
    if (($_SESSION['anketa'] ?? false) !== true) {
        chyba('Anketa je za druhým heslom.', 403);
    }

    $skupina = function (string $stlpec): array {
        $riadky = db()->query("SELECT COALESCE($stlpec, 'neuvedené') AS kluc, COUNT(*) AS pocet
                               FROM anketa GROUP BY kluc ORDER BY pocet DESC")->fetchAll();
        return array_map(fn($r) => ['kluc' => $r['kluc'], 'pocet' => (int) $r['pocet']], $riadky);
    };

    posli([
        'upozornenie' => 'Tieto čísla sa nezverejňujú a neposielajú nikomu.',
        'spolu'       => (int) db()->query('SELECT COUNT(*) FROM anketa')->fetchColumn(),
        'kandidati'   => $skupina('kandidat'),
        'ucast'       => $skupina('ucast'),
    ]);
}
