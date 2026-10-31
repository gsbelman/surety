import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, CircleAlert, Hourglass, Loader2, X } from "lucide-react";
import { formatUnits } from "viem";
import { suretyAbi } from "./contract/abi";
import { USDC_DECIMALS } from "./contract/networks";
import { Background } from "./components/Background";
import { Feed } from "./components/Feed";
import { Hero } from "./components/Hero";
import { HowItWorks } from "./components/HowItWorks";
import { CountUp, EASE, Reveal, SPRING } from "./components/motion";
import { Button, ExplorerLink } from "./components/ui";
import { shorten, usdc, whole } from "./lib/format";
import { useAccountData } from "./lib/hooks";
import { useWallet, visibleNetworks } from "./lib/wallet";
import { BuyerPage } from "./pages/BuyerPage";
import { ReplyPage } from "./pages/ReplyPage";
import { SellerPage } from "./pages/SellerPage";
import type { NetworkKey } from "./contract/networks";

const TABS = [
  { key: "buyer", label: "Buyer", page: BuyerPage },
  { key: "seller", label: "Seller", page: SellerPage },
  { key: "reply", label: "Pay-for-a-reply", page: ReplyPage },
] as const;

/** A confirmed transaction leaves on its own. A failure stays until the user dismisses it. */
const TOAST_MS = 7_000;

function Header() {
  const { network, selectNetwork, account, connect, hasWallet } = useWallet();
  const { data } = useAccountData();

  return (
    <header className="topbar">
      <a className="brand" href="#top">
        <img src="/favicon.svg" alt="" width="28" height="28" />
        <span>Surety</span>
      </a>
      <nav className="topnav" aria-label="Page">
        <a href="#how">How it works</a>
        <a href="#app">App</a>
      </nav>
      <div className="header-right">
        <select
          aria-label="Network"
          value={network.key}
          onChange={(e) => selectNetwork(e.target.value as NetworkKey)}
        >
          {visibleNetworks.map((n) => (
            <option key={n.key} value={n.key}>
              {n.label}
            </option>
          ))}
        </select>
        {account ? (
          <span className="account">
            {data && (
              <strong>
                <CountUp value={Number(formatUnits(data.balance, USDC_DECIMALS))} text={whole(data.balance)} />
                <small> USDC</small>
              </strong>
            )}
            <code>{shorten(account)}</code>
          </span>
        ) : (
          <Button tone="primary" small disabled={!hasWallet} onClick={connect}>
            <span className="long">{hasWallet ? "Connect wallet" : "No wallet found"}</span>
            <span className="short">{hasWallet ? "Connect" : "No wallet"}</span>
          </Button>
        )}
      </div>
    </header>
  );
}

function NotDeployed() {
  const { network } = useWallet();
  if (network.address) return null;

  return (
    <Reveal>
      <div className="pending" role="status">
        <span className="tile">
          <Hourglass size={20} aria-hidden="true" />
        </span>
        <div>
          <strong>Contract not deployed yet.</strong>
          <span>Coming to {network.label}. Until then, this app is a preview and cannot send transactions.</span>
        </div>
      </div>
    </Reveal>
  );
}

function TxToast() {
  const { tx, clearTx } = useWallet();

  useEffect(() => {
    if (tx?.phase !== "done") return;
    const timer = setTimeout(clearTx, TOAST_MS);
    return () => clearTimeout(timer);
    // clearTx is a new function on each render, so only a new transaction restarts the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx]);

  const text = tx && {
    wallet: "Confirm in your wallet",
    chain: "Waiting for the chain",
    done: "Confirmed",
    error: "Failed",
  }[tx.phase];

  return (
    <AnimatePresence>
      {tx && (
        <motion.div
          key="toast"
          className={`toast ${tx.phase}`}
          role="status"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.35, ease: EASE }}
        >
          <span className="toast-icon">
            {tx.phase === "done" && <Check size={17} strokeWidth={3} aria-hidden="true" />}
            {tx.phase === "error" && <CircleAlert size={17} aria-hidden="true" />}
            {(tx.phase === "wallet" || tx.phase === "chain") && (
              <Loader2 className="spin" size={17} aria-hidden="true" />
            )}
          </span>
          <div className="toast-text">
            <strong>{tx.label}</strong>
            <span>
              {text}
              {tx.detail && `: ${tx.detail}`}
            </span>
          </div>
          <div className="toast-side">
            {(tx.phase === "done" || tx.phase === "error") && (
              <Button tone="link" aria-label="Dismiss" onClick={clearTx}>
                <X size={16} aria-hidden="true" />
              </Button>
            )}
            {tx.hash && <ExplorerLink kind="tx" value={tx.hash} />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ClaimBanner() {
  const { network, write } = useWallet();
  const { data } = useAccountData();
  if (!data || data.claimable === 0n || !network.address) return null;

  return (
    <motion.div className="claim" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <span>You have {usdc(data.claimable)} USDC to claim.</span>
      <Button
        tone="primary"
        small
        onClick={() =>
          write("Claim USDC", {
            address: network.address!,
            abi: suretyAbi,
            functionName: "claim",
            args: [],
          })
        }
      >
        Claim
      </Button>
    </motion.div>
  );
}

export function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("buyer");
  const Page = TABS.find((t) => t.key === tab)!.page;

  return (
    <>
      <Background />
      <div className="shell" id="top">
        <Header />
        <Hero />
        <NotDeployed />
        <HowItWorks />

        <section className="section" id="app">
          <Reveal className="section-head">
            <span className="eyebrow">The app</span>
            <h2>Try a guaranteed payment.</h2>
            <p>Pick a role. Your wallet signs each action, and the contract does the rest.</p>
          </Reveal>

          <ClaimBanner />

          <nav className="tabs" aria-label="Sections">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={t.key === tab ? "tab active" : "tab"}
                aria-current={t.key === tab ? "page" : undefined}
                onClick={() => setTab(t.key)}
              >
                {t.key === tab && <motion.span className="tab-pill" layoutId="tab-pill" transition={SPRING} />}
                <span className="tab-label">{t.label}</span>
              </button>
            ))}
          </nav>

          <main className="workspace">
            <div className="column" key={tab}>
              <Page />
            </div>
            <aside>
              <Feed />
            </aside>
          </main>
        </section>

        <footer>
          <span className="brand">
            <img src="/favicon.svg" alt="" width="22" height="22" />
            Surety
          </span>
          <span>The contract has no owner and no fee.</span>
          <a href="https://github.com/gsbelman/surety" target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
        </footer>
      </div>
      <TxToast />
    </>
  );
}
