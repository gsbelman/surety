# Decisions

Judgment calls made during the overnight build, 2026-10-31.

## Contract

1. **One lifecycle, no mode flag.** The brief names two modes, but `pay()` has no mode argument. Both rules apply to each payment in sequence: refund if not delivered, then release unless objected.
2. **Terms are per seller and permanent.** `penaltyBps`, `minDeliveryWindow`, `objectionWindow`, and `arbiter` are set once in `register()`. A seller cannot change terms between a buyer's check and a buyer's payment. To change terms, a seller registers a new address.
3. **The penalty locks at `pay()`.** `pay()` reverts with `InsufficientBond` if the free bond cannot cover the penalty. So each penalty is guaranteed, and "unlocked bond" has an exact meaning.
4. **`minDeliveryWindow` is an addition.** Without it, a buyer can set a 1-second window, wait, and collect the penalty. This drains a bond with no risk. The seller now sets the floor.
5. **`decline()` is an addition.** Without it, anyone can send an unsolicited payment to a seller and collect the penalty when the seller ignores it. A seller can now refund with no penalty before the deadline. After the deadline `decline()` reverts, so a silent seller cannot dodge the penalty.
6. **`release()` is an addition.** A satisfied buyer should not have to wait for the window. It also makes the agent demo fast.
7. **Failed payouts become claims (`claim()`).** Arc enforces a USDC blocklist at runtime. A blocked recipient must not freeze a payment or a seller's locked bond.
8. **Known abuse of the MVP objection rule.** The brief asks for "refund buyer and slash the penalty." With no arbiter, a dishonest buyer can object to an honest delivery and profit. I built the rule as asked and documented the limit in the README. The defense is the arbiter option.
9. **The arbiter belongs to the seller.** The seller names it at registration, and the buyer sees it before paying. A global arbiter would add a privileged role. An absent arbiter defaults to refund plus penalty after 7 days, so funds cannot freeze.
10. **The score is `delivered / (delivered + refunded)`.** `delivered` counts released payments. `declined` does not count, because a third party can create declined payments at will. `objected` is separate, so a reader can see it.
11. **The constructor checks 6 decimals.** This guards against a wrong token address and against the 6 and 18 decimal mix-up.
12. **Recipients must register for pay-for-a-reply.** A recipient opens an inbox with a 0% penalty and needs no bond. This avoids a second payment path.
13. **`evm_version = prague`.** Arc targets Osaka, but the contract needs nothing newer, and Prague is the conservative choice for solc 0.8.30.

## Tools and structure

14. **Arc Foundry, not `foundryup`.** The brief says Foundry. The Arc docs state that plain `anvil` cannot reproduce Arc behavior. `arc-anvil --network arc` runs the real USDC contract at `0x3600...`, so the local rehearsal is far closer to mainnet. The scripts fall back to plain `forge` if needed. The install went to `~/.local/bin` with a checked sha256 and no sudo.
15. **Vendored libraries, not git submodules.** forge-std v1.11.0 and the needed OpenZeppelin v5.7.0 files live in `contracts/lib`. `arc-studio clone` may not fetch submodules, and a broken import in Studio would cost time.
16. **npm workspaces.** `app/` and `agent/` share the ABI and network config in `app/src/contract/`.
17. **Four wallets, not three.** `BAD_SELLER` is the fourth, so the honest seller keeps a clean score.
18. **The mock API copies the x402 flow but is not x402.** It returns HTTP 402 with terms and accepts a Surety payment id. Real x402 settles directly, so it cannot carry escrow.
19. **`scripts/mainnet.sh` commits and pushes the generated files.** This removes a morning step.

## Findings from testing

20. **Gas estimation fails on Arc for a near-full transfer.** Rehearsal on `arc-anvil` showed that `eth_estimateGas` with fee fields and no gas limit reserves 30M gas times the fee (1.2 USDC at 40 gwei) from the sender. The reservation shares a balance with the USDC being moved, so a valid `addBond` failed. Viem sends fee fields for local accounts. The agent and the app now estimate with a plain RPC call and pass an explicit limit. I confirmed this on `arc-anvil`, not on mainnet.
21. **The RPC limits `eth_getLogs`.** A range of 1,000 blocks works and 10,000 fails. At 0.5 s per block, a full scan from deployment gets slow in days. The feed reads the last 20,000 blocks plus the known block range of the demo run, then follows the head. Payment lists read `getPayment` for the last 60 ids.
22. **The mainnet explorer API returned 403 (Cloudflare).** The testnet API returned 200. `arc-forge verify-contract` can fail on mainnet. The script then writes `contracts/out/standard-input.json` for manual upload. A failure does not stop the demo.

## Scope and limits

23. **Testnet deployment skipped.** The faucet at faucet.circle.com uses reCAPTCHA, and I did not try to bypass it. `arc-anvil` replaced it. Studio has a built-in faucet, so `scripts/studio.sh` deploys to testnet.
24. **Vercel deployment skipped.** The Vercel CLI is not installed, so no CLI login exists. The brief allows deployment only with a CLI login. A Vercel connector is available in this session, but I followed the condition in the brief.
25. **Arc Studio fallback used.** `arc-studio whoami` failed at the start and at the end of the run. I built locally and wrote `STUDIO_STEPS.md` and `scripts/studio.sh`.
26. **The app has no arbiter screen.** An arbiter calls `resolve()` from the explorer. The demo does not use an arbiter.
27. **The app forgets form input on a tab change.** This is acceptable for an MVP.
28. **`BRIEF.md` is not in the public repo.** It is an internal note. It stays on disk, ignored by git.
29. **Git identity.** The repo uses `gsbelman@users.noreply.github.com`, so no private email goes public.
30. **No existing wallet used.** The session had a connected wallet service. I did not touch it, per the brief.
