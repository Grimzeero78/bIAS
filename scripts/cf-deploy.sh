#!/bin/bash
# TrueMerit → Cloudflare Workers deploy script.
# Requires a VALID Cloudflare API token with Workers/D1/R2 permissions:
#   export CLOUDFLARE_API_TOKEN=...   (user token, NOT the global key)
# Then: bash scripts/cf-deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "✗ CLOUDFLARE_API_TOKEN is not set."
  echo "  Create a token at https://dash.cloudflare.com/profile/api-tokens"
  echo "  (template: 'Edit Cloudflare Workers', plus D1 + R2 edit perms)."
  exit 1
fi

echo "── verifying token ──"
VERIFY=$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify)
echo "$VERIFY" | grep -q '"success":true' || { echo "✗ token invalid: $VERIFY"; exit 1; }

echo "── resolving account ──"
ACCOUNT_ID=$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/accounts | python3 -c "import json,sys; print(json.load(sys.stdin)['result'][0]['id'])")
echo "account: $ACCOUNT_ID"

echo "── provisioning D1 + R2 (idempotent) ──"
D1_JSON=$(CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=$ACCOUNT_ID bunx wrangler d1 create truemerit 2>/dev/null || true)
if echo "$D1_JSON" | grep -q database_id; then
  D1_ID=$(echo "$D1_JSON" | grep -o '"database_id": "[^"]*"' | head -1 | cut -d'"' -f4)
else
  D1_ID=$(CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=$ACCOUNT_ID bunx wrangler d1 list --json | python3 -c "import json,sys; d=json.load(sys.stdin); print([x['uuid'] for x in d if x['name']=='truemerit'][0])")
fi
echo "d1: $D1_ID"
sed -i.bak "s/REPLACE_WITH_YOUR_D1_ID/$D1_ID/" wrangler.jsonc

CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=$ACCOUNT_ID bunx wrangler r2 bucket create truemerit-files 2>/dev/null || echo "(r2 bucket exists)"

echo "── applying D1 migrations ──"
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=$ACCOUNT_ID bunx wrangler d1 migrations apply truemerit --remote

echo "── building + deploying ──"
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=$ACCOUNT_ID bun run cf:deploy

echo ""
echo "✅ Deployed. Set secrets if you haven't:"
echo "   bunx wrangler secret put AUTH_SECRET"
echo "   bunx wrangler secret put ZAI_CONFIG_JSON"
echo "   (optionally CEO_PASSWORD / PANEL_PASSWORD)"
