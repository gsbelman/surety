#!/usr/bin/env bash
# Runs the Arc Studio work: import, tests, audit, testnet deploy, and app preview.
# Run `arc-studio login --paste` once first. The turns take about 30 minutes in total.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
SESSION=surety

arc-studio whoami >/dev/null || { echo "Run: arc-studio login --paste"; exit 1; }
arc-studio usage

run() {
  echo "==> $1"
  arc-studio run --prompt-file "$1" --session "$SESSION" --output json > "/tmp/surety-studio-$(basename "$1").json"
}

echo "==> Create the sandbox and clone the repo"
arc-studio run "Create an empty workspace. I will clone a repository next." --session "$SESSION" --output json >/dev/null
arc-studio clone gsbelman/surety --session "$SESSION"

run studio/01-verify-and-audit.md
run studio/02-extend-tests.md
run studio/03-testnet-and-app.md

echo "==> Pull the results into studio-output/"
arc-studio pull --session "$SESSION" --out studio-output --paths "surety/contracts/**"
if ! diff -q contracts/src/SuretyEscrow.sol studio-output/surety/contracts/src/SuretyEscrow.sol; then
  echo "WARNING: Studio changed the contract. Review the diff and copy it before mainnet:"
  echo "  diff contracts/src/SuretyEscrow.sol studio-output/surety/contracts/src/SuretyEscrow.sol"
fi

arc-studio deployments --session "$SESSION" --json
arc-studio open --session "$SESSION"
