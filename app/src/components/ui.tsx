import { useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { motion } from "motion/react";
import { AlertTriangle, CheckCircle2, CircleAlert, Info, Loader2, type LucideIcon } from "lucide-react";
import { useWallet } from "../lib/wallet";
import { shorten } from "../lib/format";
import { rise, SPRING } from "./motion";

export function Card({
  title,
  hint,
  side,
  children,
}: {
  title?: string;
  hint?: string;
  side?: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.section className="card" variants={rise} initial="hidden" animate="show">
      {title && (
        <div className="card-head">
          <h2>{title}</h2>
          {side}
        </div>
      )}
      {hint && <p className="hint">{hint}</p>}
      <div className={title || hint ? "card-body" : undefined}>{children}</div>
    </motion.section>
  );
}

export function Field({
  label,
  note,
  warn,
  ...input
}: { label: string; note?: string; warn?: boolean } & ComponentProps<"input">) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...input} />
      {note && <small className={warn ? "warn" : undefined}>{note}</small>}
    </label>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

type ButtonProps = Omit<ComponentProps<typeof motion.button>, "onClick" | "children"> & {
  tone?: "primary" | "danger" | "link";
  small?: boolean;
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => unknown;
};

/** A press spring, plus a spinner while the click handler runs. */
export function Button({ tone, small, className, disabled, onClick, children, ...button }: ButtonProps) {
  const [running, setRunning] = useState(false);
  const blocked = disabled || running;

  const run = async (event: MouseEvent<HTMLButtonElement>) => {
    setRunning(true);
    try {
      await onClick?.(event);
    } finally {
      setRunning(false);
    }
  };

  return (
    <motion.button
      {...button}
      className={["button", tone, small && "small", className].filter(Boolean).join(" ")}
      disabled={blocked}
      aria-busy={running}
      onClick={run}
      whileHover={blocked ? undefined : { y: -1 }}
      whileTap={blocked ? undefined : { scale: 0.97 }}
      transition={SPRING}
    >
      {running && <Loader2 className="spin" size={16} aria-hidden="true" />}
      {children}
    </motion.button>
  );
}

const NOTICE: Record<string, LucideIcon> = {
  info: Info,
  warn: AlertTriangle,
  error: CircleAlert,
  good: CheckCircle2,
};

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "good"; children: ReactNode }) {
  const Icon = NOTICE[tone];
  return (
    <motion.p
      className={`notice ${tone}`}
      role={tone === "error" ? "alert" : undefined}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Icon size={17} aria-hidden="true" />
      <span>{children}</span>
    </motion.p>
  );
}

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={20} aria-hidden="true" />
      </span>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

export function Skeletons({ count = 2, height = 64, label }: { count?: number; height?: number; label: string }) {
  return (
    <div className="skeletons" role="status" aria-label={label}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}

export function ExplorerLink({ kind, value, label }: { kind: "address" | "tx"; value: string; label?: string }) {
  const { network } = useWallet();
  const text = label ?? shorten(value);
  if (!network.explorer) return <code>{text}</code>;
  return (
    <a href={`${network.explorer}/${kind}/${value}`} target="_blank" rel="noreferrer">
      {text}
    </a>
  );
}

/** Blocks a form until the wallet is connected to the selected network. */
export function WalletGate({ children }: { children: ReactNode }) {
  const { account, connect, hasWallet, wrongChain, switchWallet, network } = useWallet();
  if (!network.address) return <Notice tone="warn">Surety is not deployed on {network.label} yet.</Notice>;
  if (!hasWallet) return <Notice>Install a browser wallet to send transactions.</Notice>;
  if (!account) {
    return (
      <Button tone="primary" className="stretch" onClick={connect}>
        Connect wallet
      </Button>
    );
  }
  if (wrongChain) {
    return (
      <Button tone="primary" className="stretch" onClick={switchWallet}>
        Switch wallet to {network.label}
      </Button>
    );
  }
  return <>{children}</>;
}
