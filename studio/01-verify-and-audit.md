The repository is cloned at surety/. It holds a Foundry project in surety/contracts.

1. Run the Foundry test suite in surety/contracts and report the result.
2. Audit surety/contracts/src/SuretyEscrow.sol (max preset). Check for loss of funds, stuck funds, reentrancy, access control, Arc USDC behavior (6 decimal ERC-20 interface, blocklist, 20 gwei fee floor), and griefing of the bond.
3. Fix only critical or high findings. Keep the public ABI unchanged unless a fix requires a change.
4. Write the findings to surety/contracts/AUDIT.md, with severity and status for each finding.
