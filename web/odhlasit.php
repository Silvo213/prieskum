<?php
declare(strict_types=1);

/* Odhlásenie z e-mailov. Jedno kliknutie z odkazu v správe, bez prihlásenia.
   Keď to niekto klikol omylom, na tej istej stránke sa vie prihlásiť späť. */

require_once __DIR__ . '/api/db.php';
require_once __DIR__ . '/api/konfig.php';

$token = (string) ($_GET['token'] ?? '');
$spat  = isset($_GET['spat']);

$nadpis = 'Odkaz neplatí';
$sprava = 'Tento odhlasovací odkaz nepoznáme. Možno bol už použitý alebo je neúplný.';
$dalsi  = null;

if (preg_match('/^[0-9a-f]{48}$/', $token) === 1) {
    $najdi = db()->prepare('SELECT id, odhlasene_o FROM kontakty WHERE odhlasovaci_token = ?');
    $najdi->execute([$token]);
    $riadok = $najdi->fetch();

    if ($riadok !== false) {
        if ($spat) {
            $uprav = db()->prepare('UPDATE kontakty SET odhlasene_o = NULL WHERE odhlasovaci_token = ?');
            $uprav->execute([$token]);
            $nadpis = 'Ste späť';
            $sprava = 'Výsledky prieskumu vám pošleme. Odhlásiť sa môžete kedykoľvek odkazom v každej správe.';
        } else {
            $uprav = db()->prepare('UPDATE kontakty SET odhlasene_o = ? WHERE odhlasovaci_token = ? AND odhlasene_o IS NULL');
            $uprav->execute([dnesnyDatum(), $token]);
            $nadpis = 'Odhlásili sme vás';
            $sprava = 'Už vám nič nepošleme. Váš kontakt zmažeme najneskôr 30. novembra 2026.';
            $dalsi  = 'Klikli ste omylom?';
        }
    }
}

$e = fn(string $t): string => htmlspecialchars($t, ENT_QUOTES, 'UTF-8');
?>
<!DOCTYPE html>
<html lang="sk">
<head>
<meta charset="utf-8">
<base href="/">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title><?= $e($nadpis) ?> — Aký Martin chceme</title>
<link rel="icon" href="assets/favicon-256.png" sizes="256x256">
<link rel="stylesheet" href="css/prieskum.css">
</head>
<body>

<header class="hlavicka">
  <div class="hlavicka__pas">
    <p class="znacka">Aký Martin<br>chceme</p>
  </div>
</header>

<main class="obsah">
  <h1><?= $e($nadpis) ?></h1>
  <p><?= $e($sprava) ?></p>

  <?php if ($dalsi !== null): ?>
    <p class="napoveda" style="margin-top:1.5rem;"><?= $e($dalsi) ?></p>
    <p><a class="spat" style="display:inline-flex; align-items:center;"
          href="odhlasit.php?token=<?= $e($token) ?>&amp;spat=1">Prihlásiť ma späť</a></p>
  <?php endif; ?>

  <p style="margin-top:2rem;"><a href="udaje.html">Ochrana údajov</a></p>
</main>

<div class="imprint">
  <div class="imprint__pas">
    <p>Toto je politické reklamné oznámenie. Objednávateľ: Zemko Pavol, A. Pietra 10645/19, 036 01 Martin, Slovensko · Dodávateľ: [doplní tím podľa § 15 zákona č. 181/2014 Z. z.]</p>
  </div>
</div>

</body>
</html>
