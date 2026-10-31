import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { Clock, Lock, ShieldCheck, Store, Wallet, type LucideIcon } from "lucide-react";
import { EASE } from "./motion";
import { Timeline, type Step } from "./Timeline";

type Story = "delivers" | "silent";
type Place = "buyer" | "escrow" | "seller";

type Scene = {
  story: Story;
  coin: Place;
  caption: string;
  steps: Step["state"][];
  outcome?: string;
};

const SCENES: Scene[] = [
  { story: "delivers", coin: "buyer", steps: ["todo", "todo", "todo"], caption: "The seller locks a USDC bond." },
  { story: "delivers", coin: "escrow", steps: ["done", "active", "todo"], caption: "The buyer pays into escrow." },
  {
    story: "delivers",
    coin: "escrow",
    steps: ["done", "done", "active"],
    caption: "The seller posts proof before the deadline.",
  },
  {
    story: "delivers",
    coin: "seller",
    steps: ["done", "done", "released"],
    outcome: "Released",
    caption: "No objection, so the seller gets paid.",
  },
  { story: "silent", coin: "buyer", steps: ["todo", "todo", "todo"], caption: "A new payment, a different seller." },
  { story: "silent", coin: "escrow", steps: ["done", "active", "todo"], caption: "The buyer pays into escrow." },
  {
    story: "silent",
    coin: "escrow",
    steps: ["done", "late", "todo"],
    caption: "The seller stays silent past the deadline.",
  },
  {
    story: "silent",
    coin: "buyer",
    steps: ["done", "skipped", "refunded"],
    outcome: "Refunded",
    caption: "Anyone settles. The buyer gets a refund plus the bond penalty.",
  },
];

const SCENE_MS = 2_400;
const FINAL_DELIVERS = 3;
const FINAL_SILENT = 7;

const X = { buyer: 48, escrow: 180, seller: 312 };
const NODE_Y = 66;
const BOND_Y = 150;
const coinMove = { duration: 1, ease: EASE };

function Node({ x, label, icon: Icon, fill, ink, dim }: {
  x: number;
  label: string;
  icon: LucideIcon;
  fill: string;
  ink: string;
  dim?: boolean;
}) {
  return (
    <motion.g animate={{ opacity: dim ? 0.45 : 1 }} transition={{ duration: 0.4 }}>
      <text x={x} y="16" textAnchor="middle">
        {label}
      </text>
      <circle cx={x} cy={NODE_Y} r="29" fill={fill} stroke="#fff" strokeWidth="3" />
      <Icon x={x - 12} y={NODE_Y - 12} width="24" height="24" color={ink} />
    </motion.g>
  );
}

function Coin({ r = 12, fill, label }: { r?: number; fill: string; label: string }) {
  return (
    <>
      <circle r={r} fill={fill} stroke="#fff" strokeWidth="2.5" />
      <text textAnchor="middle" dy="4.5" style={{ fill: "#fff", fontSize: 13, fontWeight: 700 }}>
        {label}
      </text>
    </>
  );
}

function Diagram({ scene }: { scene: Scene }) {
  const proofShown = scene.story === "delivers" && scene.steps[1] === "done" && scene.coin === "escrow";
  const silent = scene.story === "silent" && scene.steps[1] === "late";
  const refunded = scene.steps[2] === "refunded";
  const released = scene.steps[2] === "released";

  return (
    <svg
      className="flow-svg"
      viewBox="0 0 360 178"
      role="img"
      aria-label="A buyer pays USDC into escrow. If the seller delivers, the seller gets the USDC. If the seller stays silent, the buyer gets a refund plus a penalty from the seller's bond."
    >
      <path className="flow-rail" d={`M${X.buyer + 30} ${NODE_Y}H${X.seller - 30}`} />
      <path className="flow-rail" d={`M${X.seller} ${NODE_Y + 30}V${BOND_Y - 19}`} />
      <path className="flow-rail dashed" d={`M${X.seller - 44} ${BOND_Y}H${X.buyer}V${NODE_Y + 30}`} />

      <motion.path
        className="flow-trail"
        d={`M${X.buyer} ${NODE_Y}H${X.escrow}`}
        stroke="#4b2fe0"
        initial={false}
        animate={{ pathLength: scene.coin === "buyer" && !refunded ? 0 : 1, opacity: refunded ? 0 : 1 }}
        transition={coinMove}
      />
      <motion.path
        className="flow-trail"
        d={`M${X.escrow} ${NODE_Y}H${X.seller}`}
        stroke="#1fa775"
        initial={false}
        animate={{ pathLength: released ? 1 : 0 }}
        transition={coinMove}
      />

      <Node x={X.buyer} label="Buyer" icon={Wallet} fill="#d9edff" ink="#0c5590" />
      <Node x={X.escrow} label="Escrow" icon={ShieldCheck} fill="#e9e4ff" ink="#43309f" />
      <Node x={X.seller} label="Seller" icon={Store} fill="#d5f5e6" ink="#0a6345" dim={silent || refunded} />

      <rect x={X.seller - 44} y={BOND_Y - 19} width="88" height="38" rx="14" fill="#ffe4d4" stroke="#fff" strokeWidth="3" />
      <Lock x={X.seller - 30} y={BOND_Y - 9} width="18" height="18" color="#8f3f0b" />
      <text x={X.seller + 6} y={BOND_Y + 5} textAnchor="middle">
        Bond
      </text>

      <motion.g
        initial={false}
        animate={{ x: proofShown ? X.escrow : X.seller, y: NODE_Y, opacity: proofShown ? [0, 1, 1, 0] : 0 }}
        transition={{ duration: 1.5, ease: "easeInOut" }}
      >
        <rect x="-24" y="-12" width="48" height="24" rx="8" fill="#0a6345" />
        <text textAnchor="middle" dy="4.5" style={{ fill: "#fff", fontSize: 12, fontWeight: 700 }}>
          Proof
        </text>
      </motion.g>

      <motion.g initial={false} animate={{ opacity: silent ? 1 : 0, y: silent ? 0 : 6 }} transition={{ duration: 0.35 }}>
        <rect x={X.seller - 49} y="100" width="98" height="24" rx="12" fill="#fff" stroke="#b4501a" strokeWidth="1.5" />
        <Clock x={X.seller - 41} y="105" width="14" height="14" color="#8f3f0b" />
        <text x={X.seller + 7} y="116.5" textAnchor="middle" style={{ fontSize: 11.5, fill: "#8f3f0b" }}>
          No delivery
        </text>
      </motion.g>

      <motion.g
        initial={false}
        animate={
          refunded
            ? { x: [X.seller - 44, X.buyer, X.buyer], y: [BOND_Y, BOND_Y, NODE_Y + 14], opacity: 1 }
            : { x: X.seller - 44, y: BOND_Y, opacity: 0 }
        }
        transition={{ duration: refunded ? 1.3 : 0.25, ease: "easeInOut", delay: refunded ? 0.35 : 0 }}
      >
        <Coin r={11} fill="#b4501a" label="+" />
      </motion.g>

      <motion.g
        initial={false}
        animate={{ x: X[scene.coin], y: NODE_Y }}
        transition={coinMove}
      >
        <Coin fill="#4b2fe0" label="$" />
      </motion.g>
    </svg>
  );
}

/** A sample payment that plays both endings. It loops only while it is on screen. */
export function FlowDiagram() {
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { amount: 0.3 });
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(reduced ? FINAL_DELIVERS : 0);
  const [paused, setPaused] = useState(false);
  const scene = SCENES[index];

  useEffect(() => {
    if (reduced || paused || !inView) return;
    const timer = setTimeout(() => setIndex((current) => (current + 1) % SCENES.length), SCENE_MS);
    return () => clearTimeout(timer);
  }, [index, inView, reduced, paused]);

  // A viewer who picks a story sees its ending. The loop stays stopped, so the ending stays put.
  const pick = (story: Story) => {
    setPaused(true);
    setIndex(story === "delivers" ? FINAL_DELIVERS : FINAL_SILENT);
  };

  const [paid, delivery] = scene.steps;
  const steps: Step[] = [
    { label: "Paid", state: paid },
    {
      label: delivery === "done" ? "Delivered" : delivery === "skipped" ? "Not delivered" : "Delivery",
      state: delivery,
    },
    { label: scene.outcome ?? "Settlement", state: scene.steps[2] },
  ];

  return (
    <motion.div
      ref={box}
      className="flow"
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.9, delay: 0.25, ease: EASE }}
    >
      <div className="flow-head">
        <div className="flow-tabs" role="group" aria-label="Example payment outcome">
          {(["delivers", "silent"] as const).map((story) => (
            <button
              key={story}
              type="button"
              className={story === scene.story ? "tab active" : "tab"}
              aria-pressed={story === scene.story}
              onClick={() => pick(story)}
            >
              {story === scene.story && (
                <motion.span
                  className="tab-pill"
                  layoutId="flow-pill"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="tab-label">{story === "delivers" ? "Seller delivers" : "Seller stays silent"}</span>
            </button>
          ))}
        </div>
      </div>

      <Diagram scene={scene} />
      <Timeline steps={steps} />

      <div className="flow-caption">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={scene.caption + scene.story}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2 }}
          >
            {scene.caption}
          </motion.span>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
