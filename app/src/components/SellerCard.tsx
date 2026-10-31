import type { Address } from "viem";
import { duration, usdc } from "../lib/format";
import type { SellerView } from "../lib/hooks";
import { ExplorerLink, Stat } from "./ui";

/** The onchain record of a seller: what an agent reads before it pays. */
export function SellerCard({ address, view }: { address: Address; view: SellerView }) {
  const { stats, reliabilityBps, freeBond } = view;
  if (!stats.registered) return <p className="notice">This address is not a registered seller.</p>;

  const finished = stats.delivered + stats.refunded;
  const percent = Number(reliabilityBps) / 100;
  const tone = finished === 0n ? undefined : percent >= 80 ? "good" : "bad";

  return (
    <div className="seller">
      <div className="score">
        <strong className={tone}>{finished === 0n ? "New" : `${percent}%`}</strong>
        <span>{finished === 0n ? "no history yet" : `reliable over ${finished} payments`}</span>
        <ExplorerLink kind="address" value={address} />
      </div>
      <div className="stats">
        <Stat label="Delivered" value={stats.delivered.toString()} tone="good" />
        <Stat label="Refunded" value={stats.refunded.toString()} tone={stats.refunded > 0n ? "bad" : undefined} />
        <Stat label="Objected" value={stats.objected.toString()} />
        <Stat label="Declined" value={stats.declined.toString()} />
        <Stat label="Bond" value={`${usdc(stats.bond)}`} />
        <Stat label="Free bond" value={`${usdc(freeBond)}`} />
      </div>
      <p className="terms">
        Penalty {stats.penaltyBps / 100}% · delivery from {duration(stats.minDeliveryWindow)} · objection{" "}
        {duration(stats.objectionWindow)} · {stats.arbiter === ZERO ? "MVP objection rule" : "arbiter decides"}
      </p>
    </div>
  );
}

const ZERO = "0x0000000000000000000000000000000000000000";
