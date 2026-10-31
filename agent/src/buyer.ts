import { keccak256, parseEventLogs, stringToHex, type Address, type Hex, type PublicClient } from "viem";
import { erc20Abi, send, showUsdc, suretyAbi, USDC_ADDRESS, waitForChainTime, type Actor } from "./config";
import type { Network } from "../../app/src/contract/networks";

/** A seller with fewer finished payments than this has no meaningful score yet. */
const MIN_HISTORY = 2;
const MIN_RELIABILITY_BPS = 8_000n;

export type Verdict = { ok: boolean; reason: string; reliabilityBps: bigint };

/** The agent's policy: read the onchain record of the seller before any money moves. */
export async function checkSeller(
  client: PublicClient,
  escrow: Address,
  seller: Address,
  amount: bigint,
): Promise<Verdict> {
  const read = { address: escrow, abi: suretyAbi } as const;
  const [stats, reliabilityBps, freeBond] = await Promise.all([
    client.readContract({ ...read, functionName: "sellerStats", args: [seller] }),
    client.readContract({ ...read, functionName: "reliabilityBps", args: [seller] }),
    client.readContract({ ...read, functionName: "freeBond", args: [seller] }),
  ]);

  const finished = stats.delivered + stats.refunded;
  const penalty = (amount * BigInt(stats.penaltyBps)) / 10_000n;
  console.log(
    `  score: ${Number(reliabilityBps) / 100}% over ${finished} payments, ` +
      `${stats.refunded} refunded, ${stats.objected} objected, bond ${showUsdc(stats.bond)}`,
  );

  const verdict = (ok: boolean, reason: string): Verdict => ({ ok, reason, reliabilityBps });
  if (!stats.registered) return verdict(false, "seller is not registered");
  if (freeBond < penalty) return verdict(false, "free bond cannot cover the penalty");
  if (stats.penaltyBps === 0) return verdict(false, "seller offers no penalty");
  if (finished >= BigInt(MIN_HISTORY) && reliabilityBps < MIN_RELIABILITY_BPS) {
    return verdict(false, `reliability ${Number(reliabilityBps) / 100}% is below the 80% floor`);
  }
  return verdict(true, finished === 0n ? "new seller, bond covers the risk" : "reliability is above the floor");
}

/** A buyer agent with one wallet. */
export class Buyer {
  constructor(
    private readonly network: Network,
    private readonly client: PublicClient,
    private readonly escrow: Address,
    private readonly who: Actor,
  ) {}

  private call<const name extends "pay" | "release" | "object" | "settle">(
    label: string,
    functionName: name,
    args: readonly unknown[],
  ) {
    return send(
      this.client,
      this.who,
      label,
      { address: this.escrow, abi: suretyAbi, functionName, args: args as never },
      this.network.explorer,
    );
  }

  /** Approves the escrow once for the full budget of the run. */
  async approve(budget: bigint) {
    const allowance = await this.client.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [this.who.account.address, this.escrow],
    });
    if (allowance >= budget) return;
    await send(
      this.client,
      this.who,
      "agent approves USDC",
      { address: USDC_ADDRESS, abi: erc20Abi, functionName: "approve", args: [this.escrow, budget] },
      this.network.explorer,
    );
  }

  async pay(seller: Address, amount: bigint, window: number, jobRef: Hex, label: string): Promise<bigint> {
    const receipt = await this.call(label, "pay", [seller, amount, window, jobRef]);
    const [paid] = parseEventLogs({ abi: suretyAbi, eventName: "Paid", logs: receipt.logs });
    console.log(`  paid ${showUsdc(amount)}, payment id ${paid.args.id}`);
    return paid.args.id;
  }

  /** Calls a paid API: reads the 402 terms, pays through Surety, and retries with the payment id. */
  async callPaidApi(url: string): Promise<{ id: bigint; status: number; body: string }> {
    const quote = await fetch(url);
    if (quote.status !== 402) throw new Error(`Expected HTTP 402, got ${quote.status}.`);
    const terms = (await quote.json()) as {
      seller: Address;
      amount: string;
      deliveryWindow: number;
      jobRef: Hex;
    };
    console.log(`  HTTP 402: price ${showUsdc(BigInt(terms.amount))}, ${terms.deliveryWindow} s to deliver`);

    const id = await this.pay(
      terms.seller,
      BigInt(terms.amount),
      terms.deliveryWindow,
      terms.jobRef,
      "agent pays through Surety",
    );

    const response = await fetch(url, { headers: { "x-surety-payment": id.toString() } });
    return { id, status: response.status, body: await response.text() };
  }

  /** Compares the response with the proof that the seller committed to onchain. */
  async proofMatches(id: bigint, body: string): Promise<boolean> {
    const payment = await this.client.readContract({
      address: this.escrow,
      abi: suretyAbi,
      functionName: "getPayment",
      args: [id],
    });
    return payment.proofHash === keccak256(stringToHex(body));
  }

  release(id: bigint) {
    return this.call(`agent releases payment ${id}`, "release", [id]);
  }

  object(id: bigint) {
    return this.call(`agent objects to payment ${id}`, "object", [id]);
  }

  /** Waits for the delivery deadline and settles. Anyone can call settle. */
  async settleAfterDeadline(id: bigint) {
    const payment = await this.client.readContract({
      address: this.escrow,
      abi: suretyAbi,
      functionName: "getPayment",
      args: [id],
    });
    const deadline = payment.status === 1 ? payment.deliverBy : payment.decideBy;
    console.log("  waiting for the deadline on the chain clock...");
    await waitForChainTime(this.client, deadline);
    return this.call(`settle payment ${id}`, "settle", [id]);
  }
}
