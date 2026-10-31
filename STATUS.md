# Status

Last update: 2026-10-31. **Surety is live on Arc mainnet.** The contract is deployed and verified, the demo ran with real USDC, and the public app reads the live contract. A bonded seller API also ran three real calls on mainnet. The pitch, the limits, and the video shot list are final, and the new UI is live. Two items remain for Oscar: the video and the DoraHacks form. Submissions close November 1, 2026.

## Summary

| Item | Value |
| :- | :- |
| Mainnet contract | [`0x2f10d55cfd39eccc7f86ba95d7d0026799fc67f3`](https://explorer.arc.io/address/0x2f10d55cfd39eccc7f86ba95d7d0026799fc67f3?tab=contract) |
| Live app | https://surety-arc.pages.dev |
| Arc Studio workspace | https://studio.arc.io/app/6c3d23f8-e939-4065-8dc8-a6d2cd9cb612 |
| Public repository | https://github.com/gsbelman/surety |

## Remaining steps for Oscar

1. **Record the video.** Follow the 90-second shot list in [SUBMISSION.md](SUBMISSION.md). It needs a wallet of your own on Arc mainnet with about 0.05 USDC. The new UI has had no real wallet payment yet, so try shots 3 and 4 once before you record.
2. **Submit on DoraHacks.** Replace `[video link]` in `SUBMISSION.md`, then paste the fields.

Optional: finish the Studio testnet flow. In the [Studio workspace](https://studio.arc.io/app/6c3d23f8-e939-4065-8dc8-a6d2cd9cb612), use "Get test USDC" in the sidebar, send about 5 USDC to `0x27aEca5213CEB6259F12C39a2BFDeDe290F72943`, and tell Studio that it landed. This adds Studio history and does not affect mainnet.

## Risks

- **Hackathon rule on Arc Studio.** The rules reject work "built outside Arc Studio." The contract, tests, and app were built locally, and then imported. Studio then audited the contract, fixed a bug, added tests, and deployed to testnet. The judges may still weigh this. `SUBMISSION.md` states the order of events openly. Do not soften that paragraph.
- **Two Studio steps did not finish.** The testnet flow did not run, because the Studio faucet refused the account. Studio also did not confirm that the app shows live events in its preview. `SUBMISSION.md` states both.
- **The contract has no third-party audit.** The Arc Studio review is not an independent audit. The contract cannot change, so a new version needs a new address. It holds 1.239 USDC now.
- **The MVP objection rule can be abused.** Studio rated this High (SE-02). I kept the rule, because the seller opts in and the demo depends on it. See `README.md`, "Known limits and Phase 2," and decisions 37 to 39.
- **The seller bond is open to SE-03 while the server is off.** Anyone can pay the demo seller, wait for the deadline, and collect 10% of the payment from the 1 USDC bond. I left the bond in place, because judges read it on the chain and the most it can lose is 1 USDC.
- **All mainnet activity comes from project wallets.** The docs say so. The record shows that the mechanism works, not that outside users exist.
- **The new seller API was built locally, not in Studio.** `SUBMISSION.md` and `README.md` say so.
- **Two "Round 1" labels are not confirmed.** Oscar named vet402 and SiteCheck as Round 1 winners. The DoraHacks winners page did not render for me, and their READMEs do not say this. Arcurrent and ShwUp are confirmed in their own READMEs.

## Done and verified

| Deliverable | Result | Check |
| :- | :- | :- |
| Mainnet deployment | Bytecode matches the local build, except for the immutable USDC address | Compared with the chain |
| Source verification | Exact match on explorer.arc.io | Explorer contract page |
| Mainnet demo | 27 of 27 transactions succeeded: 1 deployment and 26 demo transactions, all 7 scenes | Every receipt read from the chain |
| Mainnet totals | 35 transactions, 9 payments | Receipts and `lastPaymentId` |
| Seller API on mainnet | 3 calls, 8 of 8 transactions succeeded. The server delivered, settled, and declined by itself | Every receipt read from the chain |
| Seller API failure paths | 13 of 13 checks passed on a local node, including failed work, a wrong job, and a repeat fetch | Local test, not kept in the repo |
| Final onchain record | Honest seller 100% reliable (5 delivered, 1 declined). Bad seller 0% reliable (3 refunded, 1 objected) | `sellerStats`, read after the last call |
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
| Demo agent (buyer) | `0x59D111DD9b34cC0df1955B02d8ed09B2052eFC3e` | 0.408614 |
| Demo seller | `0x1614E03f4f896065051649E06E7Fe07719b48fc0` | 0.336821 |
| Demo bad seller | `0x741972f20b169Cb6310c40F73eE8A19577AaF1ed` | 0.144933 |
| Escrow contract (seller bonds) | `0x2f10d55cfd39eccc7f86ba95d7d0026799fc67f3` | 1.239000 |

## Spend on mainnet

The deployer started with 3.357593 USDC. Gas cost 0.135488 USDC in total: 0.0602 USDC for deployment, 0.0551 USDC for the demo, and 0.020162 USDC for the seller API calls. The other 3.222105 USDC stays in the wallets above. The sellers can take their bonds back with `withdrawBond`.
