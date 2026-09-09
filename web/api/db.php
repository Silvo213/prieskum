<?php
declare(strict_types=1);

require_once __DIR__ . '/konfig.php';

/* Jedno pripojenie na požiadavku. Migrácie sú číslované .sql súbory
   a púšťajú sa samé, keď v databáze ešte nebežali. */
function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $priecinok = priecinokUdajov();
    if (!is_dir($priecinok) && !@mkdir($priecinok, 0750, true) && !is_dir($priecinok)) {
        throw new RuntimeException('Priečinok na údaje sa nedá vytvoriť: ' . $priecinok);
    }

    $pdo = new PDO('sqlite:' . suborDatabazy(), null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);

    /* Zdieľaný hosting nemá vždy zdieľanú pamäť pre WAL, preto obyčajný
       žurnál a dostatočne dlhé čakanie na zámok. Pri dvoch tisícoch
       odpovedí za tri týždne to bohato stačí. */
    $pdo->exec('PRAGMA busy_timeout = 5000');
    $pdo->exec('PRAGMA synchronous = FULL');

    @chmod(suborDatabazy(), 0640);
    spustiMigracie($pdo);

    return $pdo;
}

function spustiMigracie(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS migracie (
        nazov      TEXT PRIMARY KEY NOT NULL,
        spustene_o TEXT NOT NULL
    )');

    $hotove = $pdo->query('SELECT nazov FROM migracie')->fetchAll(PDO::FETCH_COLUMN);
    $subory = glob(__DIR__ . '/migracie/*.sql') ?: [];
    sort($subory);

    foreach ($subory as $subor) {
        $nazov = basename($subor);
        if (in_array($nazov, $hotove, true)) {
            continue;
        }
        $pdo->beginTransaction();
        try {
            $pdo->exec((string) file_get_contents($subor));
            $vloz = $pdo->prepare('INSERT INTO migracie (nazov, spustene_o) VALUES (?, ?)');
            $vloz->execute([$nazov, terazIso()]);
            $pdo->commit();
        } catch (Throwable $chyba) {
            $pdo->rollBack();
            throw $chyba;
        }
    }
}
