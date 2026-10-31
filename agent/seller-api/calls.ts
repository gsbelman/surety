import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAddressEqual, type Address, type Hash, type Hex } from "viem";
import { Buyer, checkSeller } from "../src/buyer";
import {
  actor,
  erc20Abi,
  publicClientFor,
  requireEscrow,
  selectNetwork,
  showUsdc,
  suretyAbi,
  txLog,
  usdc,
  USDC_ADDRESS,
} from "../src/config";
import { DEFAULT_PORT, DELIVERY_WINDOW, PRICE } from "./server";

/** Limits for one run. The script reads the balances and stops before it spends if they fail. */
const CALLS = 3n;
const GAS_PER_TX_CEILING = usdc("0.005");
const AGENT_TXS = 5n;
const SELLER_TXS = 3n;
const MAX_SPEND = usdc("0.30");
const AGENT_RESERVE = usdc("0.25");
const SELLER_RESERVE = usdc("0.20");

/** Set FROM_CALL=2 or 3 to continue a run that stopped. */
const FROM_CALL = Number(process.env.FROM_CALL ?? 1);
const WAIT_LIMIT_MS = 120_000;
const RELEASED = 4;
const REFUNDED = 5;

const network = selectNetwork();
const client = publicClientFor(network);
const escrow = requireEscrow(network);
const contract = { address: escrow, abi: suretyAbi } as const;
const api = process.env.SELLER_API_URL ?? `http://127.0.0.1:${DEFAULT_PORT}`;

const agent = actor(network, "AGENT", "agent");
const buyer = new Buyer(network, client, escrow, agent);

type Terms = { chainId: number; escrow: Address; seller: Address; amount: string; deliveryWindow: number; jobRef: Hex };
type Step = { label: string; hash: Hash };
type CallRecord = { name: string; target: Address; paymentId: string; outcome: string; steps: Step[] };

const link = (hash: Hash) => (network.explorer ? `${network.explorer}/tx/${hash}` : hash);
const usdcBalance = (address: Address) =>
  client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [address] });

const health = (await (await fetch(`${api}/health`)).json()) as { chainId: number; escrow: Address; seller: Address };
if (health.chainId !== network.chain.id || health.escrow !== escrow) {
  throw new Error(`The server at ${api} does not use ${network.label} and escrow ${escrow}.`);
}
const seller = health.seller;

async function balances() {
  const [agentUsdc, sellerUsdc] = await Promise.all([usdcBalance(agent.account.address), usdcBalance(seller)]);
  return { agentUsdc, sellerUsdc, total: agentUsdc + sellerUsdc };
}

const start = await balances();
const startBond = await client.readContract({ ...contract, functionName: "freeBond", args: [seller] });
let paid = 0n;

/** Stops the run before a payment that breaks a limit. In-flight payments count as spent. */
async function checkBudget() {
  const now = await balances();
  const gasSoFar = start.total > now.total ? start.total - now.total : 0n;
  if (paid + gasSoFar + PRICE > MAX_SPEND) throw new Error("The next payment passes the spending limit.");
  if (now.agentUsdc < AGENT_RESERVE + PRICE) throw new Error("The next payment passes the agent reserve.");
  if (now.sellerUsdc < SELLER_RESERVE) throw new Error("The seller is at its reserve.");
}

function preflight() {
  const worstAgent = CALLS * PRICE + AGENT_TXS * GAS_PER_TX_CEILING;
  const worstSeller = SELLER_TXS * GAS_PER_TX_CEILING;
  console.log(`Agent ${showUsdc(start.agentUsdc)}, seller ${showUsdc(start.sellerUsdc)}, seller free bond ${showUsdc(startBond)}.`);
  console.log(`Worst case: ${showUsdc(worstAgent + worstSeller)} of the ${showUsdc(MAX_SPEND)} limit.`);
  if (worstAgent + worstSeller > MAX_SPEND) throw new Error("The plan passes the spending limit.");
  if (start.agentUsdc - worstAgent < AGENT_RESERVE) throw new Error("The agent would pass its reserve. Nothing was spent.");
  if (start.sellerUsdc - worstSeller < SELLER_RESERVE) throw new Error("The seller would pass its reserve. Nothing was spent.");
}

async function quote(target: Address): Promise<{ url: string; terms: Terms }> {
  const url = `${api}/v1/address-report?address=${target}`;
  const response = await fetch(url);
  if (response.status !== 402) throw new Error(`Expected HTTP 402, got ${response.status}.`);
  const terms = (await response.json()) as Terms;
  if (terms.escrow !== escrow || terms.seller !== seller) throw new Error("The terms name another escrow or seller.");
  if (BigInt(terms.amount) > PRICE) throw new Error("The price is above the limit of this run.");
  console.log(`  HTTP 402: price ${showUsdc(BigInt(terms.amount))}, ${terms.deliveryWindow} s to deliver`);
  return { url, terms };
}

async function payFor(terms: Terms) {
  await checkBudget();
  const verdict = await checkSeller(client, escrow, seller, BigInt(terms.amount));
  console.log(`  policy: ${verdict.ok ? "pay" : "refuse"} (${verdict.reason})`);
  if (!verdict.ok) throw new Error(`The policy refused the seller: ${verdict.reason}.`);
  const fromBlock = await client.getBlockNumber();
  const id = await buyer.pay(seller, BigInt(terms.amount), terms.deliveryWindow, terms.jobRef, "agent pays through Surety");
  paid += BigInt(terms.amount);
  return { id, fromBlock };
}

/** Reads what the server did from the chain, so the record does not depend on the server. */
async function eventTx(eventName: "Delivered" | "Released" | "Declined", id: bigint, fromBlock: bigint): Promise<Hash> {
  const logs = await client.getContractEvents({ ...contract, eventName, args: { id } as never, fromBlock });
  const log = logs.at(-1);
  if (!log) throw new Error(`No ${eventName} event for payment ${id}.`);
  return log.transactionHash;
}

async function waitForStatus(id: bigint, status: number) {
  const giveUp = Date.now() + WAIT_LIMIT_MS;
  while (Date.now() < giveUp) {
    const payment = await client.readContract({ ...contract, functionName: "getPayment", args: [id] });
    if (payment.status === status) return payment;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`Payment ${id} did not reach status ${status}.`);
}

async function fetchResult(url: string, id: bigint) {
  const response = await fetch(url, { headers: { "x-surety-payment": id.toString() } });
  const body = await response.text();
  console.log(`  HTTP ${response.status}: ${body}`);
  if (response.status !== 200) throw new Error(`The server answered ${response.status}.`);
  return body;
}

/** Reads the reported balance from the chain at the reported block. */
async function dataMatches(body: string, target: Address) {
  const report = JSON.parse(body) as { address: Address; block: string; usdcBaseUnits: string };
  const balance = await client.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [target],
    blockNumber: BigInt(report.block),
  });
  const dataOk = isAddressEqual(report.address, target) && balance.toString() === report.usdcBaseUnits;
  console.log(`  data check: ${dataOk ? `balance matches the chain at block ${report.block}` : "no match"}`);
  return dataOk;
}

const paySteps = () => txLog.slice(-1).map(({ label, hash }) => ({ label, hash }));

/** Call 1: the buyer checks the result and releases the payment at once. */
async function buyerReleases(): Promise<CallRecord> {
  console.log("\n=== Call 1: the buyer verifies the result and releases");
  const target = escrow;
  const { url, terms } = await quote(target);
  const { id, fromBlock } = await payFor(terms);
  const steps = paySteps();
  const body = await fetchResult(url, id);
  steps.push({ label: "server delivers the hash", hash: await eventTx("Delivered", id, fromBlock) });
  const proofOk = await buyer.proofMatches(id, body);
  console.log(`  proof check: ${proofOk ? "keccak256(response) matches the onchain proof" : "no match"}`);
  if (!proofOk) {
    await buyer.object(id);
    throw new Error("The response failed the hash check, so the agent objected.");
  }
  // An objection cannot be undone, and a bad read is not proof of a lie. The run stops here, and
  // the payment settles to the seller after the objection window.
  if (!(await dataMatches(body, target))) throw new Error("The data check failed. The run stopped with no objection.");
  const receipt = await buyer.release(id);
  steps.push({ label: "agent releases", hash: receipt.transactionHash });
  return { name: "Buyer verifies and releases", target, paymentId: id.toString(), outcome: "seller paid", steps };
}

/** Call 2: the buyer takes the result and stays silent. The server collects after the window. */
async function buyerStaysSilent(): Promise<CallRecord> {
  console.log("\n=== Call 2: the buyer stays silent, so the server settles and collects");
  const target = seller;
  const { url, terms } = await quote(target);
  const { id, fromBlock } = await payFor(terms);
  const steps = paySteps();
  await fetchResult(url, id);
  steps.push({ label: "server delivers the hash", hash: await eventTx("Delivered", id, fromBlock) });
  console.log("  buyer does nothing. Waiting for the objection window on the chain clock...");
  await waitForStatus(id, RELEASED);
  const hash = await eventTx("Released", id, fromBlock);
  console.log(`  tx server settles: ${link(hash)}`);
  steps.push({ label: "server settles", hash });
  return { name: "Buyer stays silent, seller collects", target, paymentId: id.toString(), outcome: "seller paid", steps };
}

/** Call 3: the buyer pays and never calls the API. The server refunds it, and the bond is safe. */
async function paymentWithNoCall(): Promise<CallRecord> {
  console.log("\n=== Call 3: a payment with no API call, so the server declines it before the deadline");
  const target = USDC_ADDRESS;
  const { terms } = await quote(target);
  const { id, fromBlock } = await payFor(terms);
  const steps = paySteps();
  console.log(`  buyer never calls the API. The deadline is ${DELIVERY_WINDOW} s away...`);
  await waitForStatus(id, REFUNDED);
  const hash = await eventTx("Declined", id, fromBlock);
  console.log(`  tx server declines: ${link(hash)}`);
  steps.push({ label: "server declines", hash });
  return { name: "Payment with no call, server declines", target, paymentId: id.toString(), outcome: "buyer refunded, no penalty", steps };
}

const record = async () => {
  const [stats, reliability] = await Promise.all([
    client.readContract({ ...contract, functionName: "sellerStats", args: [seller] }),
    client.readContract({ ...contract, functionName: "reliabilityBps", args: [seller] }),
  ]);
  return {
    reliabilityPct: Number(reliability) / 100,
    delivered: stats.delivered.toString(),
    refunded: stats.refunded.toString(),
    objected: stats.objected.toString(),
    declined: stats.declined.toString(),
    bond: showUsdc(stats.bond),
  };
};

console.log(`Seller API calls on ${network.label}. Escrow ${escrow}, seller ${seller}, API ${api}.`);
preflight();
const before = await record();
console.log("Seller record before:", before);
await buyer.approve(CALLS * PRICE);

const calls: CallRecord[] = [];
let failure: unknown;
try {
  if (FROM_CALL <= 1) calls.push(await buyerReleases());
  if (FROM_CALL <= 2) calls.push(await buyerStaysSilent());
  if (FROM_CALL <= 3) calls.push(await paymentWithNoCall());
} catch (error) {
  failure = error;
  console.error("Run stopped:", error instanceof Error ? error.message : error);
}

const end = await balances();
const endBond = await client.readContract({ ...contract, functionName: "freeBond", args: [seller] });
const after = await record();
console.log("\n=== Result");
console.log("Seller record after:", after);
console.log(`Agent ${showUsdc(start.agentUsdc)} -> ${showUsdc(end.agentUsdc)}.`);
console.log(`Seller ${showUsdc(start.sellerUsdc)} -> ${showUsdc(end.sellerUsdc)}.`);
console.log(`Seller free bond ${showUsdc(startBond)} -> ${showUsdc(endBond)}.`);
console.log(`Paid into escrow ${showUsdc(paid)}. Net cost in gas ${showUsdc(start.total - end.total)}.`);

const dir = new URL("../runs/", import.meta.url);
mkdirSync(dir, { recursive: true });
const file = new URL(`seller-api-${network.key}.json`, dir);
const log = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { runs: [] };
log.runs.push({
  at: new Date().toISOString(),
  network: network.key,
  escrow,
  seller,
  buyer: agent.account.address,
  price: showUsdc(PRICE),
  stoppedWith: failure instanceof Error ? failure.message.split("\n")[0] : null,
  paidIntoEscrow: showUsdc(paid),
  balances: {
    agent: { before: showUsdc(start.agentUsdc), after: showUsdc(end.agentUsdc) },
    seller: { before: showUsdc(start.sellerUsdc), after: showUsdc(end.sellerUsdc) },
  },
  sellerRecord: { before, after },
  calls,
});
writeFileSync(file, `${JSON.stringify(log, null, 2)}\n`);

if (failure) process.exit(1);
