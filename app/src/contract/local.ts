import { defineChain } from "viem";
import { local } from "./deployments.json";
import { network } from "./networks";

const arcLocal = defineChain({
  id: 31337,
  name: "Arc Local",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

/** For dev builds and the agent only. */
export const localNetwork = network("local", "Arc Local", arcLocal, null, local);
