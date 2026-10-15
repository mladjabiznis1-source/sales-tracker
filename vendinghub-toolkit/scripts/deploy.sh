#!/bin/sh
# Deploys the toolkit to Netlify (site pack-placement-inner-circle) from an isolated copy, so the
# Netlify CLI never picks up some other project's netlify.toml or functions.
# First time on a machine: npm install, put access-codes.xlsx in this folder, then
#   .venv/bin/python scripts/make-codes.py 0 --add   (rebuilds code-hashes.js from the sheet)
#   node scripts/pull-live-data.mjs                   (fetches places/income data from the live site)
set -e
SITE=e80e2a51-c72a-4385-9e7c-10c507a9b467   # pack-placement-inner-circle
HERE="$(cd "$(dirname "$0")/.." && pwd)"
NETLIFY="${NETLIFY:-npx --yes netlify-cli@26.1.0}"

# Refuse to ship a deploy that would lock students out or empty Locations / Dwell Check.
[ -f "$HERE/netlify/edge-functions/_shared/code-hashes.js" ] || { echo "Missing code-hashes.js: run make-codes.py 0 --add with access-codes.xlsx first." >&2; exit 1; }
[ -f "$HERE/public/places/index.json" ] && [ -d "$HERE/public/income" ] || { echo "Missing public/places or public/income: run node scripts/pull-live-data.mjs first." >&2; exit 1; }
[ -d "$HERE/node_modules" ] || { echo "Run npm install first." >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/netlify"
cp -R "$HERE/public" "$HERE/package.json" "$HERE/package-lock.json" "$HERE/node_modules" "$TMP/"
cp -R "$HERE/netlify/edge-functions" "$TMP/netlify/"
# Same config, plus: no build command and a functions dir that doesn't exist (edge functions only).
sed 's|^\[build\]|[build]\n  command = ""\n  functions = "netlify/no-functions"|' "$HERE/netlify.toml" > "$TMP/netlify.toml"

cd "$TMP"
$NETLIFY deploy --prod --no-build --dir public --site "$SITE"
