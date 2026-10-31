import { useState } from "react";
import { suretyAbi } from "./contract/abi";
import { Feed } from "./components/Feed";
import { ExplorerLink } from "./components/ui";
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

function Header() {
  const { network, selectNetwork, account, connect, hasWallet } = useWallet();
  const { data } = useAccountData();

  return (
    <header>
      <div className="brand">
        <img src="/favicon.svg" alt="" width="28" height="28" />
        <span>Surety</span>
      </div>
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
            {data && <strong>{whole(data.balance)} USDC</strong>}
            <code>{shorten(account)}</code>
          </span>
        ) : (
          <button className="primary" disabled={!hasWallet} onClick={connect}>
            {hasWallet ? "Connect wallet" : "No wallet found"}
          </button>
        )}
      </div>
    </header>
  );
}

function TxBar() {
  const { tx, clearTx } = useWallet();
  if (!tx) return null;

  const text = {
    wallet: "Confirm in your wallet",
    chain: "Waiting for the chain",
    done: "Confirmed",
    error: "Failed",
  }[tx.phase];

  return (
    <div className={`txbar ${tx.phase}`} role="status">
      <span>
        <strong>{tx.label}.</strong> {text}
        {tx.detail && `: ${tx.detail}`}
      </span>
      {tx.hash && <ExplorerLink kind="tx" value={tx.hash} />}
      {(tx.phase === "done" || tx.phase === "error") && (
        <button className="link" onClick={clearTx}>
          Dismiss
        </button>
      )}
    </div>
  );
}

function ClaimBanner() {
  const { network, write } = useWallet();
  const { data } = useAccountData();
  if (!data || data.claimable === 0n || !network.address) return null;

  return (
    <div className="txbar">
      <span>You have {usdc(data.claimable)} USDC to claim.</span>
      <button
        className="primary"
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
      </button>
    </div>
  );
}

export function App() {
  const { network } = useWallet();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("buyer");
  const Page = TABS.find((t) => t.key === tab)!.page;

  return (
    <div className="shell">
      <Header />

      <div className="hero">
        <h1>Pay for work, not for promises.</h1>
        <p>
          Surety holds USDC until the seller delivers. If the seller stays silent, the payment refunds itself and the
          seller's bond pays a penalty. Agents and people use the same contract on Arc.
        </p>
        {network.address && (
          <p className="contract">
            Contract <ExplorerLink kind="address" value={network.address} /> on {network.label}
          </p>
        )}
      </div>

      <TxBar />
      <ClaimBanner />

      <nav aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.key} className={t.key === tab ? "active" : ""} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        <div className="column">
          <Page />
        </div>
        <aside>
          <Feed />
        </aside>
      </main>

      <footer>
        <a href="https://github.com/gsbelman/surety" target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
        <span>The contract has no owner and no fee.</span>
      </footer>
    </div>
  );
}
