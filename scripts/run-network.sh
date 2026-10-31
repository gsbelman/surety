#!/usr/bin/env bash
# Deploys SuretyEscrow if needed, runs the agent demo, and writes the report.
# Usage: scripts/run-network.sh <mainnet|testnet|local>
set -euo pipefail

NETWORK="${1:?Usage: run-network.sh <mainnet|testnet|local>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$HOME/.foundry/bin:$PATH"

case "$NETWORK" in
  mainnet) RPC=https://rpc.mainnet.arc.io; CHAIN_ID=5042; EXPLORER_API=https://explorer.arc.io/api/ ;;
  testnet) RPC=https://rpc.testnet.arc.io; CHAIN_ID=5042002; EXPLORER_API=https://explorer.testnet.arc.io/api/ ;;
  local) RPC=http://127.0.0.1:8545; CHAIN_ID=31337; EXPLORER_API= ;;
  *) echo "Unknown network: $NETWORK"; exit 1 ;;
esac

[ -f .env ] || { echo "Missing .env."; exit 1; }
set -a; source .env; set +a

FORGE=$(command -v arc-forge || command -v forge) || { echo "Install Arc Foundry or Foundry."; exit 1; }
CAST=$(command -v arc-cast || command -v cast)
USDC=0x3600000000000000000000000000000000000000
MIN_DEPLOYER_BASE_UNITS=2400000 # 2.40 USDC: demo balances plus gas.

[ -d node_modules ] || npm ci

echo "==> Preflight on $NETWORK"
ACTUAL_CHAIN_ID=$("$CAST" chain-id --rpc-url "$RPC")
[ "$ACTUAL_CHAIN_ID" = "$CHAIN_ID" ] || { echo "RPC chain id $ACTUAL_CHAIN_ID, expected $CHAIN_ID."; exit 1; }

BALANCE=$("$CAST" call "$USDC" 'balanceOf(address)(uint256)' "$DEPLOYER_ADDRESS" --rpc-url "$RPC" | awk '{print $1}')
ADDRESS=$(node -e "console.log(require('./app/src/contract/deployments.json')['$NETWORK'].address ?? '')")
if [ -z "$ADDRESS" ] && [ "$BALANCE" -lt "$MIN_DEPLOYER_BASE_UNITS" ]; then
  echo "Deployer $DEPLOYER_ADDRESS has $BALANCE base units of USDC. It needs $MIN_DEPLOYER_BASE_UNITS."
  echo "Fund the deployer, then run this script again. Nothing was spent."
  exit 1
fi

echo "==> Contract tests"
(cd contracts && "$FORGE" test -q)

# A contract on a restarted local node does not exist any more, so check the code too.
if [ -n "$ADDRESS" ] && [ "$("$CAST" code "$ADDRESS" --rpc-url "$RPC")" = "0x" ]; then
  echo "No code at $ADDRESS. Deploying again."
  ADDRESS=
fi

if [ -z "$ADDRESS" ]; then
  echo "==> Deploy"
  (cd contracts && "$FORGE" script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast -q)
  node scripts/record-deployment.mjs "$NETWORK" "$CHAIN_ID"
  ADDRESS=$(node -e "console.log(require('./app/src/contract/deployments.json')['$NETWORK'].address)")
fi
echo "SuretyEscrow: $ADDRESS"

if [ -n "$EXPLORER_API" ]; then
  echo "==> Verify source on the explorer"
  VERIFY_ARGS=("$ADDRESS" src/SuretyEscrow.sol:SuretyEscrow --rpc-url "$RPC"
    --verifier blockscout --verifier-url "$EXPLORER_API"
    --constructor-args "$("$CAST" abi-encode 'constructor(address)' "$USDC")")
  # The mainnet explorer sits behind a bot check, so a scripted upload can fail.
  # A failure here does not affect the deployment or the demo.
  if ! (cd contracts && "$FORGE" verify-contract "${VERIFY_ARGS[@]}" --watch); then
    (cd contracts && "$FORGE" verify-contract "${VERIFY_ARGS[@]}" --show-standard-json-input > out/standard-input.json)
    echo "WARNING: scripted verification failed. Upload contracts/out/standard-input.json by hand:"
    echo "  ${EXPLORER_API%api/}contract-verification (compiler 0.8.30, standard JSON input)"
  fi
fi

echo "==> Agent demo"
SURETY_NETWORK="$NETWORK" npm run --silent demo

echo "==> Report"
SURETY_NETWORK="$NETWORK" npm run --silent report -w agent

if [ "$NETWORK" = mainnet ]; then
  echo "==> Publish the addresses and hashes"
  git add README.md SUBMISSION.md app/src/contract/deployments.json agent/runs/mainnet.json contracts/broadcast
  git commit -q -m "Record mainnet deployment and demo transactions"
  git push -q
fi
