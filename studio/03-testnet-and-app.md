1. Fund a wallet with the built-in Arc testnet faucet and deploy surety/contracts/src/SuretyEscrow.sol to Arc testnet. The constructor argument is the USDC ERC-20 interface, 0x3600000000000000000000000000000000000000.
2. Bring the React app from surety/app into the workspace preview so that it runs in Studio. Keep the design. Set the testnet entry of app/src/contract/deployments.json to the new address and deployment block.
3. In the preview, confirm that the app reads the contract and shows live events. Then send a testnet flow through the contract: register a seller, post a bond, pay, deliver, and settle.
4. Report the contract address and the transaction hashes.
