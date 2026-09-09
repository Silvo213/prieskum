<?php
/* Smerovač pre vstavaný server PHP (len na lokálne skúšanie).
   Spustenie: php -S localhost:8123 -t web skripty/server.php */
$cesta = parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';

if (str_starts_with($cesta, '/api')) {
    $_SERVER['PATH_INFO'] = substr($cesta, 4);
    require __DIR__ . '/../web/api/index.php';
    return true;
}
return false;
