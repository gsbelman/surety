import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { actor, publicClientFor, requireEscrow, selectNetwork, showUsdc, suretyAbi } from "./config";
import type { Hash } from "viem";

/**
 * Writes the deployed addresses and real transaction hashes into README.md and SUBMISSION.md,
 * between the marker comments. Also stores the last demo block for the app's event feed.
 */
const network = selectNetwork();
const client = publicClientFor(network);
const escrow = requireEscrow(network);

const root = new URL("../../", import.meta.url);
const runsFile = new URL(`agent/runs/${network.key}.json`, root);
if (!existsSync(runsFile)) throw new Error(`No demo run for ${network.key}.`);
const { runs } = JSON.parse(readFileSync(runsFile, "utf8")) as {
  runs: { escrow: string; txs: { label: string; hash: Hash }[] }[];
};
const txs = runs.filter((run) => run.escrow === escrow).flatMap((run) => run.txs);

const link = (kind: "address" | "tx", value: string) =>
  network.explorer ? `[\`${value}\`](${network.explorer}/${kind}/${value})` : `\`${value}\``;

const record = async (address: `0x${string}`) => {
  const [stats, reliability] = await Promise.all([
    client.readContract({ address: escrow, abi: suretyAbi, functionName: "sellerStats", args: [address] }),
    client.readContract({ address: escrow, abi: suretyAbi, functionName: "reliabilityBps", args: [address] }),
  ]);
  return `${Number(reliability) / 100}% reliable, ${stats.delivered} delivered, ${stats.refunded} refunded, bond ${showUsdc(stats.bond)}`;
};

const seller = actor(network, "SELLER", "seller").account.address;
const badSeller = actor(network, "BAD_SELLER", "bad seller").account.address;

const section = [
  `**${network.label}** (generated from real receipts by \`agent/src/report.ts\`)`,
  "",
  `- SuretyEscrow: ${link("address", escrow)}`,
  `- Deployment: ${link("tx", network.deployTx ?? "")}`,
  `- Honest seller ${link("address", seller)}: ${await record(seller)}`,
  `- Bad seller ${link("address", badSeller)}: ${await record(badSeller)}`,
  "",
  "| Step | Transaction |",
  "| :- | :- |",
  ...txs.map((tx) => `| ${tx.label} | ${link("tx", tx.hash)} |`),
].join("\n");

const start = `<!-- ${network.key.toUpperCase()}:START -->`;
const end = `<!-- ${network.key.toUpperCase()}:END -->`;

for (const name of ["README.md", "SUBMISSION.md"]) {
  const file = new URL(name, root);
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  if (from === -1 || to === -1) continue;
  writeFileSync(file, `${text.slice(0, from + start.length)}\n${section}\n${text.slice(to)}`);
  console.log(`Updated ${name}.`);
}

const hashes = txs.slice(-1);
if (hashes.length > 0) {
  const { blockNumber } = await client.getTransactionReceipt({ hash: hashes[0].hash });
  const deploymentsFile = new URL("app/src/contract/deployments.json", root);
  const deployments = JSON.parse(readFileSync(deploymentsFile, "utf8"));
  deployments[network.key].lastDemoBlock = Number(blockNumber);
  deployments[network.key].sellers = { honest: seller, bad: badSeller };
  writeFileSync(deploymentsFile, `${JSON.stringify(deployments, null, 2)}\n`);
}
console.log(`Report covers ${txs.length} transactions.`);
