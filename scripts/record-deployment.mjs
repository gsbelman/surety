// Copies the address, block, and hash from the Foundry broadcast into deployments.json.
import { readFileSync, writeFileSync } from "node:fs";

const [network, chainId] = process.argv.slice(2);
const broadcast = new URL(
  `../contracts/broadcast/Deploy.s.sol/${chainId}/run-latest.json`,
  import.meta.url,
);
const file = new URL("../app/src/contract/deployments.json", import.meta.url);

const { transactions, receipts } = JSON.parse(readFileSync(broadcast, "utf8"));
const deployment = transactions.find((tx) => tx.transactionType === "CREATE");
const receipt = receipts.find((r) => r.transactionHash === deployment.hash);

const deployments = JSON.parse(readFileSync(file, "utf8"));
deployments[network] = {
  address: deployment.contractAddress,
  deployBlock: Number(BigInt(receipt.blockNumber)),
  deployTx: deployment.hash,
  lastDemoBlock: 0,
};
writeFileSync(file, `${JSON.stringify(deployments, null, 2)}\n`);
console.log(`Recorded ${network} deployment at ${deployment.contractAddress}.`);
