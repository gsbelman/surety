import { useEffect, useRef, useState } from "react";
import { parseEventLogs, type Address, type Hash, type Log } from "viem";
import { erc20Abi, suretyAbi } from "../contract/abi";
import { LOG_CHUNK_BLOCKS, USDC_ADDRESS, type Network } from "../contract/networks";
import { useWallet } from "./wallet";

const POLL_MS = 4_000;
/** The app lists only recent payments, so a poll stays small. */
const PAYMENT_WINDOW = 60n;
/** About 3 hours of blocks at 0.5 s each. Older events come from the demo range. */
const FEED_LOOKBACK_CHUNKS = 20n;
const FEED_SIZE = 40;

export function usePoll<T>(load: () => Promise<T>, keys: readonly unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const { revision } = useWallet();
  const latest = useRef(load);
  latest.current = load;
  const shownKey = useRef("");
  const key = keys.map(String).join("|");

  useEffect(() => {
    let active = true;
    // A new transaction refetches in place. Only a new subject clears the old data.
    if (shownKey.current !== key) {
      shownKey.current = key;
      setData(null);
    }
    const tick = () =>
      latest.current().then(
        (value) => {
          if (!active) return;
          setData(value);
          setFailed(false);
        },
        () => active && setFailed(true),
      );
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [key, revision]);

  return { data, failed };
}

/** Seconds since the epoch, updated each second. */
export function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function useSeller(seller: Address | null) {
  const { client, network } = useWallet();
  const address = network.address;
  return usePoll(async () => {
    if (!address || !seller) return null;
    const read = { address, abi: suretyAbi } as const;
    const [stats, reliabilityBps, freeBond] = await Promise.all([
      client.readContract({ ...read, functionName: "sellerStats", args: [seller] }),
      client.readContract({ ...read, functionName: "reliabilityBps", args: [seller] }),
      client.readContract({ ...read, functionName: "freeBond", args: [seller] }),
    ]);
    return { stats, reliabilityBps, freeBond };
  }, [address, seller]);
}

export type SellerView = NonNullable<NonNullable<ReturnType<typeof useSeller>["data"]>>;

export type Payment = {
  id: bigint;
  buyer: Address;
  seller: Address;
  deliverBy: bigint;
  decideBy: bigint;
  status: number;
  amount: bigint;
  penalty: bigint;
  jobRef: Hash;
  proofHash: Hash;
};

/** Returns recent payments where the connected account is the buyer or the seller. */
export function usePayments() {
  const { client, network, account } = useWallet();
  const address = network.address;
  return usePoll(async () => {
    if (!address || !account) return [];
    const read = { address, abi: suretyAbi } as const;
    const last = await client.readContract({ ...read, functionName: "lastPaymentId" });
    const first = last > PAYMENT_WINDOW ? last - PAYMENT_WINDOW + 1n : 1n;
    const ids: bigint[] = [];
    for (let id = last; id >= first; id--) ids.push(id);

    const payments = await Promise.all(
      ids.map(async (id): Promise<Payment> => ({
        id,
        ...(await client.readContract({ ...read, functionName: "getPayment", args: [id] })),
      })),
    );
    return payments.filter((p) => p.buyer === account || p.seller === account);
  }, [address, account]);
}

export function useAccountData() {
  const { client, network, account } = useWallet();
  const address = network.address;
  return usePoll(async () => {
    if (!account) return null;
    const [balance, claimable] = await Promise.all([
      client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
      address
        ? client.readContract({ address, abi: suretyAbi, functionName: "claimable", args: [account] })
        : 0n,
    ]);
    return { balance, claimable };
  }, [address, account]);
}

export type FeedEvent = {
  key: string;
  name: string;
  args: Record<string, unknown>;
  block: bigint;
  index: number;
  hash: Hash;
};

async function logsBetween(client: ReturnType<typeof useWallet>["client"], network: Network, from: bigint, to: bigint) {
  const ranges: [bigint, bigint][] = [];
  for (let start = from; start <= to; start += LOG_CHUNK_BLOCKS) {
    const end = start + LOG_CHUNK_BLOCKS - 1n;
    ranges.push([start, end < to ? end : to]);
  }
  const chunks = await Promise.all(
    ranges.map(([fromBlock, toBlock]) => client.getLogs({ address: network.address!, fromBlock, toBlock })),
  );
  return chunks.flat();
}

function decode(logs: Log[]): FeedEvent[] {
  return parseEventLogs({ abi: suretyAbi, logs }).map((log) => ({
    key: `${log.transactionHash}-${log.logIndex}`,
    name: log.eventName,
    args: log.args as Record<string, unknown>,
    block: log.blockNumber,
    index: log.logIndex,
    hash: log.transactionHash,
  }));
}

/**
 * The RPC limits the block range of a log query. The feed reads the recent past, the known block
 * range of the demo run, and then follows the head.
 */
export function useFeed() {
  const { client, network } = useWallet();
  const [events, setEvents] = useState<FeedEvent[] | null>(null);

  useEffect(() => {
    if (!network.address) {
      setEvents([]);
      return;
    }
    let active = true;
    let cursor = 0n;
    setEvents(null);

    const merge = (incoming: FeedEvent[]) =>
      setEvents((current) => {
        const byKey = new Map((current ?? []).map((event) => [event.key, event]));
        for (const event of incoming) byKey.set(event.key, event);
        return [...byKey.values()].sort((a, b) => Number(b.block - a.block) || b.index - a.index).slice(0, FEED_SIZE);
      });

    const load = async () => {
      const head = await client.getBlockNumber();
      if (cursor === 0n) {
        const lookback = FEED_LOOKBACK_CHUNKS * LOG_CHUNK_BLOCKS;
        const recent = head > lookback ? head - lookback : 0n;
        const start = recent > network.deployBlock ? recent : network.deployBlock;
        const logs = await logsBetween(client, network, start, head);
        if (network.lastDemoBlock > 0n && network.lastDemoBlock < start) {
          logs.push(...(await logsBetween(client, network, network.deployBlock, network.lastDemoBlock)));
        }
        if (active) merge(decode(logs));
      } else if (head >= cursor) {
        const logs = await logsBetween(client, network, cursor, head);
        if (active) merge(decode(logs));
      }
      cursor = head + 1n;
    };

    const tick = () => load().catch(() => active && setEvents((current) => current ?? []));
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [client, network]);

  return events;
}
