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
- Live app: [https://....vercel.app]
- Public repository: https://github.com/gsbelman/surety
- Video: [video link]
- GitHub profile: https://github.com/gsbelman

## Mainnet contract and transactions

<!-- MAINNET:START -->
Mainnet values appear here after `scripts/mainnet.sh` runs.
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
