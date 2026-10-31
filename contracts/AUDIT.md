# SuretyEscrow security review

Scope: `src/SuretyEscrow.sol` (solc 0.8.30, Prague, OpenZeppelin v5.7.0 `ReentrancyGuard` and `SafeERC20`).
Depth: maximum. Target: Arc Testnet (USDC via its 6-decimal ERC-20 interface).
Date: 2026-10-31.

This is best-effort review work. It is not a substitute for an independent third-party audit before any mainnet use.

## Method

- Two independent reviews of the source: a rule-corpus review and an adversary/functional review.
- Static analysis with Slither (102 detectors). Only 4 Low `timestamp` results, all expected (see SE-07).
- Foundry test suite before and after the fix.

## Test result

| Run | Result |
| --- | --- |
| Before changes | 56 passed, 0 failed (49 unit, 5 reentrancy, 2 invariant) |
| After the SE-01 fix | 58 passed, 0 failed (2 regression tests added) |
| After the test extension | 117 passed, 0 failed (59 tests added in `test/SuretyEscrow.audit.t.sol`) |

The two invariants hold: escrow is fully backed, and locked bond equals the open penalties.

## Summary

| ID | Severity | Title | Status |
| --- | --- | --- | --- |
| SE-01 | High | Arbiter can still `resolve` after its deadline | Fixed |
| SE-02 | High | A buyer can object to an honest delivery and take the penalty when the seller has no arbiter | Accepted, documented MVP rule |
| SE-03 | Medium | Unsolicited payments lock a seller's bond and force defensive transactions | Accepted, documented limit |
| SE-04 | Medium | A USDC blocklist entry on the escrow itself freezes all funds | Accepted, operational |
| SE-05 | Low | A blocked account's claim stays stuck until the issuer unblocks it | Accepted |
| SE-06 | Low | Revert errors carry no context values | Open, cosmetic |
| SE-07 | Low | Timestamp comparisons (Slither) | Accepted |
| SE-08 | Low | A seller-chosen arbiter can be the buyer or collude with one | Accepted, trust assumption |

No finding allows a third party to take funds beyond the rules below, and no finding stops settlement. Reentrancy, access control, and accounting passed review (see "Checked and clean").

## Findings

### SE-01 High, Fixed: Arbiter can still `resolve` after its deadline

Location: `resolve`.

`resolve` checked the caller and the status but not the arbiter deadline (`decideBy`). After the 7-day window, `settle` is meant to refund the buyer plus the penalty. The arbiter could still call `resolve(id, false)` first, including by front-running the buyer's `settle`, and release the payment to the seller. The documented guarantee, "an absent arbiter cannot freeze funds and defaults to refund plus penalty", could be defeated by a race.

Rating note: the rule-corpus review rated this Medium and the functional review rated it High. It is treated as High because it breaks a documented buyer guarantee and the fix is a single line with no downside.

Fix: `resolve` now reverts with `TooLate` when `block.timestamp > decideBy`. The boundary matches `settle`, which only works when `block.timestamp > decideBy`, so exactly one of the two works at any second. The public ABI is unchanged (`TooLate` already exists). Regression tests: `test_resolve_arbiterCannotActAfterDeadline`, `test_resolve_arbiterCanActOnDeadline`.

### SE-02 High, Accepted: Unverified objection with no arbiter

Location: `object`, `_refund`.

When a seller registers with `arbiter = address(0)` and a non-zero `penaltyBps`, a buyer can pay, wait for an honest delivery, and call `object`. The buyer then gets the payment back plus the seller's locked penalty and keeps the delivered work. Repeating this drains the seller's bond. The contract cannot verify the claim.

This is the documented MVP rule (DECISIONS.md item 8, README "buyer trust"). The terms are set by the seller and visible before payment, so it is a trust model and not an implementation bug. The functional review rated it Critical; it is rated High here because exposure is capped at the penalty the seller chose to lock plus the delivered work, and only for sellers who opt in.

Not fixed, because every complete fix changes the product rules and the demo, which uses no arbiter. Options:

1. Reject `register` when `penaltyBps > 0` and `arbiter == address(0)` (revert `BadTerms`). ABI unchanged. The agent demo and several tests must then use an arbiter or a 0% penalty.
2. Keep the rule and show a clear warning to sellers in the app before they register without an arbiter.
3. Add a default arbiter or on-chain evidence check. This adds a role and an ABI change.

Decision: keep the rule for this MVP. See DECISIONS.md item 37 and README "Known limits."

### SE-03 Medium, Accepted: Unsolicited payments grief a seller's bond

Location: `pay`, `decline`.

Anyone can call `pay` against any registered seller without the seller's consent. Each payment locks `amount * penaltyBps` of free bond and starts a slashable deadline. Effects:

- A seller who ignores a payment loses the penalty to the payer. An attentive seller avoids this with `decline`, which refunds the payer with no penalty. No funds are lost by an attentive seller.
- An attacker can lock all free bond with payments (their principal returns on decline), up to 30 days per payment, and can re-lock it right after a decline. A seller using a plain wallet can be blocked from `withdrawBond` this way. A smart wallet can batch `decline` and `withdrawBond` in one transaction.
- Each defensive `decline` costs the seller gas at Arc's 20 gwei fee floor. Many small payments scale that cost.

Rating note: the rule-corpus review rated this Medium and the functional review rated it High. It is rated Medium because the seller can always neutralize the loss and the attacker's capital is only locked, not spent.

Not fixed: the real fix needs a seller authorization step (signed quote or acceptance phase), which changes the `pay` ABI and the app and agent. Mitigations without an ABI change: sellers set a high `minDeliveryWindow`, keep a `decline` watcher running, and use a smart wallet.

Decision: keep `pay` as it is for this MVP. See DECISIONS.md item 38 and README "Known limits."

### SE-04 Medium, Accepted: Blocklisting the escrow freezes every balance

Location: `_payout`, `claim`, `withdrawBond`.

Arc USDC enforces an issuer blocklist. A blocked recipient is handled: the payout becomes a claim and the payment completes. If the issuer blocks the escrow contract address itself, all transfers out fail and no code path can recover the funds. This needs an issuer action and cannot be fixed in the contract. Mitigation is operational: keep the deployment non-custodial of large balances, and know the issuer contact path.

### SE-05 Low, Accepted: A blocked account's claim waits

`claimable[account]` stays recorded while the account is blocked. `claim` succeeds once the issuer unblocks it. Funds are not lost and accounting stays correct.

### SE-06 Low, Open: Errors carry no context

`InsufficientBond`, `WrongStatus`, `TooLate`, `TooEarly` take no parameters, which makes failed transactions harder to diagnose. Adding parameters changes the ABI errors, so it is left for a later change.

### SE-07 Low, Accepted: Timestamp comparisons

Slither flags `deliver`, `decline`, `object`, `settle` for `block.timestamp`. The shortest window is 30 seconds (`MIN_OBJECTION_WINDOW`) and block times are about half a second, so validator drift cannot change an outcome in practice. Boundaries are consistent: actions use `>` and `settle` uses `<=`.

### SE-08 Low, Accepted: Arbiter trust

The arbiter is named by the seller. It may be the buyer's address or collude with a buyer or the seller. A buyer sees the arbiter before paying. Buyers should check it.

## Requested focus areas

| Area | Result |
| --- | --- |
| Loss of funds | None found beyond SE-02 (rule-based). Invariants confirm the escrow stays fully backed. |
| Stuck funds | None. `settle` is permissionless for every non-final state, and failed payouts become claims. SE-04 and SE-05 depend on the token issuer. |
| Reentrancy | Clean. State is updated before every transfer, all value-moving entry points use `nonReentrant`, and USDC has no transfer hooks. |
| Access control | Clean. No owner, no upgrade path, no fee. Seller, buyer, and arbiter checks are correct. SE-01 closed the arbiter gap. |
| Arc USDC | The constructor requires 6 decimals. The contract never reads a native balance or `msg.value`. Blocklist is handled per recipient (SE-04 for the escrow itself). The 20 gwei fee floor is a client and gas concern, not contract code (see SE-03 for the griefing cost). |
| Griefing of the bond | SE-03 (lock and gas griefing) and SE-02 (rule-based slashing). Minimum delivery window already blocks the 1-second-deadline attack. |

## Checked and clean

- Integer math is checked (Solidity 0.8). `penalty <= bond - lockedBond` is enforced before any lock, so `lockedBond <= bond` always holds.
- Payment states are one-way. A finished payment cannot be settled twice.
- `resolve` and `settle` on an unknown id revert (`NotArbiter` / `WrongStatus`).
- No external calls other than the token. No delegatecall, no assembly, no selfdestruct.
