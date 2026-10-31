# Status

Last update: 2026-10-31. Everything that can run without a login or funds is done and verified. **Mainnet, the Studio work, and the public link are not done.** They need the morning steps below.

## Summary

The contract, tests, agent demo, app, and docs are finished and pushed to https://github.com/gsbelman/surety. They are verified on a local Arc node only. No mainnet transaction exists yet. Six morning steps remain.

## Morning steps, in order

1. **Log in to Arc Studio:** `arc-studio login --paste`
2. **Run the Studio work (about 30 min):** `cd ~/dev/surety && scripts/studio.sh`. Then follow "Bring results back" in [STUDIO_STEPS.md](STUDIO_STEPS.md).
3. **Fund the deployer:** send 10 USDC on Arc mainnet to `0x84487909fe800Fdc610a2489D5b17496D6aa8a4f`.
4. **Deploy and run the demo (about 4 min):** `scripts/mainnet.sh`
5. **Publish the app:** `npx vercel login`, then `npx vercel --prod`.
6. **Finish `SUBMISSION.md`:** fill in the three `[placeholder]` links, check the "How Arc Studio was used" paragraph, and record the video from the shot list.

If `scripts/mainnet.sh` prints a verification warning, upload `contracts/out/standard-input.json` at explorer.arc.io/contract-verification.

## Risks

- **Hackathon rule on Arc Studio.** The rules reject work "built outside Arc Studio." The contract, tests, and app were built locally, because Studio was not logged in. Steps 1 and 2 add real Studio history. The judges may still weigh this. `SUBMISSION.md` states the order of events openly. Do not soften that paragraph.
- **The audit can change the contract.** Do step 2 before step 4. A mainnet contract cannot change.
- **No test has run on real mainnet or testnet.** The rehearsal ran on `arc-anvil`, which runs the real USDC contract but is not the live network.
- **The MVP objection rule can be abused.** See `README.md`, "Known limits."

## Done and verified

| Deliverable | Result | Command |
| :- | :- | :- |
| Contract and tests | 56 of 56 tests pass, including 2 invariant suites of 8,192 calls | `cd contracts && arc-forge test` |
| Test strength | 7 of 7 deliberate mutations made the suite fail (reentrancy guards, bond checks, deadlines) | Temporary source edits, then restored |
| Agent demo | Full flow passes on a local Arc node: 26 transactions, 7 scenes, deployment through report | `scripts/local.sh` |
| App | Production build passes. Browser test passes with no browser errors: 15 user actions through the real UI with an injected test wallet on a local Arc node | `npm run build`, Playwright run (not in the repo) |
| Deadline race | Settle at the exact deadline: 1 failure in 22 before the fix, 0 failures in 30 after it | Playwright stress run (not in the repo) |
| App flows covered | Register, bond in and out, pay, countdown, deliver, release, object, timeout settle, decoded contract error, pay-for-a-reply, live feed | Same browser test |
| Mobile | No horizontal overflow at 390 px on each tab | Same browser test |
| No wallet | Production build loads with no errors. Local network is hidden | `vite preview` with Playwright |
| Unfunded guard | `scripts/mainnet.sh` stops before any spend | Ran with a 0 USDC deployer |
| Secrets | `.env` is mode 600 and ignored. No private key appears in git history | `git log --all -p`, searched for each key |
| Clean clone | Fresh clone installs, builds, typechecks, and passes tests | `git clone`, `npm ci`, `npm run build`, `tsc --noEmit`, `arc-forge test` |

## Blocked

| Item | Reason | Unblocked by |
| :- | :- | :- |
| Studio work | `arc-studio whoami` reports no login | Step 1 |
| Testnet deployment | The faucet needs reCAPTCHA | Step 2, with the Studio faucet |
| Mainnet deployment, real transactions | The deployer has 0 USDC | Steps 3 and 4 |
| Public app link | The Vercel CLI is not installed or logged in | Step 5 |
| Explorer verification | Needs a deployment. The mainnet API returned 403 to `curl` | Step 4, with the manual fallback |

## Wallets

| Role | Address |
| :- | :- |
| Deployer | `0x84487909fe800Fdc610a2489D5b17496D6aa8a4f` |
| Demo agent (buyer) | `0x59D111DD9b34cC0df1955B02d8ed09B2052eFC3e` |
| Demo seller | `0x1614E03f4f896065051649E06E7Fe07719b48fc0` |
| Demo bad seller | `0x741972f20b169Cb6310c40F73eE8A19577AaF1ed` |

## Spend on mainnet

`scripts/mainnet.sh` needs 2.40 USDC in the deployer. It moves 2.20 USDC to the demo wallets, and that USDC stays in project wallets. Deployment costs about 0.05 USDC of gas (1.99M gas at 25 gwei). Gas for the demo run is an estimate: about 0.10 USDC for 26 transactions. The total is under the $5 limit.
