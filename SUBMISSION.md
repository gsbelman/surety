# DoraHacks submission: Arc Microgrants

Paste these fields into DoraHacks. Replace each `[placeholder]`.

## Name

Surety

## Tagline

Bonded, self-settling USDC payments for AI agents and humans on Arc.

## Description

x402 lets agents pay for APIs per call, but those payments are final. If an API takes the money and returns nothing, the agent has no refund and no dispute path.

Surety fixes this with one contract on Arc. A seller posts a USDC bond. A buyer pays into escrow, not into the seller's wallet. The seller must post a hash of the response before the deadline.

If the seller stays silent, anyone can call settle. The buyer gets a full refund plus a penalty from the bond. If the seller delivers, the buyer has an objection window. If the buyer does not object, the seller gets paid. No keeper, no platform, and no owner holds the funds.

Each result goes into an onchain record. An agent reads the seller's reliability score before it pays, and it refuses a bad seller. In our demo, an agent pays three mock APIs in USDC on mainnet: an honest one, one that never delivers, and one that lies. The agent detects the lie because the response does not match the onchain proof. It gets its money back, plus the penalty.

The same contract covers a human case: pay-for-a-reply. A payment to a person refunds itself if the person does not reply in time.

Arc fits this design. Sub-second finality makes per-call escrow fast. A gas fee near $0.001 keeps small payments worthwhile. USDC as gas means an agent needs one balance only.

## How Arc Studio was used

**[CONFIRM AFTER `scripts/studio.sh`. Keep only what happened. Do not submit this paragraph unchecked.]**

We wrote the first version of SuretyEscrow and its Foundry tests in a local project, then imported the public repository into Arc Studio. In Studio, we ran the test suite, ran an audit of the contract (see `contracts/AUDIT.md`), extended the tests, deployed to Arc testnet with the built-in faucet, and ran the React app in the Studio preview against the testnet contract. Arc Studio does not deploy to mainnet, so `scripts/mainnet.sh` deploys the same source to mainnet with Arc Foundry.

## Links

- Arc Studio project: [https://studio.arc.io/app/...]
- Live app: https://surety-arc.pages.dev
- Public repository: https://github.com/gsbelman/surety
- Video: [video link]
- GitHub profile: https://github.com/gsbelman

## Mainnet contract and transactions

<!-- MAINNET:START -->
**Arc Mainnet** (generated from real receipts by `agent/src/report.ts`)

- SuretyEscrow: [`0x2f10d55cfd39eccc7f86ba95d7d0026799fc67f3`](https://explorer.arc.io/address/0x2f10d55cfd39eccc7f86ba95d7d0026799fc67f3)
- Deployment: [`0x47efbd44a5fd531bcd8cd9b28356f71a529fb34162cc76c8e0b5f92d1af951b1`](https://explorer.arc.io/tx/0x47efbd44a5fd531bcd8cd9b28356f71a529fb34162cc76c8e0b5f92d1af951b1)
- Honest seller [`0x1614E03f4f896065051649E06E7Fe07719b48fc0`](https://explorer.arc.io/address/0x1614E03f4f896065051649E06E7Fe07719b48fc0): 100% reliable, 3 delivered, 0 refunded, bond 1 USDC
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

## Video script (2 minutes)

Record the screen. Run `SURETY_NETWORK=mainnet npm run demo` live in shot 4, or use the recorded terminal output of `scripts/mainnet.sh`.

| Time | Screen | Voice |
| :- | :- | :- |
| 0:00-0:15 | An x402 call that takes payment and returns an error | "Agents pay per call with x402. If the API takes the money and returns nothing, the agent has no refund." |
| 0:15-0:35 | Arc Studio workspace: chat history, `SuretyEscrow.sol`, test run, audit | "Surety is one contract, built and tested in Arc Studio. Sellers post a bond. Buyers pay into escrow." |
| 0:35-0:50 | App: Buyer tab, click "Demo: honest seller", then "Demo: bad seller" | "Before an agent pays, it reads the seller's record onchain. This seller delivered every job. This one did not." |
| 0:50-1:25 | Terminal: the agent demo, scenes 1, 3, and 4 | "The agent pays. The honest API delivers, and the hash matches. The silent API never delivers: settle refunds the agent plus a penalty. The lying API serves junk: the hash fails, the agent objects, and it gets refund plus penalty." |
| 1:25-1:35 | Terminal: scene 5 | "Now the score is zero, so the agent refuses to pay. No human stepped in." |
| 1:35-1:45 | App: Live contract events, then one transaction on explorer.arc.io | "This is real USDC on Arc mainnet. Every step has a transaction." |
| 1:45-1:55 | App: Pay-for-a-reply tab | "The same contract covers people. Pay for a reply. No reply in time, automatic refund." |
| 1:55-2:00 | App home | "Surety. Pay for work, not for promises." |
