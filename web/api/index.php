<?php
declare(strict_types=1);

require_once __DIR__ . '/pomocky.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/verejne.php';
require_once __DIR__ . '/admin.php';

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

/* Cesta za /api. Funguje s prepisom aj bez neho. */
function cesta(): string
{
    $c = $_SERVER['PATH_INFO'] ?? '';
    if ($c === '') {
        $c = parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH) ?: '';
        $poloha = strpos($c, '/api');
        if ($poloha !== false) {
            $c = substr($c, $poloha + 4);
        }
        $c = preg_replace('#^/index\.php#', '', $c) ?? '';
    }
    return '/' . trim($c, '/');
}

$sposob = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$cesta  = cesta();

try {
    match (true) {
        $sposob === 'GET'   && $cesta === '/blok'      => dajRotujuciBlok(),
        $sposob === 'POST'  && $cesta === '/odpovede'  => ulozOdpoved(),
        $sposob === 'PATCH' && str_starts_with($cesta, '/odpovede/')
                                                       => ulozBonus(substr($cesta, 10)),
        $sposob === 'POST'  && $cesta === '/anketa'    => ulozAnketu(),
        $sposob === 'POST'  && $cesta === '/kontakty'  => ulozKontakt(),
        $sposob === 'GET'   && $cesta === '/zdravie'   => posli(['ok' => true, 'php' => PHP_VERSION]),
        str_starts_with($cesta, '/admin')              => admin($sposob, substr($cesta, 6)),
        default                                        => chyba('Taká adresa tu nie je.', 404),
    };
} catch (Throwable $problem) {
    error_log('prieskum: ' . $problem->getMessage());
    chyba('Na serveri nastala chyba. Skúste to o chvíľu znova.', 500);
}
