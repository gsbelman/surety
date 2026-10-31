import { pathToFileURL } from "node:url";
import {
  actor,
  erc20Abi,
  publicClientFor,
  selectNetwork,
  send,
  showUsdc,
  usdc,
  USDC_ADDRESS,
} from "./config";

/** Working balances for the demo: bond, payments, and gas. Everything stays in project wallets. */
export const TARGETS = {
  AGENT: usdc("0.60"),
  SELLER: usdc("1.20"),
  BAD_SELLER: usdc("0.40"),
};

/** Tops up the demo wallets from the deployer. A rerun sends only what is missing. */
export async function fundWallets() {
  const network = selectNetwork();
  const client = publicClientFor(network);
  const deployer = actor(network, "DEPLOYER", "deployer");

  for (const [envName, target] of Object.entries(TARGETS)) {
    const to = actor(network, envName, envName).account.address;
    const balance = await client.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [to],
    });
    if (balance >= target) {
      console.log(`${envName} has ${showUsdc(balance)}.`);
      continue;
    }
    await send(
      client,
      deployer,
      `deployer funds ${envName}`,
      { address: USDC_ADDRESS, abi: erc20Abi, functionName: "transfer", args: [to, target - balance] },
      network.explorer,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await fundWallets();
