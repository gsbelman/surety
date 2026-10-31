import { createServer, type Server } from "node:http";
import { pathToFileURL } from "node:url";
import { keccak256, stringToHex, type Hex } from "viem";
import { actor, publicClientFor, requireEscrow, selectNetwork, send, suretyAbi, usdc, type Actor } from "./config";
import type { Network } from "../../app/src/contract/networks";

/**
 * honest: does the work, posts the proof, and serves the response.
 * silent: takes the payment and never delivers.
 * liar:   posts a proof for one response and serves another.
 */
export type Behavior = "honest" | "silent" | "liar";

export const PRICE = usdc("0.05");
export const DELIVERY_WINDOW = 45;

/** The mock paid service: a forecast API. The work is deterministic, so a hash can prove it. */
function forecast(city: string) {
  return JSON.stringify({ city, forecast: "clear", highC: 21, lowC: 12, source: "surety-demo-api" });
}

export const jobRefFor = (path: string): Hex => keccak256(stringToHex(path));

/** Terms for a demo seller: 10% penalty, 10 s minimum delivery, 30 s objection window. */
export const DEMO_TERMS = [1_000, 10, 30, "0x0000000000000000000000000000000000000000"] as const;

/**
 * Serves an HTTP 402 flow in the style of x402. A request without payment gets a 402 with the
 * terms. A request with a Surety payment id gets the work, and the seller posts the proof onchain.
 */
export function startSeller(network: Network, seller: Actor, behavior: Behavior, port: number): Promise<Server> {
  const client = publicClientFor(network);
  const escrow = requireEscrow(network);
  const served = new Set<string>();

  const server = createServer(async (req, res) => {
    const reply = (status: number, body: string, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(body);
    };

    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== "/v1/forecast") return reply(404, '{"error":"not found"}');

      const path = `${url.pathname}${url.search}`;
      const paymentId = req.headers["x-surety-payment"];
      if (typeof paymentId !== "string") {
        return reply(
          402,
          JSON.stringify({
            escrow,
            seller: seller.account.address,
            amount: PRICE.toString(),
            deliveryWindow: DELIVERY_WINDOW,
            jobRef: jobRefFor(path),
          }),
        );
      }

      const id = BigInt(paymentId);
      const payment = await client.readContract({
        address: escrow,
        abi: suretyAbi,
        functionName: "getPayment",
        args: [id],
      });
      const valid =
        payment.seller === seller.account.address &&
        payment.status === 1 &&
        payment.amount >= PRICE &&
        payment.jobRef === jobRefFor(path) &&
        !served.has(paymentId);
      if (!valid) return reply(403, '{"error":"payment does not match this job"}');
      served.add(paymentId);

      if (behavior === "silent") return reply(202, '{"status":"processing"}');

      const body = forecast(url.searchParams.get("city") ?? "Madrid");
      await send(
        client,
        seller,
        `${seller.name} delivers payment ${id}`,
        { address: escrow, abi: suretyAbi, functionName: "deliver", args: [id, keccak256(stringToHex(body))] },
        network.explorer,
      );

      reply(200, behavior === "liar" ? '{"forecast":"lorem ipsum"}' : body);
    } catch (error) {
      console.error(`  ${seller.name} API error:`, error);
      reply(500, '{"error":"internal error"}');
    }
  });

  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const network = selectNetwork();
  const behavior = (process.env.SELLER_BEHAVIOR ?? "honest") as Behavior;
  const envName = behavior === "honest" ? "SELLER" : "BAD_SELLER";
  const port = Number(process.env.PORT ?? 8787);
  await startSeller(network, actor(network, envName, "seller"), behavior, port);
  console.log(`Mock paid API (${behavior}) on http://127.0.0.1:${port}/v1/forecast?city=Madrid`);
}
