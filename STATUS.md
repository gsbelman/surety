# Status

Last update: 2026-10-31. **Surety is live on Arc mainnet.** The contract is deployed and verified, the demo ran with real USDC, and the public app reads the live contract. Two items remain for Oscar: the video and the DoraHacks form.

## Summary

| Item | Value |
| :- | :- |
| Mainnet contract | [`0x2f10d55cfd39eccc7f86ba95d7d0026799fc67f3`](https://explorer.arc.io/address/0x2f10d55cfd39eccc7f86ba95d7d0026799fc67f3?tab=contract) |
| Live app | https://surety-arc.pages.dev |
| Arc Studio workspace | https://studio.arc.io/app/6c3d23f8-e939-4065-8dc8-a6d2cd9cb612 |
| Public repository | https://github.com/gsbelman/surety |

## Remaining steps for Oscar

1. **Record the video.** Follow the shot list in [SUBMISSION.md](SUBMISSION.md). The terminal output is in [`agent/runs/mainnet-output.txt`](agent/runs/mainnet-output.txt).
2. **Submit on DoraHacks.** Replace `[video link]` in `SUBMISSION.md`, then paste the fields.

Optional: finish the Studio testnet flow. In the [Studio workspace](https://studio.arc.io/app/6c3d23f8-e939-4065-8dc8-a6d2cd9cb612), use "Get test USDC" in the sidebar, send about 5 USDC to `0x27aEca5213CEB6259F12C39a2BFDeDe290F72943`, and tell Studio that it landed. This adds Studio history and does not affect mainnet.

## Risks

- **Hackathon rule on Arc Studio.** The rules reject work "built outside Arc Studio." The contract, tests, and app were built locally, and then imported. Studio then audited the contract, fixed a bug, added tests, and deployed to testnet. The judges may still weigh this. `SUBMISSION.md` states the order of events openly. Do not soften that paragraph.
- **Two Studio steps did not finish.** The testnet flow did not run, because the Studio faucet refused the account. Studio also did not confirm that the app shows live events in its preview. `SUBMISSION.md` states both.
- **The contract has no third-party audit.** The Arc Studio review is not an independent audit. The contract cannot change, so a new version needs a new address. It holds 1.239 USDC now.
- **The MVP objection rule can be abused.** Studio rated this High (SE-02). I kept the rule, because the seller opts in and the demo depends on it. See `README.md`, "Known limits," and decisions 37 to 39.

## Done and verified

| Deliverable | Result | Check |
| :- | :- | :- |
| Mainnet deployment | Bytecode matches the local build, except for the immutable USDC address | Compared with the chain |
| Source verification | Exact match on explorer.arc.io | Explorer contract page |
| Mainnet demo | 27 of 27 transactions succeeded: 1 deployment and 26 demo transactions, all 7 scenes | Every receipt read from the chain |
| Final onchain record | Honest seller 100% reliable (3 delivered). Bad seller 0% reliable (3 refunded, 1 objected) | `sellerStats`, live app |
| Public app | Reads mainnet data and shows all events. No console errors, failed requests, or overflow at 1280 px and 390 px | Headless Chromium on https://surety-arc.pages.dev |
| Arc Studio audit | 8 findings. 1 fix adopted (SE-01). Decisions logged in `DECISIONS.md` | Read the diff and `contracts/AUDIT.md` |
| Contract tests | 117 of 117 pass, including 2 invariant suites | `cd contracts && arc-forge test` |
| Test strength | 7 of 7 deliberate mutations made the suite fail (before the Studio tests) | Temporary source edits, then restored |
| Local rehearsal | Full flow passed with the fixed contract, 26 transactions | `scripts/local.sh` |
| Testnet deployment | [`0x2082c43eA0CCba46a12b62e425b40E798be16675`](https://explorer.testnet.arc.io/address/0x2082c43eA0CCba46a12b62e425b40E798be16675), same code as mainnet. No demo flow ran | Compared with the chain |
| Secrets | `.env` is mode 600 and ignored. `scripts/publish.sh` checks the build for keys | `git status`, publish check |

## Wallets

| Role | Address | USDC left |
| :- | :- | :- |
| Deployer | `0x84487909fe800Fdc610a2489D5b17496D6aa8a4f` | 1.092737 |
| Demo agent (buyer) | `0x59D111DD9b34cC0df1955B02d8ed09B2052eFC3e` | 0.463154 |
| Demo seller | `0x1614E03f4f896065051649E06E7Fe07719b48fc0` | 0.302443 |
| Demo bad seller | `0x741972f20b169Cb6310c40F73eE8A19577AaF1ed` | 0.144933 |
| Escrow contract (seller bonds) | `0x2f10d55cfd39eccc7f86ba95d7d0026799fc67f3` | 1.239000 |

## Spend on mainnet

The deployer started with 3.357593 USDC. Gas cost 0.115326 USDC in total: 0.0602 USDC for deployment and 0.0551 USDC for the demo. The other 3.242267 USDC stays in the wallets above. The sellers can take their bonds back with `withdrawBond`.
