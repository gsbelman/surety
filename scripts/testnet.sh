#!/usr/bin/env bash
# Same flow as mainnet.sh, on Arc testnet. Fund the deployer at https://faucet.circle.com first.
exec "$(dirname "${BASH_SOURCE[0]}")/run-network.sh" testnet
