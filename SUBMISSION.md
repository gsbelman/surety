# DoraHacks submission: Arc Microgrants

Paste these fields into DoraHacks. One placeholder remains: `[video link]`, after you record the video.

## Name

Surety

## Tagline

Sellers post collateral, and failure costs them. Silence pays the seller, failure pays the buyer, anyone can settle.

## Description

**Sellers post collateral, and failure costs them.** Surety is a settlement layer for paid APIs and agent work on Arc. It is not a marketplace. Any agent marketplace or x402 seller can plug into it.

x402 lets agents pay for APIs per call, but those payments are final. If an API takes the money and returns nothing, the agent has no refund and no dispute path.

Surety fixes this with one contract. A seller posts a USDC bond. A buyer pays into escrow, not into the seller's wallet. The seller must post a hash of the response before the deadline.

**Silence pays the seller, failure pays the buyer, anyone can settle.** If the seller delivers and the buyer stays silent, the seller gets paid after the objection window. If the seller stays silent, the buyer gets a full refund plus a penalty from the bond. No keeper, platform, or owner holds the funds, and the contract charges no fee.

Three stories ran on mainnet with real USDC:

- **Honest seller:** the agent checked the hash and [released the payment](https://explorer.arc.io/tx/0xb6362577f1cca6796f97882c8496ce7186d2010f4beff50703e621d34c435ac6).
- **Silent seller:** the seller never delivered, and [settle refunded the buyer plus the penalty](https://explorer.arc.io/tx/0xc0b15a93d0e98e93f86412b5643a3e01dd2f275e535e8f05d16195b86b513020).
- **Lying seller:** the response failed the hash check, so [the agent objected and got its refund plus the penalty](https://explorer.arc.io/tx/0x29bd5b2417dac0a6349a08edcd1f2d084c7f5fc9087ccecfec0ea238499c6bfc).

Each outcome goes into an onchain record. An agent reads the seller's reliability score before it pays, and it refuses a bad seller.

| Seller | Reliability | Delivered | Refunded | Objected | Declined | Bond |
| :- | :- | :- | :- | :- | :- | :- |
| Honest seller [`0x1614E03f4f896065051649E06E7Fe07719b48fc0`](https://explorer.arc.io/address/0x1614E03f4f896065051649E06E7Fe07719b48fc0) | 100% | 5 | 0 | 0 | 1 | 1 USDC |
| Bad seller [`0x741972f20b169Cb6310c40F73eE8A19577AaF1ed`](https://explorer.arc.io/address/0x741972f20b169Cb6310c40F73eE8A19577AaF1ed) | 0% | 0 | 3 | 1 | 0 | 0.239 USDC |

These demo wallets belong to this project, so the record shows that the mechanism works. It does not show outside demand.

**A real seller plugs in.** A small paid API runs on the same bond. The buyer pays through SuretyEscrow, and the server does the work and calls `deliver()` with the result hash by itself. Three real calls ran on mainnet with this API:

| Call | What happened | End state | Transactions |
| :- | :- | :- | :- |
| 1. Buyer verifies | The agent paid 0.02 USDC, and the server did the work and posted the hash. The agent checked the hash and the reported balance, then released | Seller paid | [pay](https://explorer.arc.io/tx/0x830367ccf597d4a5067308a9e53a9f949c0001b34bc8f4b16ff5799c4d30c4ea), [deliver](https://explorer.arc.io/tx/0x0ad8093a140eb647d6bd71c07245ade9a832db065c231ffc0778c69e60078b67), [release](https://explorer.arc.io/tx/0x17085116c4dd4d88b059952aafe8463453c0a3d630f0754ea64bff32c89fda13) |
| 2. Silence pays the seller | The agent took the result and did nothing. The server settled after the objection window | Seller paid | [pay](https://explorer.arc.io/tx/0x17df13ff33caf620d3df6810dbb49e2f34448ac524a783a1213dede0c4c390a0), [deliver](https://explorer.arc.io/tx/0xc0f2f7ae8b2d6d72ed6e89ca256d14db307b904ed830564ff4d6ddc8741d006b), [settle](https://explorer.arc.io/tx/0xd71e1a061eaa75a90426a9e20ea2056ead34831c70ede3d3ecb21129415f12ae) |
| 3. Payment with no call | The agent paid and never called the API. The server declined before the deadline | Buyer refunded, no penalty, bond intact | [pay](https://explorer.arc.io/tx/0x44525627cbd7b0b4b22706a7d1d2584a5e5948500b80e3976c8c3d90803c863b), [decline](https://explorer.arc.io/tx/0x0ed89f28b22f9faf49c931bb520978626c81e134f6e6d9360d8f80f27a528253) |

The same contract covers a human case: pay-for-a-reply. A payment to a person refunds itself if the person does not reply in time.

Arc fits this design. Sub-second finality makes per-call escrow fast. Each demo transaction cost about $0.002 in gas on mainnet, so small payments stay worthwhile. USDC as gas means an agent needs one balance only.

## How Surety compares

Each project below solves a real part of this problem. Surety adds one thing: the seller has money at risk before the job starts. The facts come from each project's public docs and contracts, read on October 31, 2026.

- **Arcurrent (Round 1):** open escrow with an onchain reputation ledger. It has no seller bond.
- **vet402 (Round 1):** measures x402 sellers by buying from them, and publishes delivery rates. A buyer sees the rate before paying. The payment itself stays final.
- **SiteCheck (Round 1):** a seller with a "pay only for results" rule. A failure that its handler reports does not settle, so the buyer pays nothing. The rule covers its own tools.
- **ShwUp (Round 1):** a forfeitable deposit for event guests. This is the same idea, for guests and not for sellers.
- **Tolly ACP on Arc** (`0x75db32f542f981ca4e545a5b35379e3735104a65`): ERC-8183 job escrow gated by an evaluator. It has no seller bond and a 10% platform fee on completed jobs, and its reputation setting is off.

Surety can sit under a marketplace, and a measurement service can read its record.

## Known limits and Phase 2

The mainnet contract cannot change, so each fix needs a new deployment.

- **Unfair buyer objection (SE-02).** With no arbiter, a buyer can object to an honest delivery and take the payment back plus the penalty. Fix: a buyer objection deposit plus an arbiter.
- **Unsolicited payments lock bond (SE-03).** Anyone can pay a registered seller, which locks bond until the seller responds. The seller API declines these payments while it runs. Fix: seller opt-in or an allowlist.
- **Fake reputation through self-dealing.** A seller can pay itself from a second wallet. Fix: count distinct funded buyers.
- **No independent audit.** The Arc Studio review is not an independent audit. Fix: a third-party audit before larger amounts.

## How Arc Studio was used

We wrote the first version of SuretyEscrow, its Foundry tests, and the app in a local project, then imported the public repository into Arc Studio. In Studio, we ran the test suite and a full audit of the contract (see `contracts/AUDIT.md`). The audit found 8 issues. Studio fixed one High issue: an arbiter could still rule after its deadline. We adopted that fix before mainnet. We accepted the other findings, and README "Known limits" lists the main ones. Studio added 61 tests, so the suite grew from 56 to 117 tests, and all pass. Studio deployed the fixed contract to Arc testnet at [`0x2082c43eA0CCba46a12b62e425b40E798be16675`](https://explorer.testnet.arc.io/address/0x2082c43eA0CCba46a12b62e425b40E798be16675) and wired the React app into the Studio preview.

Two Studio steps did not finish. The testnet faucet refused the account, so the full testnet flow did not run in Studio. Studio also could not see its own preview, so it did not confirm that the app shows live events there. Arc Studio does not deploy to mainnet, so `scripts/mainnet.sh` deployed the same source to mainnet with Arc Foundry. The full flow ran there, with 26 real transactions.

The [Studio workspace](https://studio.arc.io/app/6c3d23f8-e939-4065-8dc8-a6d2cd9cb612) holds this work:

- **Audit:** 8 findings. The fix for SE-01 is adopted, and it is in the mainnet contract.
- **Tests:** 61 tests added, so the suite grew from 56 to 117 tests.
- **Testnet deployment:** the fixed contract, at [`0x2082c43eA0CCba46a12b62e425b40E798be16675`](https://explorer.testnet.arc.io/address/0x2082c43eA0CCba46a12b62e425b40E798be16675).

The seller API was built locally after the mainnet deployment, not in Studio.

## Links

- Arc Studio project: https://studio.arc.io/app/6c3d23f8-e939-4065-8dc8-a6d2cd9cb612
- Live app: https://surety-arc.pages.dev
- Public repository: https://github.com/gsbelman/surety
- Video: [video link]
- GitHub profile: https://github.com/gsbelman

## Mainnet contract and transactions

<!-- MAINNET:START -->
**Arc Mainnet** (generated from real receipts by `agent/src/report.ts`)

- SuretyEscrow: [`0x2f10d55cfd39eccc7f86ba95d7d0026799fc67f3`](https://explorer.arc.io/address/0x2f10d55cfd39eccc7f86ba95d7d0026799fc67f3)
- Deployment: [`0x47efbd44a5fd531bcd8cd9b28356f71a529fb34162cc76c8e0b5f92d1af951b1`](https://explorer.arc.io/tx/0x47efbd44a5fd531bcd8cd9b28356f71a529fb34162cc76c8e0b5f92d1af951b1)
- Honest seller [`0x1614E03f4f896065051649E06E7Fe07719b48fc0`](https://explorer.arc.io/address/0x1614E03f4f896065051649E06E7Fe07719b48fc0): 100% reliable, 5 delivered, 0 refunded, bond 1 USDC
- Bad seller [`0x741972f20b169Cb6310c40F73eE8A19577AaF1ed`](https://explorer.arc.io/address/0x741972f20b169Cb6310c40F73eE8A19577AaF1ed): 0% reliable, 0 delivered, 3 refunded, bond 0.239 USDC

| Step | Transaction |
| :- | :- |
| deployer funds AGENT | [`0x765cdb36a14759600d549dba61fd9c7b2fa985916a7f132d4cdb6955a673769f`](https://explorer.arc.io/tx/0x765cdb36a14759600d549dba61fd9c7b2fa985916a7f132d4cdb6955a673769f) |
| deployer funds SELLER | [`0x4847b1406a9528a533f7afcc2082f773f9d211df9f83322dc9d8324befbf4032`](https://explorer.arc.io/tx/0x4847b1406a9528a533f7afcc2082f773f9d211df9f83322dc9d8324befbf4032) |
| deployer funds BAD_SELLER | [`0xfb76bcc427211f2cf160b22ed877efa3d397891bef34c8a1c1af711963f9c3ee`](https://explorer.arc.io/tx/0xfb76bcc427211f2cf160b22ed877efa3d397891bef34c8a1c1af711963f9c3ee) |
| honest seller registers | [`0xecfe1ca497bc5ab2ba04bef2c85c033b3fa866ff1d32661fb9440509ce9ca27c`](https://explorer.arc.io/tx/0xecfe1ca497bc5ab2ba04bef2c85c033b3fa866ff1d32661fb9440509ce9ca27c) |
| honest seller approves bond | [`0x683f2be64735025001e6b4e909c4f4cb061ecf058c6e34f41c4a65821175eaca`](https://explorer.arc.io/tx/0x683f2be64735025001e6b4e909c4f4cb061ecf058c6e34f41c4a65821175eaca) |
| honest seller posts 1 USDC bond | [`0x5d1eaf0957d1d89750e607d005030f2de535c0c5b77d387ff5a888d459be0f4e`](https://explorer.arc.io/tx/0x5d1eaf0957d1d89750e607d005030f2de535c0c5b77d387ff5a888d459be0f4e) |
| bad seller registers | [`0xb4cb33bcbf35196cdb7b9bf4ac79e9803437f805517033b29ab3f53433627129`](https://explorer.arc.io/tx/0xb4cb33bcbf35196cdb7b9bf4ac79e9803437f805517033b29ab3f53433627129) |
| bad seller approves bond | [`0x7ebb3ef8e266e99881c972f247e6f6d94045b8650dcc538bc7956c776c279fcd`](https://explorer.arc.io/tx/0x7ebb3ef8e266e99881c972f247e6f6d94045b8650dcc538bc7956c776c279fcd) |
| bad seller posts 0.25 USDC bond | [`0x4e5c2e0c676822f642c16c56ed06dd6d5202487930aa662685c75ff95c98ad92`](https://explorer.arc.io/tx/0x4e5c2e0c676822f642c16c56ed06dd6d5202487930aa662685c75ff95c98ad92) |
| agent approves USDC | [`0x6c71aced2343f277042f69a955ad95ce8f290b524f7275fd2d39e44dcdce716f`](https://explorer.arc.io/tx/0x6c71aced2343f277042f69a955ad95ce8f290b524f7275fd2d39e44dcdce716f) |
| agent pays through Surety | [`0x6bd5cbc7b663dcd6deb7b771c508991564fb227a5bfb5416d257b6abb7c54c5d`](https://explorer.arc.io/tx/0x6bd5cbc7b663dcd6deb7b771c508991564fb227a5bfb5416d257b6abb7c54c5d) |
| honest seller delivers payment 1 | [`0x25e5e3c22b1dbc0a6ae187dad59987ce7c761939d8ce44b350293407c85f0c5a`](https://explorer.arc.io/tx/0x25e5e3c22b1dbc0a6ae187dad59987ce7c761939d8ce44b350293407c85f0c5a) |
| agent releases payment 1 | [`0xb6362577f1cca6796f97882c8496ce7186d2010f4beff50703e621d34c435ac6`](https://explorer.arc.io/tx/0xb6362577f1cca6796f97882c8496ce7186d2010f4beff50703e621d34c435ac6) |
| agent pays through Surety | [`0x4adecf7dce92a8c2523b2e8dfa4f208b88d50a3e2aea9684a54874a8af53dcee`](https://explorer.arc.io/tx/0x4adecf7dce92a8c2523b2e8dfa4f208b88d50a3e2aea9684a54874a8af53dcee) |
| honest seller delivers payment 2 | [`0x1f7717e0676a82e5b999aa63d5ad2ceec7b9b7cdba13a994a9ef161d25aa4322`](https://explorer.arc.io/tx/0x1f7717e0676a82e5b999aa63d5ad2ceec7b9b7cdba13a994a9ef161d25aa4322) |
| settle payment 2 | [`0xca472cafa636011fabc04c2fa3e20739770929877fdfb8026b70b38824800c6c`](https://explorer.arc.io/tx/0xca472cafa636011fabc04c2fa3e20739770929877fdfb8026b70b38824800c6c) |
| agent pays through Surety | [`0x349c3d3f13080ea202b9067f7492ab7edf9a5e10e68f7038316b2f0f33ee1f87`](https://explorer.arc.io/tx/0x349c3d3f13080ea202b9067f7492ab7edf9a5e10e68f7038316b2f0f33ee1f87) |
| settle payment 3 | [`0xc0b15a93d0e98e93f86412b5643a3e01dd2f275e535e8f05d16195b86b513020`](https://explorer.arc.io/tx/0xc0b15a93d0e98e93f86412b5643a3e01dd2f275e535e8f05d16195b86b513020) |
| agent pays through Surety | [`0xc09da5867017d5fdc23db8e7ca97cad1e8e4823c0ca0b569c431a4fdae07e7cb`](https://explorer.arc.io/tx/0xc09da5867017d5fdc23db8e7ca97cad1e8e4823c0ca0b569c431a4fdae07e7cb) |
| bad seller delivers payment 4 | [`0x68ec358115159337ed4b97e4ab31f2241371166ec2855014d1122c3c2b127445`](https://explorer.arc.io/tx/0x68ec358115159337ed4b97e4ab31f2241371166ec2855014d1122c3c2b127445) |
| agent objects to payment 4 | [`0x29bd5b2417dac0a6349a08edcd1f2d084c7f5fc9087ccecfec0ea238499c6bfc`](https://explorer.arc.io/tx/0x29bd5b2417dac0a6349a08edcd1f2d084c7f5fc9087ccecfec0ea238499c6bfc) |
| payer pays for a reply | [`0x70a2c0d30c2c70fe519b8c5f46c4fe4aa7841c687038238b9fd025eae64d2f8d`](https://explorer.arc.io/tx/0x70a2c0d30c2c70fe519b8c5f46c4fe4aa7841c687038238b9fd025eae64d2f8d) |
| recipient replies to payment 5 | [`0x22ff8b714a2cc1df31df6a9b45fa9350f7b046c834b75179624eb393bfe84ff3`](https://explorer.arc.io/tx/0x22ff8b714a2cc1df31df6a9b45fa9350f7b046c834b75179624eb393bfe84ff3) |
| agent releases payment 5 | [`0xf3c0ccb528cf124e5fd9d90614a5614df900c16a6ec3dd0d8a233530ef45c40b`](https://explorer.arc.io/tx/0xf3c0ccb528cf124e5fd9d90614a5614df900c16a6ec3dd0d8a233530ef45c40b) |
| payer pays for a reply | [`0x8be088e398ddaee97fed4d9a1f56f33e27f4a3fe1f6c057ed6831476f3bd6eda`](https://explorer.arc.io/tx/0x8be088e398ddaee97fed4d9a1f56f33e27f4a3fe1f6c057ed6831476f3bd6eda) |
| settle payment 6 | [`0x11ca9cfc54f22f0522e6982b993f7c07d4519e74bc1635f04a4a9eda780563af`](https://explorer.arc.io/tx/0x11ca9cfc54f22f0522e6982b993f7c07d4519e74bc1635f04a4a9eda780563af) |
<!-- MAINNET:END -->

The contract source is verified on the explorer (exact match). All 27 transactions above succeeded, and the 8 seller API transactions in the description succeeded too. That makes 35 mainnet transactions and 9 payments. Total gas was 0.1355 USDC.

## Video shot list (about 90 seconds)

Before you record:

1. Connect a wallet on Arc mainnet with about 0.05 USDC. Do not use a demo wallet. The wallet needs two approvals: USDC, then the payment. The new UI has had no real wallet payment yet, so try shots 3 and 4 once before you record.
2. Keep these explorer pages open in tabs: the three transactions in shot 5, and the seller page.

The timeout refund takes 36 seconds, so cut the wait in the edit. The labels below match the live app.

| Shot | Time | Screen | Voice |
| :- | :- | :- | :- |
| 1. Problem | 0:00-0:12 | An x402 call that takes payment and returns an error | "Agents pay per call with x402. If the API takes the money and returns nothing, the agent has no refund." |
| 2. Promise | 0:12-0:22 | App home | "On Surety, sellers post collateral, and failure costs them. Silence pays the seller, failure pays the buyer, anyone can settle." |
| 3. Pay for a reply | 0:22-0:42 | App: Pay-for-a-reply tab. Recipient `0x741972f20b169Cb6310c40F73eE8A19577AaF1ed`, a short message, amount `0.01`, Reply within (hours) `0.01`. Click pay and approve in the wallet | "I pay someone 1 cent for a reply. The money goes into escrow, not to them. They have 36 seconds." |
| 4. Timeout refund | 0:42-0:58 | Cut to after the deadline. Click "Settle: refund the buyer". The payment shows Refunded | "No reply. Anyone can settle now. I get my money back, plus a penalty from their bond." |
| 5. Explorer links | 0:58-1:18 | explorer.arc.io: the [honest release](https://explorer.arc.io/tx/0xb6362577f1cca6796f97882c8496ce7186d2010f4beff50703e621d34c435ac6), the [silent seller refund](https://explorer.arc.io/tx/0xc0b15a93d0e98e93f86412b5643a3e01dd2f275e535e8f05d16195b86b513020), the [objection to a lie](https://explorer.arc.io/tx/0x29bd5b2417dac0a6349a08edcd1f2d084c7f5fc9087ccecfec0ea238499c6bfc), then the [seller's address](https://explorer.arc.io/address/0x1614E03f4f896065051649E06E7Fe07719b48fc0) | "This is real USDC on Arc mainnet. An honest seller got paid. A silent seller paid a penalty. A lying seller failed the hash check and paid too. Each result goes into the seller's onchain record." |
| 6. Close | 1:18-1:30 | App: Seller tab, or the Studio workspace | "Arc Studio audited the contract, fixed a bug, and added 61 tests. Any marketplace or x402 seller can plug in. Surety: pay for work, not for promises." |
