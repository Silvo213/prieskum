<?php
declare(strict_types=1);

/* Kde ležia údaje.
   Súbor databázy, .env aj denné limity musia byť MIMO webového priečinka,
   inak sa k nim dá dostať z internetu.

   Na hostingu je webový koreň /pretoze.sk/sub/prieskum/ a údaje patria
   do /pretoze.sk/udaje-prieskum/. Cestu tam nastaví .htaccess riadkom
     SetEnv PRIESKUM_UDAJE /absolutna/cesta/udaje-prieskum
   Lokálne sa použije priečinok udaje/ vedľa web/. */

function priecinokUdajov(): string
{
    $zProstredia = getenv('PRIESKUM_UDAJE');
    if (is_string($zProstredia) && $zProstredia !== '') {
        return rtrim($zProstredia, '/');
    }
    return dirname(__DIR__, 2) . '/udaje';
}

function suborDatabazy(): string
{
    return priecinokUdajov() . '/prieskum.sqlite';
}

/* .env má tvar KLUC=hodnota, riadky s # sa preskakujú. */
function nastavenia(): array
{
    static $nacitane = null;
    if ($nacitane !== null) {
        return $nacitane;
    }

    $nacitane = [];
    $cesta = priecinokUdajov() . '/.env';
    if (!is_readable($cesta)) {
        return $nacitane;
    }

    foreach (file($cesta, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $riadok) {
        $riadok = trim($riadok);
        if ($riadok === '' || str_starts_with($riadok, '#')) {
            continue;
        }
        $kus = explode('=', $riadok, 2);
        if (count($kus) === 2) {
            $nacitane[trim($kus[0])] = trim($kus[1]);
        }
    }
    return $nacitane;
}

function nastavenie(string $kluc, string $predvolene = ''): string
{
    return nastavenia()[$kluc] ?? $predvolene;
}

/* Kódy tímov, ktoré smú odosielať v terénnom režime. */
function kodyTimov(): array
{
    $zoznam = nastavenie('TIMY');
    if ($zoznam === '') {
        return [];
    }
    return array_values(array_filter(array_map('trim', explode(',', $zoznam))));
}

function dnesnyDatum(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('Europe/Bratislava')))->format('Y-m-d');
}

function terazIso(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('Europe/Bratislava')))->format('c');
}
