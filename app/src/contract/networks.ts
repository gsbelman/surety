import { defineChain, type Address, type Chain, type Hash } from "viem";
import { arc, arcTestnet } from "viem/chains";
import deployments from "./deployments.json";

/** The ERC-20 interface of USDC on Arc. It uses 6 decimals. Native balances use 18. */
export const USDC_ADDRESS: Address = "0x3600000000000000000000000000000000000000";
export const USDC_DECIMALS = 6;

/** Arc drops transactions below this fee without an error. */
export const MIN_MAX_FEE_PER_GAS = 20_000_000_000n;

/** The Arc RPC rejects log queries over wider ranges. */
export const LOG_CHUNK_BLOCKS = 1_000n;

const arcLocal = defineChain({
  id: 31337,
  name: "Arc Local",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

type Deployment = {
  address: string | null;
  deployBlock: number;
  deployTx: string | null;
  lastDemoBlock: number;
  sellers?: { honest: string; bad: string } | null;
};

export type NetworkKey = "mainnet" | "testnet" | "local";

export type Network = {
  key: NetworkKey;
  label: string;
  chain: Chain;
  rpcUrl: string;
  explorer: string | null;
  address: Address | null;
  deployBlock: bigint;
  deployTx: Hash | null;
  lastDemoBlock: bigint;
  sellers: { honest: Address; bad: Address } | null;
};

function network(key: NetworkKey, label: string, chain: Chain, explorer: string | null): Network {
  const deployment: Deployment = deployments[key];
  return {
    key,
    label,
    chain,
    rpcUrl: chain.rpcUrls.default.http[0],
    explorer,
    address: deployment.address as Address | null,
    deployBlock: BigInt(deployment.deployBlock),
    deployTx: deployment.deployTx as Hash | null,
    lastDemoBlock: BigInt(deployment.lastDemoBlock),
    sellers: (deployment.sellers ?? null) as Network["sellers"],
  };
}

export const networks: Record<NetworkKey, Network> = {
  mainnet: network("mainnet", "Arc Mainnet", arc, "https://explorer.arc.io"),
  testnet: network("testnet", "Arc Testnet", arcTestnet, "https://explorer.testnet.arc.io"),
  local: network("local", "Arc Local", arcLocal, null),
};
