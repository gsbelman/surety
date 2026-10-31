import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatUnits,
  http,
  parseUnits,
  type Abi,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type Hash,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { erc20Abi, suretyAbi } from "../../app/src/contract/abi";
import {
  MIN_MAX_FEE_PER_GAS,
  USDC_ADDRESS,
  USDC_DECIMALS,
  networks,
  type Network,
  type NetworkKey,
} from "../../app/src/contract/networks";

export { erc20Abi, suretyAbi, USDC_ADDRESS };

export function selectNetwork(): Network {
  const key = (process.env.SURETY_NETWORK ?? "local") as NetworkKey;
  const network = networks[key];
  if (!network) throw new Error(`Unknown network "${key}". Use mainnet, testnet, or local.`);
  return network;
}

export function requireEscrow(network: Network): Address {
  if (!network.address) throw new Error(`No deployment for ${network.key}. Deploy first.`);
  return network.address;
}

export function publicClientFor(network: Network): PublicClient {
  return createPublicClient({ chain: network.chain, transport: http(network.rpcUrl) });
}

export type Actor = {
  name: string;
  account: PrivateKeyAccount;
  wallet: WalletClient;
};

export function actor(network: Network, envName: string, name: string): Actor {
  const key = process.env[`${envName}_PRIVATE_KEY`];
  if (!key) throw new Error(`Missing ${envName}_PRIVATE_KEY in .env.`);
  const account = privateKeyToAccount(key as `0x${string}`);
  const wallet = createWalletClient({ account, chain: network.chain, transport: http(network.rpcUrl) });
  return { name, account, wallet };
}

export const usdc = (amount: string) => parseUnits(amount, USDC_DECIMALS);
export const showUsdc = (amount: bigint) => `${formatUnits(amount, USDC_DECIMALS)} USDC`;

/** Doubles the current price and keeps the fee above the Arc floor. */
async function fees(client: PublicClient) {
  const price = await client.getGasPrice();
  const maxFeePerGas = price * 2n > MIN_MAX_FEE_PER_GAS * 2n ? price * 2n : MIN_MAX_FEE_PER_GAS * 2n;
  return { maxFeePerGas, maxPriorityFeePerGas: 1_000_000_000n };
}

/**
 * Estimates with no fee fields. With a fee and no gas limit, the Arc node reserves block gas limit
 * times fee from the sender (1.2 USDC at 40 gwei). The reservation shares a balance with the
 * USDC being moved, so a valid transfer fails the estimate.
 */
async function estimateGas(client: PublicClient, from: Address, to: Address, data: Hex) {
  const gas = await client.request({ method: "eth_estimateGas", params: [{ from, to, data }] });
  return (BigInt(gas) * 13n) / 10n;
}

export type TxRecord = { label: string; hash: Hash; from: Address };

/** Collects every transaction of a run, so the report can list real hashes. */
export const txLog: TxRecord[] = [];

export async function send<
  const abi extends Abi,
  name extends ContractFunctionName<abi, "nonpayable">,
  args extends ContractFunctionArgs<abi, "nonpayable", name>,
>(
  client: PublicClient,
  who: Actor,
  label: string,
  call: { address: Address; abi: abi; functionName: name; args: args },
  explorer: string | null,
): Promise<TransactionReceipt> {
  const request = call as never as { address: Address; abi: Abi; functionName: string; args: readonly unknown[] };
  const hash = await who.wallet.writeContract({
    ...request,
    account: who.account,
    chain: who.wallet.chain,
    gas: await estimateGas(client, who.account.address, call.address, encodeFunctionData(request)),
    ...(await fees(client)),
  });
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);

  txLog.push({ label, hash, from: who.account.address });
  console.log(`  tx ${label}: ${explorer ? `${explorer}/tx/${hash}` : hash}`);
  return receipt;
}

/** Waits until the chain clock passes a timestamp. The local clock can drift from the chain. */
export async function waitForChainTime(client: PublicClient, timestamp: bigint) {
  for (;;) {
    const { timestamp: now } = await client.getBlock({ blockTag: "latest" });
    if (now > timestamp) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}
