#!/bin/sh
# Nahrá obsah priečinka web/ na prieskum.pretoze.sk.
#
# Hosting je WebSupport a shell konzola je len dočasná, takže port aj
# používateľské meno sa po jej vypnutí menia. Nájdeš ich v správe
# WebSupportu pod Pokročilá konfigurácia → Konzola.
#
# Použitie:
#   SSH_UID=uid5665758 SSH_PORT=28755 sh skripty/nasadit.sh
#
# Predpoklad: tvoj SSH kľúč je v konzole pridaný (sekcia SSH kľúče).

set -e
KOREN=$(cd "$(dirname "$0")/.." && pwd)
cd "$KOREN"

: "${SSH_UID:?Nastav SSH_UID, nájdeš ho v konzole WebSupportu}"
: "${SSH_PORT:?Nastav SSH_PORT, nájdeš ho v konzole WebSupportu}"
SSH_HOST=${SSH_HOST:-shell.r6.websupport.sk}
SSH_KEY=${SSH_KEY:-$HOME/.ssh/id_ed25519_klastor}
DOM=${DOM:-/data/c/0/c070edc1-bb1b-4dc1-a48c-09a3e95570a2/pretoze.sk}

SSH="ssh -o StrictHostKeyChecking=no -i $SSH_KEY -p $SSH_PORT $SSH_UID@$SSH_HOST"

echo "Nahrávam do $DOM/sub/prieskum"
$SSH "mkdir -p '$DOM/sub/prieskum' '$DOM/udaje-prieskum' && chmod 750 '$DOM/udaje-prieskum'"

# Súbory idú celé nanovo. Databáza ani nastavenia sa nedotknú, ležia inde.
tar -czf - -C web . 2>/dev/null | $SSH "tar -xzf - -C '$DOM/sub/prieskum' 2>/dev/null"

# Cesta k údajom musí byť v .htaccess absolútna
$SSH "cd '$DOM/sub/prieskum' \
  && sed -i 's|^# *SetEnv PRIESKUM_UDAJE .*|SetEnv PRIESKUM_UDAJE $DOM/udaje-prieskum|' .htaccess \
  && sed -i 's|^AuthUserFile CESTA_K_HTPASSWD\$|AuthUserFile $DOM/udaje-prieskum/.htpasswd|' .htaccess \
  && grep -q '^SetEnv PRIESKUM_UDAJE' .htaccess && echo 'cesta k údajom nastavená'
  if grep -q '^AuthUserFile ' .htaccess; then echo 'stránka je zavretá heslom'; else echo 'stránka je verejná'; fi"

echo "Skúšam, či to žije:"
STAV=$(curl -s --max-time 20 -o /dev/null -w '%{http_code}' https://prieskum.pretoze.sk/api/zdravie)
if [ "$STAV" = "401" ]; then
  echo "  401 — stránka je zavretá heslom, to je zatiaľ správne."
  if [ -n "$HESLO_STRANKY" ]; then
    echo "  s heslom: $(curl -s --max-time 20 -u "prieskum:$HESLO_STRANKY" https://prieskum.pretoze.sk/api/zdravie)"
  fi
else
  curl -s --max-time 20 https://prieskum.pretoze.sk/api/zdravie
  echo
fi
echo "Hotovo. https://prieskum.pretoze.sk/"
