import type { ComponentProps, ReactNode } from "react";
import { useWallet } from "../lib/wallet";
import { shorten } from "../lib/format";

export function Card({ title, hint, children }: { title?: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card">
      {title && <h2>{title}</h2>}
      {hint && <p className="hint">{hint}</p>}
      {children}
    </section>
  );
}

export function Field({ label, note, ...input }: { label: string; note?: string } & ComponentProps<"input">) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...input} />
      {note && <small>{note}</small>}
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
  if (!network.address) return <p className="notice">Surety is not deployed on {network.label} yet.</p>;
  if (!hasWallet) return <p className="notice">Install a browser wallet to send transactions.</p>;
  if (!account) {
    return (
      <button className="primary" onClick={connect}>
        Connect wallet
      </button>
    );
  }
  if (wrongChain) {
    return (
      <button className="primary" onClick={switchWallet}>
        Switch wallet to {network.label}
      </button>
    );
  }
  return <>{children}</>;
}
