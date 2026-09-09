<?php
declare(strict_types=1);

require_once __DIR__ . '/konfig.php';

function uuid4(): string
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

function jeUuid4(mixed $hodnota): bool
{
    return is_string($hodnota)
        && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $hodnota) === 1;
}

function posli(array $telo, int $stav = 200): never
{
    http_response_code($stav);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($telo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/* Chybové hlášky vidí človek, preto sú po slovensky a bez cudzích slov. */
function chyba(string $sprava, int $stav = 400): never
{
    posli(['ok' => false, 'chyba' => $sprava], $stav);
}

function telo(): array
{
    $surove = file_get_contents('php://input');
    if ($surove === false || $surove === '') {
        chyba('Prišla prázdna požiadavka.');
    }
    if (strlen($surove) > 64 * 1024) {
        chyba('Odpoveď je príliš veľká.', 413);
    }
    $data = json_decode($surove, true);
    if (!is_array($data)) {
        chyba('Odpoveď sa nedá prečítať.');
    }
    return $data;
}

/* Do ankety a do kontaktov nesmie prísť ani jedno pole navyše.
   Keby tam frontend omylom poslal čokoľvek, čo tie tabuľky spája,
   server to odmietne, nie prehliadne. */
function lenTietoPolia(array $data, array $povolene): void
{
    $navyse = array_diff(array_keys($data), $povolene);
    if ($navyse !== []) {
        chyba('Požiadavka obsahuje pole, ktoré sem nepatrí: ' . implode(', ', $navyse), 422);
    }
}

function dotaznik(): array
{
    static $nacitany = null;
    if ($nacitany === null) {
        $surovy = file_get_contents(dirname(__DIR__) . '/data/questions.json');
        $nacitany = json_decode((string) $surovy, true);
        if (!is_array($nacitany)) {
            throw new RuntimeException('Súbor s otázkami sa nedá prečítať.');
        }
    }
    return $nacitany;
}

function rotujuceBloky(): array
{
    $pismena = [];
    foreach (dotaznik()['bloky'] as $blok) {
        if (($blok['typ'] ?? '') === 'rotujuci') {
            $pismena[] = $blok['pismeno'];
        }
    }
    sort($pismena);
    return $pismena;
}

/* Mapa otázka -> pravidlá, podľa ktorej sa odpovede overujú.
   Aplikácia sa rendruje z questions.json, overuje sa proti tomu istému
   súboru, takže sa to nemôže rozísť. */
function pravidlaOtazok(): array
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
        $blokId = $blok['id'];

        if (($blok['format'] ?? '') === 'bateria') {
            foreach ($blok['vyroky'] as $vyrok) {
                $mapa[$vyrok['id']] = [
                    'blok'     => $blokId,
                    'format'   => 'jedna',
                    'povinne'  => (bool) ($blok['povinne'] ?? false),
                    'moznosti' => $blok['skala'],
                ];
            }
            continue;
        }

        foreach ($blok['otazky'] ?? [] as $otazka) {
            $mapa[$otazka['id']] = [
                'blok'      => $blokId,
                'format'    => $otazka['format'],
                'povinne'   => (bool) ($otazka['povinne'] ?? false),
                'moznosti'  => $otazka['moznosti'] ?? null,
                'pocet'     => $otazka['pocet'] ?? null,
                'maxZnakov' => $otazka['maxZnakov'] ?? 500,
            ];
        }
    }
    return $mapa;
}

/* Ktoré otázky má dostať človek, ktorému pripadol daný rotujúci blok. */
function otazkyPreBlok(string $pismeno): array
{
    $rotujuce = [];
    foreach (dotaznik()['bloky'] as $blok) {
        if (($blok['typ'] ?? '') === 'rotujuci') {
            $rotujuce[$blok['pismeno']] = $blok['id'];
        }
    }
    $mojBlok = $rotujuce[$pismeno] ?? null;
    $ine = array_values(array_diff(array_values($rotujuce), [$mojBlok]));

    $vysledok = [];
    foreach (pravidlaOtazok() as $id => $pravidlo) {
        if (in_array($pravidlo['blok'], $ine, true) || $pravidlo['blok'] === 'bonus') {
            continue;
        }
        $vysledok[$id] = $pravidlo;
    }
    return $vysledok;
}

/* Vráti zoznam chýb. Prázdne pole znamená, že odpovede sedia. */
function skontrolujOdpovede(array $odpovede, string $pismeno): array
{
    $ocakavane = otazkyPreBlok($pismeno);
    $chyby = [];

    foreach (array_keys($odpovede) as $id) {
        if (!isset($ocakavane[$id])) {
            $chyby[] = "Otázka $id do tohto dotazníka nepatrí.";
        }
    }

    foreach ($ocakavane as $id => $p) {
        $hodnota = $odpovede[$id] ?? null;
        $prazdna = $hodnota === null || $hodnota === '' || $hodnota === [];

        if ($prazdna) {
            if ($p['povinne']) {
                $chyby[] = "Otázka $id nie je zodpovedaná.";
            }
            continue;
        }

        switch ($p['format']) {
            case 'jedna':
                if (!is_string($hodnota) || !in_array($hodnota, $p['moznosti'], true)) {
                    $chyby[] = "Otázka $id má odpoveď, ktorá nie je v ponuke.";
                }
                break;

            case 'viac':
                if (!is_array($hodnota)) {
                    $chyby[] = "Otázka $id má mať zoznam odpovedí.";
                    break;
                }
                if (count($hodnota) !== count(array_unique($hodnota))) {
                    $chyby[] = "Otázka $id má tú istú odpoveď dvakrát.";
                    break;
                }
                if ($p['pocet'] !== null && count($hodnota) !== (int) $p['pocet']) {
                    $chyby[] = "Pri otázke $id treba vybrať presne " . $p['pocet'] . ".";
                    break;
                }
                foreach ($hodnota as $jedna) {
                    if (!is_string($jedna) || !in_array($jedna, $p['moznosti'], true)) {
                        $chyby[] = "Otázka $id má odpoveď, ktorá nie je v ponuke.";
                        break 2;
                    }
                }
                break;

            case 'text':
            case 'ulica':
                if (!is_string($hodnota)) {
                    $chyby[] = "Otázka $id má mať text.";
                } elseif (mb_strlen($hodnota) > (int) $p['maxZnakov']) {
                    $chyby[] = "Odpoveď na otázku $id je pridlhá.";
                }
                break;
        }
    }

    return $chyby;
}

/* Obmedzenie počtu odoslaní z jedného zariadenia.

   IP adresa sa nikam nezapisuje. Drží sa len jej odtlačok s dennou
   náhodnou soľou v jednom súbore, ktorý sa každý deň prepíše nanovo.
   Včerajšia soľ tým zmizne a odtlačky sa už k ničomu nedajú priradiť.
   PHP nemá pamäť medzi požiadavkami, preto súbor a nie RAM. */
function odtlackovySubor(): string
{
    return priecinokUdajov() . '/limity.json';
}

function pocetOdoslaniDnes(string $ip): int
{
    return upravLimity($ip, false);
}

function zapocitajOdoslanie(string $ip): void
{
    upravLimity($ip, true);
}

function upravLimity(string $ip, bool $pripocitaj): int
{
    $cesta = odtlackovySubor();
    $subor = fopen($cesta, 'c+');
    if ($subor === false) {
        return 0;   // keď sa limity nedajú viesť, radšej pustíme odpoveď ďalej
    }

    try {
        flock($subor, LOCK_EX);
        $obsah = stream_get_contents($subor);
        $stav  = json_decode((string) $obsah, true);
        $dnes  = dnesnyDatum();

        if (!is_array($stav) || ($stav['den'] ?? '') !== $dnes) {
            $stav = ['den' => $dnes, 'sol' => bin2hex(random_bytes(32)), 'pocty' => []];
        }

        $odtlacok = substr(hash_hmac('sha256', $ip, $stav['sol']), 0, 32);
        $doteraz  = (int) ($stav['pocty'][$odtlacok] ?? 0);

        if ($pripocitaj) {
            $stav['pocty'][$odtlacok] = $doteraz + 1;
            ftruncate($subor, 0);
            rewind($subor);
            fwrite($subor, (string) json_encode($stav, JSON_UNESCAPED_UNICODE));
            fflush($subor);
            @chmod($cesta, 0640);
        }

        return $doteraz;
    } finally {
        flock($subor, LOCK_UN);
        fclose($subor);
    }
}

/* IP sa použije, hneď zahashuje a nikam sa neuloží. */
function adresaVolajuceho(): string
{
    return (string) ($_SERVER['REMOTE_ADDR'] ?? 'neznama');
}
