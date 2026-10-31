import { shorten, usdc } from "../lib/format";
import { useFeed, type FeedEvent } from "../lib/hooks";
import { useWallet } from "../lib/wallet";
import { Card, ExplorerLink } from "./ui";

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

export function Feed() {
  const { network } = useWallet();
  const events = useFeed();
  return (
    <Card title="Live contract events">
      {events === null && <p className="hint">Reading events…</p>}
      {events?.length === 0 && (
        <p className="hint">{network.address ? "No events yet." : "Events appear here after the contract goes live."}</p>
      )}
      <ol className="feed">
        {events?.map((event) => (
          <li key={event.key}>
            <span className={`dot ${TONE[event.name] ?? ""}`} />
            <span className="feed-text">{describe(event)}</span>
            <ExplorerLink kind="tx" value={event.hash} label="tx" />
          </li>
        ))}
      </ol>
    </Card>
  );
}
