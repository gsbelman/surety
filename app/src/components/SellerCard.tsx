import type { Address } from "viem";
import { formatUnits } from "viem";
import { motion } from "motion/react";
import { USDC_DECIMALS } from "../contract/networks";
import { duration, usdc } from "../lib/format";
import type { SellerView } from "../lib/hooks";
import { CountUp, EASE, SOFT_SPRING } from "./motion";
import { ExplorerLink, Notice, Stat } from "./ui";

const RADIUS = 36;

function Ring({ percent, tone, label }: { percent: number; tone?: string; label: string }) {
  return (
    <div className="ring">
      <svg viewBox="0 0 84 84" aria-hidden="true">
        <circle className="ring-track" cx="42" cy="42" r={RADIUS} />
        {percent > 0 && (
          <motion.circle
            className={`ring-fill ${tone ?? ""}`}
            cx="42"
            cy="42"
            r={RADIUS}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: percent / 100 }}
            transition={SOFT_SPRING}
          />
        )}
      </svg>
      <strong>{tone ? <CountUp value={percent} text={label} /> : label}</strong>
    </div>
  );
}

const count = (value: bigint) => <CountUp value={Number(value)} text={value.toString()} />;
const money = (value: bigint) => <CountUp value={Number(formatUnits(value, USDC_DECIMALS))} text={usdc(value)} />;

/** The onchain record of a seller: what an agent reads before it pays. */
export function SellerCard({ address, view }: { address: Address; view: SellerView }) {
  const { stats, reliabilityBps, freeBond } = view;
  if (!stats.registered) {
    return (
      <div className="seller">
        <Notice tone="warn">This address is not a registered seller.</Notice>
      </div>
    );
  }

  const finished = stats.delivered + stats.refunded;
  const percent = Number(reliabilityBps) / 100;
  const tone = finished === 0n ? undefined : percent >= 80 ? "good" : "bad";

  return (
    <motion.div
      className="seller"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      <div className="score">
        <Ring percent={percent} tone={tone} label={finished === 0n ? "New" : `${percent}%`} />
        <div className="score-text">
          <strong>{finished === 0n ? "No history yet" : `Reliable over ${finished} payments`}</strong>
          <ExplorerLink kind="address" value={address} />
        </div>
      </div>
      <div className="stats">
        <Stat label="Delivered" value={count(stats.delivered)} tone="good" />
        <Stat label="Refunded" value={count(stats.refunded)} tone={stats.refunded > 0n ? "bad" : undefined} />
        <Stat label="Objected" value={count(stats.objected)} />
        <Stat label="Declined" value={count(stats.declined)} />
        <Stat label="Bond" value={money(stats.bond)} />
        <Stat label="Free bond" value={money(freeBond)} />
      </div>
      <ul className="terms">
        <li>Penalty {stats.penaltyBps / 100}%</li>
        <li>Delivery from {duration(stats.minDeliveryWindow)}</li>
        <li>Objection {duration(stats.objectionWindow)}</li>
        <li>{stats.arbiter === ZERO ? "MVP objection rule" : "Arbiter decides"}</li>
      </ul>
    </motion.div>
  );
}

const ZERO = "0x0000000000000000000000000000000000000000";
