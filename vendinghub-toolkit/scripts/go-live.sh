#!/bin/sh
# One command to put this version on https://pack-placement-inner-circle.netlify.app
#   cd ~/Desktop/vendinghub-toolkit && sh scripts/go-live.sh
# Needs: Node, Python 3, and access-codes.xlsx in this folder or in ~/Downloads.
set -e
cd "$(dirname "$0")/.."
say() { printf '\n\033[1;33m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31mSTOPPED: %s\033[0m\n' "$1" >&2; exit 1; }

command -v node >/dev/null || fail "Node isn't installed. Install it from https://nodejs.org (LTS), then run this again."
command -v python3 >/dev/null || fail "Python 3 isn't installed. On a Mac run: xcode-select --install"

say "1/5 Access codes (so every student's code keeps working)"
[ -f access-codes.xlsx ] || { [ -f "$HOME/Downloads/access-codes.xlsx" ] && cp "$HOME/Downloads/access-codes.xlsx" .; }
[ -f access-codes.xlsx ] || fail "Can't find access-codes.xlsx. Put it in this folder or in Downloads."
[ -x .venv/bin/python ] || python3 -m venv .venv
.venv/bin/pip install -q openpyxl
.venv/bin/python scripts/make-codes.py 0 --add
N=$(grep -o '"[0-9a-f]\{64\}"' netlify/edge-functions/_shared/code-hashes.js | wc -l | tr -d ' ')
[ "$N" -gt 0 ] || fail "No codes were read from access-codes.xlsx."
echo "   $N student codes ready"

say "2/5 Installing packages"
npm install --silent --no-audit --no-fund

say "3/5 Copying the Locations and income data from the live site (a few minutes)"
node scripts/pull-live-data.mjs

say "4/5 Bumping the version so browsers load the new files"
V=$(date +%s)
sed -i.bak "s/styles\.css?v=[0-9]*/styles.css?v=$V/; s/app\.js?v=[0-9]*/app.js?v=$V/" public/index.html && rm -f public/index.html.bak

say "5/5 Deploying to Netlify (a browser window may open once to log in)"
sh scripts/deploy.sh

say "Done. Open https://pack-placement-inner-circle.netlify.app and log in with your admin code."
