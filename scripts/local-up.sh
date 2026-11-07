#!/usr/bin/env bash
# Local end-to-end stack: anvil, contracts, sample PDFs, api/.env and web/.env.
# Safe to re-run: state is kept in .local/. Use --reset to start from nothing.
# Uses anvil's public test keys. Never point this at a real network.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL="$ROOT/.local"
PORT="${LOCAL_ANVIL_PORT:-8546}"
API_PORT="${LOCAL_API_PORT:-8788}"
WEB_ORIGIN="${LOCAL_WEB_ORIGIN:-http://localhost:5173}"
RPC="http://127.0.0.1:$PORT"
OWNER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
STAFF_OWNER=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC # anvil account 2

stop_anvil() { lsof -tiTCP:"$PORT" -sTCP:LISTEN | xargs kill 2>/dev/null || true; }

if [[ "${1:-}" == "--reset" ]]; then
  stop_anvil
  sleep 1
  rm -rf "$LOCAL" "$ROOT/api/.data" "$ROOT/api/.env" "$ROOT/web/.env"
fi
mkdir -p "$LOCAL"

if ! cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
  nohup anvil --silent --port "$PORT" --state "$LOCAL/anvil-state.json" --state-interval 5 \
    >"$LOCAL/anvil.log" 2>&1 &
  for _ in $(seq 1 50); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.2; done
fi
[[ "$(cast chain-id --rpc-url "$RPC")" == 31337 ]] || { echo "Port $PORT isn't a local anvil"; exit 1; }

if [[ ! -f "$LOCAL/deployed.env" ]]; then
  (cd "$ROOT/web" && node ../scripts/sample-pdfs.mjs "$LOCAL/samples")
  hash_of() { echo "0x$(shasum -a 256 "$LOCAL/samples/$1.pdf" | cut -d' ' -f1)"; }
  OUTPUT="$(cd "$ROOT/contracts" && VALID_HASH="$(hash_of valid)" REVOKED_HASH="$(hash_of revoked)" \
    OTHER_HASH="$(hash_of other-institution)" STAFF_OWNER="$STAFF_OWNER" \
    forge script script/LocalSeed.s.sol --rpc-url "$RPC" --broadcast --skip-simulation --slow 2>&1)" \
    || { echo "$OUTPUT"; exit 1; }
  address_of() { echo "$OUTPUT" | awk -v k="$1" '$1 == k { print $2 }'; }
  cat >"$LOCAL/deployed.env" <<DEPLOYED
REGISTRY=$(address_of REGISTRY)
FACTORY=$(address_of FACTORY)
ANCHOR=$(address_of ANCHOR)
DEPLOYED
fi
# shellcheck disable=SC1091
source "$LOCAL/deployed.env"

# Optional, gitignored and kept by --reset: LOCAL_PLATFORM_WALLET and LOCAL_ADMIN_WALLET hand the
# seeded roles to your own wallets. Anvil impersonation needs no key, so nothing of yours is stored.
as_account() { # account, then cast send arguments
  local from="$1"; shift
  cast rpc anvil_impersonateAccount "$from" --rpc-url "$RPC" >/dev/null
  cast send --unlocked --from "$from" --rpc-url "$RPC" "$REGISTRY" "$@" >/dev/null
  cast rpc anvil_stopImpersonatingAccount "$from" --rpc-url "$RPC" >/dev/null
}
fund() {
  [[ "$(cast balance "$1" --rpc-url "$RPC")" != 0 ]] ||
    cast rpc anvil_setBalance "$1" 0x56BC75E2D63100000 --rpc-url "$RPC" >/dev/null # 100 ETH
}
if [[ -f "$ROOT/.env.local" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/.env.local"
  owner="$(cast call "$REGISTRY" 'owner()(address)' --rpc-url "$RPC")"
  if [[ -n "${LOCAL_ADMIN_WALLET:-}" ]]; then
    wallet="$(cast to-check-sum-address "$LOCAL_ADMIN_WALLET")"
    fund "$wallet"
    if [[ "$(cast call "$REGISTRY" 'getMember(address)((uint32,uint8))' "$wallet" --rpc-url "$RPC")" != "(1, 2)" ]]; then
      as_account "$owner" 'setInstitutionAdmin(uint32,address)' 1 "$wallet"
    fi
  fi
  if [[ -n "${LOCAL_PLATFORM_WALLET:-}" ]]; then
    wallet="$(cast to-check-sum-address "$LOCAL_PLATFORM_WALLET")"
    fund "$wallet"
    if [[ "$owner" != "$wallet" ]]; then
      as_account "$owner" 'transferOwnership(address)' "$wallet"
      as_account "$wallet" 'acceptOwnership()'
    fi
  fi
fi

if [[ ! -f "$ROOT/api/.env" ]]; then
  cat >"$ROOT/api/.env" <<ENV
# Written by scripts/local-up.sh for a local anvil chain. Not for any real network.
PORT=$API_PORT
SESSION_SECRET=$(openssl rand -hex 32)
FILE_MASTER_KEY=$(openssl rand -hex 32)
REGISTRY_ADDRESS=$REGISTRY
ACCOUNT_FACTORY=$FACTORY
CHAIN_ID=31337
RPC_URL=$RPC
WEB_ORIGIN=$WEB_ORIGIN
TRUST_PROXY=false
# Leave empty to keep the agent off. Setting it spends real money per document.
ANTHROPIC_API_KEY=
ANCHOR_ADDRESS=$ANCHOR
# Anvil's public account 0, which owns the local AuditAnchor
ANCHOR_PRIVATE_KEY=$OWNER_KEY
ENV
fi

if [[ ! -f "$ROOT/web/.env" ]]; then
  cat >"$ROOT/web/.env" <<ENV
# Written by scripts/local-up.sh for a local anvil chain.
VITE_CHAIN_ID=31337
VITE_RPC_URL=$RPC
VITE_REGISTRY_ADDRESS=$REGISTRY
VITE_API_URL=http://127.0.0.1:$API_PORT
VITE_CONTACT_EMAIL=
ENV
fi

cat <<DONE
Local chain ready at $RPC (chain 31337)
  Registry  $REGISTRY
  Factory   $FACTORY
  Anchor    $ANCHOR
  Samples   $LOCAL/samples

Next: (cd api && npm run dev) and (cd web && npm run dev)
DONE
