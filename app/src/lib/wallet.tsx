import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  getAddress,
  http,
  numberToHex,
  type Abi,
  type Address,
  type EIP1193Provider,
  type Hash,
  type PublicClient,
} from "viem";
import { MIN_MAX_FEE_PER_GAS, networks, type Network, type NetworkKey } from "../contract/networks";
import { explain } from "./errors";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

const USER_REJECTED = 4001;

/** Local exists only in dev builds. The production build holds no local node config. */
const available: Partial<Record<NetworkKey, Network>> = import.meta.env.DEV
  ? { ...networks, local: (await import("../contract/local")).localNetwork }
  : networks;

export const visibleNetworks = Object.values(available);

function initialNetwork(): NetworkKey {
  const stored = localStorage.getItem("surety.network") as NetworkKey | null;
  if (stored && visibleNetworks.some((n) => n.key === stored)) return stored;
  return networks.mainnet.address || !networks.testnet.address ? "mainnet" : "testnet";
}

export type Call = {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
};

export type TxState = { label: string; phase: "wallet" | "chain" | "done" | "error"; detail?: string; hash?: Hash };

type WalletContext = {
  network: Network;
  client: PublicClient;
  account: Address | null;
  hasWallet: boolean;
  wrongChain: boolean;
  tx: TxState | null;
  /** Grows after each confirmed transaction, so readers can refetch. */
  revision: number;
  connect: () => Promise<void>;
  selectNetwork: (key: NetworkKey) => void;
  switchWallet: () => Promise<void>;
  clearTx: () => void;
  write: (label: string, call: Call) => Promise<boolean>;
};

const Context = createContext<WalletContext | null>(null);

export function useWallet() {
  const value = useContext(Context);
  if (!value) throw new Error("useWallet needs a WalletProvider.");
  return value;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [networkKey, setNetworkKey] = useState<NetworkKey>(initialNetwork);
  const [account, setAccount] = useState<Address | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [tx, setTx] = useState<TxState | null>(null);
  const [revision, setRevision] = useState(0);

  const network = available[networkKey]!;
  const provider = window.ethereum;

  const client = useMemo(
    () =>
      createPublicClient({
        chain: network.chain,
        pollingInterval: 1_000,
        transport: http(network.rpcUrl, { batch: true }),
      }) as PublicClient,
    [network],
  );

  useEffect(() => {
    if (!provider) return;
    const onAccounts = (accounts: Address[]) => setAccount(accounts[0] ? getAddress(accounts[0]) : null);
    const onChain = (chainId: string) => setWalletChainId(Number(chainId));

    provider.request({ method: "eth_accounts" }).then((accounts) => onAccounts(accounts as Address[]));
    provider.request({ method: "eth_chainId" }).then(onChain);
    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    return () => {
      provider.removeListener("accountsChanged", onAccounts);
      provider.removeListener("chainChanged", onChain);
    };
  }, [provider]);

  const switchWallet = useCallback(async () => {
    if (!provider) return;
    const chainId = numberToHex(network.chain.id);
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    } catch (error) {
      // 4001 means that the user said no. Any other failure means an unknown chain.
      if ((error as { code?: number }).code === USER_REJECTED) return;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId,
            chainName: network.label,
            nativeCurrency: network.chain.nativeCurrency,
            rpcUrls: [network.rpcUrl],
            blockExplorerUrls: network.explorer ? [network.explorer] : undefined,
          },
        ],
      });
    }
  }, [provider, network]);

  const connect = useCallback(async () => {
    if (!provider) return;
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const [first] = accounts as Address[];
      setAccount(first ? getAddress(first) : null);
      await switchWallet();
    } catch (error) {
      if ((error as { code?: number }).code !== USER_REJECTED) {
        setTx({ label: "Connect wallet", phase: "error", detail: explain(error) });
      }
    }
  }, [provider, switchWallet]);

  const selectNetwork = useCallback((key: NetworkKey) => {
    localStorage.setItem("surety.network", key);
    setNetworkKey(key);
    setTx(null);
  }, []);

  const write = useCallback(
    async (label: string, call: Call) => {
      if (!provider || !account) return false;
      setTx({ label, phase: "wallet" });
      try {
        await client.simulateContract({ ...call, account });

        // The estimate carries no fee fields. See agent/src/config.ts for the reason.
        const data = encodeFunctionData(call);
        const gas = await client.request({
          method: "eth_estimateGas",
          params: [{ from: account, to: call.address, data }],
        });
        const price = await client.getGasPrice();
        const floor = MIN_MAX_FEE_PER_GAS * 2n;

        const wallet = createWalletClient({ account, chain: network.chain, transport: custom(provider) });
        const hash = await wallet.writeContract({
          ...call,
          account,
          chain: network.chain,
          gas: (BigInt(gas) * 13n) / 10n,
          maxFeePerGas: price * 2n > floor ? price * 2n : floor,
          maxPriorityFeePerGas: 1_000_000_000n,
        });

        setTx({ label, phase: "chain", hash });
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("The transaction reverted.");

        setTx({ label, phase: "done", hash });
        setRevision((r) => r + 1);
        return true;
      } catch (error) {
        setTx({ label, phase: "error", detail: explain(error) });
        return false;
      }
    },
    [provider, account, client, network],
  );

  const value: WalletContext = {
    network,
    client,
    account,
    hasWallet: Boolean(provider),
    wrongChain: Boolean(account) && walletChainId !== null && walletChainId !== network.chain.id,
    tx,
    revision,
    connect,
    selectNetwork,
    switchWallet,
    clearTx: () => setTx(null),
    write,
  };

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
