import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Radio } from "lucide-react";
import { shorten, usdc } from "../lib/format";
import { useFeed, usePoll, type FeedEvent } from "../lib/hooks";
import { useWallet } from "../lib/wallet";
import { EASE } from "./motion";
import { Card, Empty, ExplorerLink, Notice, Skeletons } from "./ui";

function describe({ name, args }: FeedEvent) {
  const id = args.id !== undefined ? `#${args.id}` : "";
  const amount = (key: string) => usdc(args[key] as bigint);
  const who = (key: string) => shorten(args[key] as string);

  switch (name) {
    case "SellerRegistered":
      return `${who("seller")} registered`;
    case "BondAdded":
      return `${who("seller")} added ${amount("amount")} bond`;
    case "BondWithdrawn":
      return `${who("seller")} withdrew ${amount("amount")} bond`;
    case "Paid":
      return `${id} paid ${amount("amount")} to ${who("seller")}`;
    case "Delivered":
      return `${id} delivered`;
    case "Declined":
      return `${id} declined by the seller`;
    case "Objected":
      return `${id} objected by the buyer`;
    case "Disputed":
      return `${id} sent to the arbiter`;
    case "Resolved":
      return `${id} resolved by the arbiter`;
    case "Released":
      return `${id} released ${amount("amount")} to the seller`;
    case "Refunded":
      return `${id} refunded ${amount("amount")} + ${amount("penalty")} penalty`;
    case "PayoutDeferred":
      return `${amount("amount")} kept as a claim for ${who("account")}`;
    case "Claimed":
      return `${who("account")} claimed ${amount("amount")}`;
    default:
      return name;
  }
}

const TONE: Record<string, string> = {
  Refunded: "bad",
  Objected: "bad",
  Disputed: "bad",
  Released: "good",
  Delivered: "good",
  BondAdded: "good",
};

function Live({ block }: { block: bigint }) {
  const reduced = useReducedMotion();
  return (
    <span className="live">
      <motion.span
        className="live-dot"
        animate={reduced ? undefined : { opacity: [1, 0.35, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />
      Block {block.toLocaleString("en-US")}
    </span>
  );
}

export function Feed() {
  const { client, network } = useWallet();
  const events = useFeed();
  // useFeed hides RPC failures, so this read tells a quiet contract from a dead connection.
  const head = usePoll(async () => (network.address ? client.getBlockNumber() : null), [network.key]);
  const offline = head.failed;

  return (
    <Card title="Contract events" side={head.data && !offline ? <Live block={head.data} /> : undefined}>
      {offline && <Notice tone="error">The RPC did not respond. This list can be out of date.</Notice>}
      {!offline && events === null && <Skeletons count={5} height={26} label="Reading events" />}
      {!offline && events?.length === 0 && (
        <Empty icon={Radio} title={network.address ? "No events yet" : "Waiting for the contract"}>
          {network.address
            ? "Each payment, delivery, and refund appears here as it lands on the chain."
            : "Events appear here after the contract goes live."}
        </Empty>
      )}
      {Boolean(events?.length) && (
        <ol className="feed" tabIndex={0} aria-label="Recent contract events">
          <AnimatePresence initial={false}>
            {events?.map((event) => (
              <motion.li
                key={event.key}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.45, ease: EASE }}
              >
                <span className={`dot ${TONE[event.name] ?? ""}`} />
                <span className="feed-text">{describe(event)}</span>
                <ExplorerLink kind="tx" value={event.hash} label="tx" />
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </Card>
  );
}
