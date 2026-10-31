import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { keccak256, parseEventLogs, stringToHex, type Address, type TransactionReceipt } from "viem";
import { Buyer, checkSeller } from "./buyer";
import {
  actor,
  erc20Abi,
  publicClientFor,
  requireEscrow,
  selectNetwork,
  send,
  showUsdc,
  suretyAbi,
  txLog,
  usdc,
  USDC_ADDRESS,
  type Actor,
} from "./config";
import { fundWallets } from "./fund";
import { DEMO_TERMS, PRICE, startSeller, type Behavior } from "./seller";

const SELLER_BOND = usdc("1");
const BAD_SELLER_BOND = usdc("0.25");
const AGENT_BUDGET = usdc("0.50");
const REPLY_PRICE = usdc("0.01");
const REPLY_WINDOW = 15;

const network = selectNetwork();
const client = publicClientFor(network);
const escrow = requireEscrow(network);
const contract = { address: escrow, abi: suretyAbi } as const;

const agent = actor(network, "AGENT", "agent");
const seller = actor(network, "SELLER", "honest seller");
const badSeller = actor(network, "BAD_SELLER", "bad seller");
const buyer = new Buyer(network, client, escrow, agent);

function scene(title: string) {
  console.log(`\n=== ${title}`);
}

/** Registers a seller and tops the bond up to the target. A rerun skips what is done. */
async function prepareSeller(who: Actor, bond: bigint) {
  const stats = await client.readContract({
    ...contract,
    functionName: "sellerStats",
    args: [who.account.address],
  });
  if (!stats.registered) {
    await send(
      client,
      who,
      `${who.name} registers`,
      { ...contract, functionName: "register", args: DEMO_TERMS },
      network.explorer,
    );
  }
  if (stats.bond >= bond) return;

  const missing = bond - stats.bond;
  await send(
    client,
    who,
    `${who.name} approves bond`,
    { address: USDC_ADDRESS, abi: erc20Abi, functionName: "approve", args: [escrow, missing] },
    network.explorer,
  );
  await send(
    client,
    who,
    `${who.name} posts ${showUsdc(missing)} bond`,
    { ...contract, functionName: "addBond", args: [missing] },
    network.explorer,
  );
}

async function withApi<T>(who: Actor, behavior: Behavior, port: number, run: (url: string) => Promise<T>) {
  const server: Server = await startSeller(network, who, behavior, port);
  try {
    return await run(`http://127.0.0.1:${port}/v1/forecast?city=Madrid`);
  } finally {
    server.close();
  }
}

/** Runs the policy. The scenes against the bad seller continue on a rerun, for the record. */
async function check(sellerAddress: Address, amount: bigint) {
  const verdict = await checkSeller(client, escrow, sellerAddress, amount);
  console.log(`  policy: ${verdict.ok ? "pay" : "refuse"} (${verdict.reason})`);
  return verdict;
}

async function honestPayment() {
  scene("1. Honest seller: agent verifies the proof and releases at once");
  await check(seller.account.address, PRICE);
  await withApi(seller, "honest", 8801, async (url) => {
    const { id, status, body } = await buyer.callPaidApi(url);
    console.log(`  HTTP ${status}: ${body}`);
    if (!(await buyer.proofMatches(id, body))) throw new Error("The honest seller failed the proof check.");
    console.log("  proof check: keccak256(response) matches the onchain proof");
    await buyer.release(id);
  });
}

async function unattendedRelease() {
  scene("2. Honest seller: the buyer stays offline, so settle releases after the objection window");
  await withApi(seller, "honest", 8802, async (url) => {
    const { id } = await buyer.callPaidApi(url);
    await buyer.settleAfterDeadline(id);
  });
}

async function silentSeller() {
  scene("3. Silent seller: no delivery by the deadline, so settle refunds the buyer plus the penalty");
  await check(badSeller.account.address, PRICE);
  await withApi(badSeller, "silent", 8803, async (url) => {
    const { id, status, body } = await buyer.callPaidApi(url);
    console.log(`  HTTP ${status}: ${body}`);
    printRefund(await buyer.settleAfterDeadline(id));
  });
}

async function lyingSeller() {
  scene("4. Lying seller: the response fails the proof check, so the agent objects");
  await withApi(badSeller, "liar", 8804, async (url) => {
    const { id, body } = await buyer.callPaidApi(url);
    const matches = await buyer.proofMatches(id, body);
    console.log(`  HTTP 200: ${body}`);
    console.log(`  proof check: ${matches ? "match" : "keccak256(response) does not match the onchain proof"}`);
    if (matches) throw new Error("The lying seller passed the proof check.");
    printRefund(await buyer.object(id));
  });
}

async function refuseBadSeller() {
  scene("5. The score works: the agent now refuses the bad seller, and no money moves");
  const verdict = await check(badSeller.account.address, PRICE);
  if (verdict.ok) throw new Error("The policy should refuse the bad seller.");
}

async function payForReply() {
  scene("6. Pay-for-a-reply: the recipient replies, and the payer accepts");
  const question = "Can you review my pitch deck?";
  const answered = await buyer.pay(
    seller.account.address,
    REPLY_PRICE,
    REPLY_WINDOW,
    keccak256(stringToHex(question)),
    "payer pays for a reply",
  );
  await send(
    client,
    seller,
    `recipient replies to payment ${answered}`,
    {
      ...contract,
      functionName: "deliver",
      args: [answered, keccak256(stringToHex("Yes. Send it over."))],
    },
    network.explorer,
  );
  await buyer.release(answered);

  scene("7. Pay-for-a-reply: no reply in time, so the payment refunds itself");
  const ignored = await buyer.pay(
    badSeller.account.address,
    REPLY_PRICE,
    REPLY_WINDOW,
    keccak256(stringToHex("Are you still hiring?")),
    "payer pays for a reply",
  );
  await buyer.settleAfterDeadline(ignored);
}

function printRefund(receipt: TransactionReceipt) {
  const [refund] = parseEventLogs({ abi: suretyAbi, eventName: "Refunded", logs: receipt.logs });
  const { amount, penalty } = refund.args;
  console.log(`  agent received ${showUsdc(amount)} refund plus ${showUsdc(penalty)} penalty from the bond`);
}

async function printRecord(who: Actor) {
  const [stats, reliability] = await Promise.all([
    client.readContract({ ...contract, functionName: "sellerStats", args: [who.account.address] }),
    client.readContract({ ...contract, functionName: "reliabilityBps", args: [who.account.address] }),
  ]);
  console.log(
    `  ${who.name}: ${Number(reliability) / 100}% reliable, ${stats.delivered} delivered, ` +
      `${stats.refunded} refunded, ${stats.objected} objected, bond ${showUsdc(stats.bond)}`,
  );
}

function saveRun() {
  const dir = new URL("../runs/", import.meta.url);
  mkdirSync(dir, { recursive: true });
  const file = new URL(`${network.key}.json`, dir);
  const previous = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { runs: [] };
  previous.runs.push({ at: new Date().toISOString(), escrow, txs: txLog });
  writeFileSync(file, `${JSON.stringify(previous, null, 2)}\n`);
}

console.log(`Surety demo on ${network.label}. Escrow ${escrow}.`);
try {
  scene("0. Setup: fund the wallets, register the sellers, and post the bonds");
  await fundWallets();
  await prepareSeller(seller, SELLER_BOND);
  await prepareSeller(badSeller, BAD_SELLER_BOND);
  await buyer.approve(AGENT_BUDGET);

  await honestPayment();
  await unattendedRelease();
  await silentSeller();
  await lyingSeller();
  await refuseBadSeller();
  await payForReply();

  scene("Final onchain record");
  await printRecord(seller);
  await printRecord(badSeller);
} finally {
  saveRun();
  console.log(`\nSent ${txLog.length} transactions.`);
}
