import { createServer, type Server } from "node:http";
import { pathToFileURL } from "node:url";
import { formatUnits, getAddress, isAddress, keccak256, stringToHex, type Address, type Hash, type Hex } from "viem";
import {
  actor,
  erc20Abi,
  publicClientFor,
  requireEscrow,
  selectNetwork,
  send,
  suretyAbi,
  usdc,
  USDC_ADDRESS,
  type Actor,
} from "../src/config";
import type { Network } from "../../app/src/contract/networks";

export const PRICE = usdc("0.02");
export const DELIVERY_WINDOW = 60;
export const DEFAULT_PORT = 8790;

/** The server declines an unclaimed payment when this many seconds remain. */
const DECLINE_MARGIN = 20n;
const WATCH_INTERVAL_MS = 8_000;

const PENDING = 1;
const DELIVERED = 2;

/** The paid work. A failure here refunds the buyer through decline(). */
export type Work = (address: Address) => Promise<string>;

export const jobRefFor = (address: Address): Hex => keccak256(stringToHex(`address-report:${address.toLowerCase()}`));

/** The paid service: a report on an Arc address, read from the chain at one block. */
export const addressReport = (network: Network): Work => {
  const client = publicClientFor(network);
  return async (address) => {
    const blockNumber = await client.getBlockNumber();
    const [balance, code, txCount] = await Promise.all([
      client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [address], blockNumber }),
      client.getCode({ address, blockNumber }),
      client.getTransactionCount({ address, blockNumber }),
    ]);
    return JSON.stringify({
      address,
      network: network.key,
      block: blockNumber.toString(),
      usdcBaseUnits: balance.toString(),
      usdc: formatUnits(balance, 6),
      isContract: Boolean(code && code !== "0x"),
      txCount,
    });
  };
};

/** Sends one transaction at a time, because the HTTP handler and the watcher share a nonce. */
function serialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const next = tail.then(task, task);
    tail = next.catch(() => undefined);
    return next;
  };
}

/**
 * Serves paid calls and keeps the bond safe.
 *
 * Request: a call with no payment gets HTTP 402 and the terms. A call with a Surety payment id gets
 * the work. The server posts the hash of the response with deliver(), then returns the response.
 *
 * Watcher: a payment with no matching call would cost the seller the penalty at the deadline
 * (SE-03), so the watcher declines it before the deadline. The watcher also settles a delivery
 * after the objection window, so a silent buyer pays the seller with no other party.
 */
export async function startSellerApi(
  network: Network,
  seller: Actor,
  port: number,
  work: Work = addressReport(network),
): Promise<Server> {
  const client = publicClientFor(network);
  const escrow = requireEscrow(network);
  const contract = { address: escrow, abi: suretyAbi } as const;
  const sellerAddress = seller.account.address;
  const queue = serialQueue();

  const stats = await client.readContract({ ...contract, functionName: "sellerStats", args: [sellerAddress] });
  if (!stats.registered) throw new Error(`${sellerAddress} is not a registered seller.`);

  /** Payment ids that a handler or the watcher works on now. */
  const busy = new Set<bigint>();
  /** Results stay in memory, so a buyer can ask again if the first response gets lost. */
  const results = new Map<bigint, { body: string; proof: Hex; deliverTx: Hash }>();

  const sellerTx = (label: string, functionName: "deliver" | "decline" | "settle", args: readonly unknown[]) =>
    queue(() =>
      send(client, seller, label, { ...contract, functionName, args: args as never }, network.explorer),
    );

  const server = createServer(async (req, res) => {
    const reply = (status: number, body: string, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(body);
    };

    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === "/health") {
        return reply(200, JSON.stringify({ network: network.key, chainId: network.chain.id, escrow, seller: sellerAddress }));
      }
      if (url.pathname !== "/v1/address-report") return reply(404, '{"error":"not found"}');

      const target = url.searchParams.get("address") ?? "";
      if (!isAddress(target, { strict: false })) return reply(400, '{"error":"address is not valid"}');
      const address = getAddress(target);
      const jobRef = jobRefFor(address);

      const paymentHeader = req.headers["x-surety-payment"];
      if (typeof paymentHeader !== "string") {
        return reply(
          402,
          JSON.stringify({
            chainId: network.chain.id,
            escrow,
            seller: sellerAddress,
            amount: PRICE.toString(),
            deliveryWindow: DELIVERY_WINDOW,
            jobRef,
          }),
        );
      }
      if (!/^[0-9]+$/.test(paymentHeader)) return reply(400, '{"error":"payment id is not valid"}');

      const id = BigInt(paymentHeader);
      const payment = await client.readContract({ ...contract, functionName: "getPayment", args: [id] });
      if (payment.seller !== sellerAddress || payment.jobRef !== jobRef || payment.amount < PRICE) {
        return reply(403, '{"error":"payment does not match this job"}');
      }

      const done = results.get(id);
      const headersFor = (proof: Hex, deliverTx: Hash) => ({ "x-surety-proof": proof, "x-surety-deliver-tx": deliverTx });
      if (done) return reply(200, done.body, headersFor(done.proof, done.deliverTx));
      if (payment.status !== PENDING || busy.has(id)) return reply(409, '{"error":"payment is not open"}');

      busy.add(id);
      try {
        const body = await work(address);
        const proof = keccak256(stringToHex(body));
        const receipt = await sellerTx(`seller API delivers payment ${id}`, "deliver", [id, proof]);
        results.set(id, { body, proof, deliverTx: receipt.transactionHash });
        reply(200, body, headersFor(proof, receipt.transactionHash));
      } catch (error) {
        console.error(`  work failed for payment ${id}:`, error instanceof Error ? error.message : error);
        await sellerTx(`seller API declines payment ${id}`, "decline", [id]);
        reply(502, '{"error":"work failed, payment refunded with decline()"}');
      } finally {
        busy.delete(id);
      }
    } catch (error) {
      console.error("  seller API error:", error instanceof Error ? error.message : error);
      if (!res.headersSent) reply(500, '{"error":"internal error"}');
    }
  });

  /** Payment ids of this seller that can still change. */
  const open = new Set<bigint>();
  let nextId = 1n;

  async function watch() {
    const last = await client.readContract({ ...contract, functionName: "lastPaymentId" });
    for (; nextId <= last; nextId++) open.add(nextId);

    const { timestamp: now } = await client.getBlock({ blockTag: "latest" });
    for (const id of open) {
      const p = await client.readContract({ ...contract, functionName: "getPayment", args: [id] });
      if (p.seller !== sellerAddress || (p.status !== PENDING && p.status !== DELIVERED)) {
        open.delete(id);
      } else if (busy.has(id)) {
        continue;
      } else if (p.status === DELIVERED && now > p.decideBy) {
        busy.add(id);
        await sellerTx(`seller API settles payment ${id}`, "settle", [id]).finally(() => busy.delete(id));
      } else if (p.status === PENDING && now > p.deliverBy) {
        // decline() reverts after the deadline, and the penalty stands. settle() is for the buyer.
        open.delete(id);
      } else if (p.status === PENDING && now >= p.deliverBy - DECLINE_MARGIN) {
        busy.add(id);
        await sellerTx(`seller API declines payment ${id}`, "decline", [id]).finally(() => busy.delete(id));
      }
    }
  }

  // Each pass starts after the last one ends, so the watcher stays gentle on the public RPC.
  let timer: NodeJS.Timeout;
  const pass = () =>
    void watch()
      .catch((error) => console.error("  watcher error:", error instanceof Error ? error.message : error))
      .finally(() => {
        timer = setTimeout(pass, WATCH_INTERVAL_MS);
      });
  timer = setTimeout(pass, 0);
  server.on("close", () => clearTimeout(timer));

  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const network = selectNetwork();
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await startSellerApi(network, actor(network, "SELLER", "seller API"), port);
  console.log(`Seller API on ${network.label}: http://127.0.0.1:${port}/v1/address-report?address=0x...`);
}
