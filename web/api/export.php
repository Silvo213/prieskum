<?php
declare(strict_types=1);

require_once __DIR__ . '/pomocky.php';
require_once __DIR__ . '/db.php';

/* Exporty. Tri tabuľky, tri samostatné súbory, nikdy spojené.
   Anketa a kontakty vychádzajú v náhodnom poradí, aby sa nedali
   spárovať podľa toho, ako ležia za sebou. */

function export(string $co): never
{
    [$tabulka, $format] = array_pad(explode('.', $co, 2), 2, 'csv');
    if (!in_array($format, ['csv', 'xlsx'], true)) {
        chyba('Export viem urobiť ako csv alebo xlsx.', 404);
    }

    [$hlavicka, $riadky, $nazov] = match ($tabulka) {
        'odpovede' => exportOdpovedi(),
        'anketa'   => exportAnkety(),
        'kontakty' => exportKontaktov(),
        'citaty'   => exportCitatov(),
        default    => chyba('Taká tabuľka tu nie je.', 404),
    };

    $subor = $nazov . '-' . dnesnyDatum() . '.' . $format;
    if ($format === 'csv') {
        posliCsv($hlavicka, $riadky, $subor);
    }
    posliXlsx($hlavicka, $riadky, $subor, $nazov);
}

function exportOdpovedi(): array
{
    /* Odpovede sa rozbalia do stĺpcov, aby sa dali rovno počítať.
       Poradie stĺpcov je poradie otázok v dotazníku. */
    $otazky = [];
    foreach (dotaznik()['bloky'] as $blok) {
        if (($blok['ulozisko'] ?? '') !== 'odpovede') {
            continue;
        }
        foreach ($blok['vyroky'] ?? [] as $vyrok) {
            $otazky[$vyrok['id']] = $vyrok['text'];
        }
        foreach ($blok['otazky'] ?? [] as $otazka) {
            $otazky[$otazka['id']] = $otazka['text'];
        }
    }

    $hlavicka = array_merge(
        ['id', 'vytvorene_o', 'zdroj', 'tim_kod', 'miesto_zberu', 'rotujuci_blok',
         'mestska_cast', 'vek', 'pohlavie', 'trvanie_s', 'podozrive', 'neplatne'],
        array_keys($otazky)
    );

    $riadky = [];
    foreach (db()->query('SELECT * FROM odpovede ORDER BY vytvorene_o') as $r) {
        $obsah = json_decode($r['odpovede_json'], true) ?: [];
        $bonus = $obsah['bonus'] ?? [];
        $riadok = [
            $r['id'], $r['vytvorene_o'], $r['zdroj'], $r['tim_kod'], $r['miesto_zberu'],
            $r['rotujuci_blok'], $r['mestska_cast'], $r['vek'], $r['pohlavie'],
            $r['trvanie_s'], $r['podozrive'], $r['neplatne'],
        ];
        foreach (array_keys($otazky) as $id) {
            $hodnota = $obsah[$id] ?? $bonus[$id] ?? '';
            $riadok[] = is_array($hodnota) ? implode(' | ', $hodnota) : $hodnota;
        }
        $riadky[] = $riadok;
    }

    return [$hlavicka, $riadky, 'odpovede'];
}

function exportAnkety(): array
{
    $riadky = [];
    foreach (db()->query('SELECT id, datum, kandidat, ucast, mestska_cast, vek FROM anketa') as $r) {
        $riadky[] = array_values($r);
    }
    shuffle($riadky);
    return [['id', 'datum', 'kandidat', 'ucast', 'mestska_cast', 'vek'], $riadky, 'anketa'];
}

function exportKontaktov(): array
{
    $riadky = [];
    $dopyt = 'SELECT id, datum, email, telefon, suhlas_zrebovanie, suhlas_informacie, plnolety, odhlasene_o FROM kontakty';
    foreach (db()->query($dopyt) as $r) {
        $riadky[] = array_values($r);
    }
    shuffle($riadky);
    return [
        ['id', 'datum', 'email', 'telefon', 'suhlas_zrebovanie', 'suhlas_informacie', 'plnolety', 'odhlasene_o'],
        $riadky,
        'kontakty',
    ];
}

function exportCitatov(): array
{
    $otvorene = otvoreneOtazky();
    $riadky = [];
    $dopyt = 'SELECT c.odpoved_id, c.otazka_id, c.oznacene_o, o.mestska_cast, o.vek, o.zdroj, o.odpovede_json
              FROM citaty c JOIN odpovede o ON o.id = c.odpoved_id
              ORDER BY c.oznacene_o';
    foreach (db()->query($dopyt) as $r) {
        $obsah = json_decode($r['odpovede_json'], true) ?: [];
        $text = $obsah[$r['otazka_id']] ?? ($obsah['bonus'][$r['otazka_id']] ?? '');
        $riadky[] = [
            $r['odpoved_id'],
            $otvorene[$r['otazka_id']] ?? $r['otazka_id'],
            is_string($text) ? $text : '',
            $r['mestska_cast'], $r['vek'], $r['zdroj'], substr((string) $r['oznacene_o'], 0, 10),
        ];
    }
    return [['odpoved_id', 'otazka', 'citat', 'mestska_cast', 'vek', 'zdroj', 'oznacene'], $riadky, 'citaty'];
}

/* ---------- CSV ---------- */

function posliCsv(array $hlavicka, array $riadky, string $subor): never
{
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $subor . '"');
    header('Cache-Control: no-store');

    $vystup = fopen('php://output', 'w');
    fwrite($vystup, "\xEF\xBB\xBF");        // aby Excel neurobil z diakritiky kašu
    fputcsv($vystup, $hlavicka, ';', '"', '');
    foreach ($riadky as $riadok) {
        fputcsv($vystup, $riadok, ';', '"', '');
    }
    fclose($vystup);
    exit;
}

/* ---------- XLSX ---------- */

/* Zošit sa skladá ručne. Je to zip s niekoľkými XML súbormi a na to,
   čo potrebujeme, netreba knižnicu. */
function posliXlsx(array $hlavicka, array $riadky, string $subor, string $hárok): never
{
    $docasny = tempnam(sys_get_temp_dir(), 'prieskum');
    $zip = new ZipArchive();
    $zip->open($docasny, ZipArchive::OVERWRITE);

    $zip->addFromString('[Content_Types].xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' .
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' .
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' .
        '<Default Extension="xml" ContentType="application/xml"/>' .
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' .
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' .
        '</Types>');

    $zip->addFromString('_rels/.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' .
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' .
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' .
        '</Relationships>');

    $zip->addFromString('xl/workbook.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' .
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' .
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' .
        '<sheets><sheet name="' . htmlspecialchars($hárok, ENT_QUOTES, 'UTF-8') . '" sheetId="1" r:id="rId1"/></sheets></workbook>');

    $zip->addFromString('xl/_rels/workbook.xml.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' .
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' .
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' .
        '</Relationships>');

    $harok = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' .
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
    $harok .= xlsxRiadok($hlavicka, 1);
    foreach ($riadky as $poradie => $riadok) {
        $harok .= xlsxRiadok($riadok, $poradie + 2);
    }
    $harok .= '</sheetData></worksheet>';
    $zip->addFromString('xl/worksheets/sheet1.xml', $harok);
    $zip->close();

    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    header('Content-Disposition: attachment; filename="' . $subor . '"');
    header('Cache-Control: no-store');
    readfile($docasny);
    unlink($docasny);
    exit;
}

function xlsxRiadok(array $bunky, int $cislo): string
{
    $xml = '<row r="' . $cislo . '">';
    foreach (array_values($bunky) as $index => $hodnota) {
        $adresa = xlsxStlpec($index) . $cislo;
        if (is_int($hodnota) || (is_string($hodnota) && $hodnota !== '' && ctype_digit($hodnota))) {
            $xml .= '<c r="' . $adresa . '"><v>' . (int) $hodnota . '</v></c>';
            continue;
        }
        $text = (string) $hodnota;
        if ($text === '') {
            continue;
        }
        /* Znaky, ktoré XML nepovoľuje, by celý súbor rozbili. */
        $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $text) ?? '';
        $xml .= '<c r="' . $adresa . '" t="inlineStr"><is><t xml:space="preserve">'
              . htmlspecialchars($text, ENT_QUOTES | ENT_XML1, 'UTF-8') . '</t></is></c>';
    }
    return $xml . '</row>';
}

function xlsxStlpec(int $index): string
{
    $meno = '';
    for ($i = $index; $i >= 0; $i = intdiv($i, 26) - 1) {
        $meno = chr(65 + $i % 26) . $meno;
    }
    return $meno;
}
