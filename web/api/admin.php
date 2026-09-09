<?php
declare(strict_types=1);

require_once __DIR__ . '/pomocky.php';

/* Admin sa dopĺňa v ďalšom kroku. Zatiaľ tu nie je nič, čo by sa dalo
   otvoriť, aby na server nešlo nedokončené prihlasovanie. */
function admin(string $sposob, string $cesta): never
{
    chyba('Správa prieskumu ešte nie je pripravená.', 503);
}
