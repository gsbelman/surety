#!/usr/bin/env bash
# One command for mainnet: deploy, verify, run the demo, and fill in SUBMISSION.md.
# The script stops before it spends anything if the deployer is not funded.
exec "$(dirname "${BASH_SOURCE[0]}")/run-network.sh" mainnet
