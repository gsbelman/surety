#!/usr/bin/env bash
# Rebuilds the app and deploys it to Cloudflare Pages.
# Run it after scripts/mainnet.sh: the build reads the address from deployments.json.
set -euo pipefail

PROJECT=surety-arc
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[ -d node_modules ] || npm ci

echo "==> Build"
npm run build

echo "==> Check the build"
if grep -rqE '127\.0\.0\.1|localhost|31337|Arc Local' app/dist; then
  echo "The build contains local node config. Nothing was deployed."
  exit 1
fi
if [ -f .env ]; then
  while IFS= read -r secret; do
    if grep -rqF -- "$secret" app/dist; then
      echo "The build contains a private key from .env. Nothing was deployed."
      exit 1
    fi
  done < <(sed -n 's/^[A-Z_]*_PRIVATE_KEY=//p' .env | grep .)
fi

ADDRESS=$(node -e "console.log(require('./app/src/contract/deployments.json').mainnet.address ?? 'not deployed')")
echo "Mainnet contract: $ADDRESS"

echo "==> Deploy to Cloudflare Pages"
# Wrangler refuses to run in the root of an npm workspace.
cd app
npx wrangler pages deploy dist --project-name "$PROJECT" --branch main --commit-dirty=true
