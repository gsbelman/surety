#!/usr/bin/env bash
# Rehearses the mainnet flow on a local Arc node, which has the real USDC contract at 0x3600...
# Pass --keep to leave the node running for the app.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"
set -a; source .env; set +a

RPC=http://127.0.0.1:8545
# The first default key of anvil. It is public and holds value only on a local node.
ANVIL_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

arc-anvil --network arc --block-time 1 --silent &
NODE=$!
[ "${1:-}" = "--keep" ] || trap 'kill $NODE' EXIT
sleep 2

# Stands in for the USDC that Oscar sends to the deployer on mainnet.
arc-cast send "$DEPLOYER_ADDRESS" --value 10ether --private-key "$ANVIL_KEY" --rpc-url "$RPC" >/dev/null

"$ROOT/scripts/run-network.sh" local
[ "${1:-}" != "--keep" ] || echo "Local node runs as PID $NODE."
