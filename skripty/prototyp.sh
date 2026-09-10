#!/bin/sh
# Spustí prototyp na skúšanie: server, skúšobné dáta, adresy.
# Použitie:  sh skripty/prototyp.sh          (nechá, čo už je)
#            sh skripty/prototyp.sh --nanovo (zmaže databázu a naplní ju odznova)

set -e
KOREN=$(cd "$(dirname "$0")/.." && pwd)
cd "$KOREN"

PHP=${PHP:-$HOME/.local/php/php}
NODE_BIN=${NODE_BIN:-$HOME/.local/node/bin}
PATH="$NODE_BIN:$PATH"
export PATH

[ -x "$PHP" ] || { echo "PHP som nenašiel na $PHP. Nastav premennú PHP."; exit 1; }

if [ "$1" = "--nanovo" ]; then
  rm -f udaje/prieskum.sqlite udaje/limity.json
  echo "Databáza vymazaná."
fi

if [ ! -f udaje/.env ]; then
  mkdir -p udaje
  HESLO=$("$PHP" -r 'echo password_hash("prieskum2026", PASSWORD_DEFAULT);')
  ANKETA=$("$PHP" -r 'echo password_hash("anketa2026", PASSWORD_DEFAULT);')
  {
    echo "# Skúšobné nastavenia prototypu. Na server ide vlastný súbor."
    echo "TIMY=TIM1,TIM2,TIM3,TIM4"
    echo "ADMIN_MENO=silvo"
    echo "ADMIN_HESLO_HASH=$HESLO"
    echo "ANKETA_HESLO_HASH=$ANKETA"
  } > udaje/.env
  echo "Vytvorené udaje/.env s prihlásením silvo / prieskum2026."
fi

pkill -f "php -S 0.0.0.0:8123" 2>/dev/null || true
# nohup, aby server prežil zavretie okna aj koniec sedenia
nohup "$PHP" -S 0.0.0.0:8123 -t web skripty/server.php > /tmp/prieskum-prototyp.log 2>&1 &
disown 2>/dev/null || true

until curl -s -o /dev/null http://127.0.0.1:8123/api/zdravie 2>/dev/null; do sleep 1; done

POCET=$(curl -s http://127.0.0.1:8123/api/zdravie >/dev/null && echo ok)
if [ "$1" = "--nanovo" ]; then
  node skripty/skusobne-data.mjs http://127.0.0.1:8123 80 >/dev/null
  echo "Vložených 80 skúšobných dotazníkov."
fi

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo localhost)
NAZOV=$(scutil --get LocalHostName 2>/dev/null)

echo
echo "Prototyp beží."
echo
echo "Z tohto Macu:"
echo "  Dotazník        http://localhost:8123/"
echo "  Terénny tablet  http://localhost:8123/t/TIM1"
echo "  Správa          http://localhost:8123/admin/"
echo
echo "Z mobilu alebo tabletu na tej istej sieti:"
if [ -n "$NAZOV" ]; then
  echo "  http://$NAZOV.local:8123/"
  echo "  (tento názov sa nemení, aj keď sa zmení wifi)"
fi
echo "  http://$IP:8123/          (IP sa mení pri každej zmene siete)"
echo
echo "Prihlásenie do správy: silvo / prieskum2026, druhé heslo k ankete: anketa2026"
echo "Zastavíš to príkazom: pkill -f 'php -S 0.0.0.0:8123'"
