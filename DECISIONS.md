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

23. **The app reads deadlines from the chain clock.** The first version used the device clock, so the Settle button could appear before the chain passed the deadline. A stress test failed 1 click in 22 with `TooEarly`. The app now measures the offset to the latest block and adds a 1-second margin. The same test then passed 30 of 30. This also protects a device with a wrong clock.

## Scope and limits

24. **Testnet deployment skipped.** The faucet at faucet.circle.com uses reCAPTCHA, and I did not try to bypass it. `arc-anvil` replaced it. Studio has a built-in faucet, so `scripts/studio.sh` deploys to testnet.
25. **Vercel deployment skipped.** The Vercel CLI is not installed, so no CLI login exists. The brief allows deployment only with a CLI login. A Vercel connector is available in this session, but I followed the condition in the brief.
26. **Arc Studio fallback used.** `arc-studio whoami` failed at the start and at the end of the run. I built locally and wrote `STUDIO_STEPS.md` and `scripts/studio.sh`.
27. **The app has no arbiter screen.** An arbiter calls `resolve()` from the explorer. The demo does not use an arbiter.
28. **The app forgets form input on a tab change.** This is acceptable for an MVP.
29. **`BRIEF.md` is not in the public repo.** It is an internal note. It stays on disk, ignored by git.
30. **Git identity.** The repo uses `gsbelman@users.noreply.github.com`, so no private email goes public.
31. **No existing wallet used.** The session had a connected wallet service. I did not touch it, per the brief.

## Hosting

32. **Hosting moved from Vercel to Cloudflare Pages.** This was Oscar's choice. It replaces decision 25. The live app is at https://surety-arc.pages.dev, and `scripts/publish.sh` rebuilds and redeploys it.
33. **The Pages project is `surety-arc`.** `surety.pages.dev` already serves a site outside this account, so the fallback name applies.
34. **The production build holds no local node config.** The local network moved to `app/src/contract/local.ts`. Only dev builds and the agent import it. `scripts/publish.sh` stops before it deploys if the build contains local node config or a private key from `.env`.
35. **Wrangler 4.156 needs two workarounds.** It refuses to run in the root of an npm workspace, so `scripts/publish.sh` deploys from `app/`. It also sends `pages project create` to Workers, so the first creation of the project needed `--force`. Later deploys do not need this flag.

## Arc Studio review

36. **SE-01 adopted: `resolve` now stops at the arbiter deadline.** Before the fix, an arbiter could release a payment after the deadline, and could front-run `settle`. This broke the refund that the README promises. The fix is one line, the ABI does not change, and the boundary matches `settle`. I read the diff and confirmed that Studio changed no other contract line.
37. **SE-02 not adopted: the no-arbiter objection rule stays.** Studio rated it High and left the decision open. The rule is decision 8, and the seller opts in. The fix rejects a penalty with no arbiter, which removes the flow that the demo shows. README "Known limits" states the risk.
38. **SE-03 not adopted: `pay` needs no seller consent.** An unsolicited payment can lock free bond and force a `decline`. The attentive seller loses gas only. A real fix changes the `pay` ABI, so it is too large for this MVP. README "Known limits" now states it.
39. **SE-04 accepted.** If the issuer blocks the escrow address, all funds in the escrow stop until the issuer acts. The contract cannot fix this. The mainnet demo holds under 2 USDC.
40. **The 59 Studio tests are adopted without change.** I read them for FFI, file access, forks, and outside addresses, and found none. All 117 tests pass locally.
41. **The Studio testnet flow did not run.** The Studio faucet refused because the Circle account lacks an admin role. Studio offered to create a Circle API key in the account. I did not approve this, because it changes account credentials and the task did not ask for it. The testnet contract itself is deployed.
42. **The testnet contract is the same code as the mainnet source.** Its runtime bytecode matches the local build, including the metadata hash. The only difference is the immutable token address. Studio deployed it through a factory, so the receipt shows no contract address. I copied the address from Studio into `deployments.json`.

## Mainnet

43. **The rehearsal ran on a node from another session.** Port 8545 already held the `arc-anvil` of the UI session, so `scripts/local.sh` used it. The run passed with 26 transactions. It added one contract to that node and did not touch mainnet. I left the node running and told that session. `scripts/local.sh` does not stop when its own node fails to start. I did not change this.
44. **Source verification went through the explorer form.** `forge verify-contract` failed because a Cloudflare check blocks the API from scripts. The form at explorer.arc.io loaded in a plain headless browser with no human check. I uploaded `contracts/out/standard-input.json` there, and the explorer reports an exact match.
45. **The gas claim now uses measured data.** `SUBMISSION.md` said "near $0.001." The mainnet average was 0.0021 USDC per demo transaction, so the text now says "about $0.002." Deployment cost 0.0602 USDC.
46. **A video line changed.** The script said the contract was "built and tested in Arc Studio." It was built locally and then imported, so the line now names what Studio did.
47. **The demo output is in the repo.** `agent/runs/mainnet-output.txt` holds the terminal output for the video, because the log in `/tmp` does not last.
