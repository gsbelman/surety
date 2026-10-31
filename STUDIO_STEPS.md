# Arc Studio steps

Arc Studio needs a browser login, so the overnight build happened locally in the same structure. These steps bring the work into Studio, so the Studio project shows real history. The hackathon rules require this: "built outside Arc Studio" is not accepted.

Do these steps **before** mainnet. The audit can change the contract.

## 1. Log in once

Run this in a normal terminal. It opens the browser, and you paste the token back.

```sh
arc-studio login --paste
arc-studio whoami
```

## 2. Run the Studio work

```sh
cd ~/dev/surety
scripts/studio.sh
```

The script takes about 30 minutes and does the following:

1. Creates the session `surety` and clones `gsbelman/surety` into the sandbox.
2. Runs [`studio/01-verify-and-audit.md`](studio/01-verify-and-audit.md): test run and audit.
3. Runs [`studio/02-extend-tests.md`](studio/02-extend-tests.md): more tests.
4. Runs [`studio/03-testnet-and-app.md`](studio/03-testnet-and-app.md): testnet deployment with the built-in faucet, and the app in the preview.
5. Pulls `contracts/` into `studio-output/` and warns if the contract changed.
6. Opens the workspace in the browser. Copy its URL (`studio.arc.io/app/...`) into `SUBMISSION.md`.

If the script stops, read `/tmp/surety-studio-*.json`. A status of `needs_input` means that Studio asked a question. Answer in the workspace, or with `arc-studio run "<answer>" --session surety`. A status of `budget_exceeded` means that the usage limit is spent. Do not pay for an upgrade. Wait for the reset.

## 3. Bring results back

```sh
cp studio-output/surety/contracts/AUDIT.md contracts/
cp -R studio-output/surety/contracts/test/ contracts/test/
```

If the script warned that the contract changed, read the diff. If the change is good, copy the file, then run:

```sh
cp studio-output/surety/contracts/src/SuretyEscrow.sol contracts/src/
(cd contracts && arc-forge test) && npm run sync-abi
```

Commit and push, then continue with `scripts/mainnet.sh`.

## Limit to know

Arc Studio deploys to testnet only. The docs state that it "does not deploy to mainnet on your behalf." So the mainnet deployment comes from `scripts/mainnet.sh` in every case. The description in `SUBMISSION.md` states this openly.
