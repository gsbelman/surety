import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { isAddress, type Address } from "viem";
import { erc20Abi, suretyAbi } from "../contract/abi";
import { USDC_ADDRESS } from "../contract/networks";
import { PaymentList } from "../components/PaymentList";
import { SellerCard } from "../components/SellerCard";
import { Button, Card, Field, Notice, Skeletons, WalletGate } from "../components/ui";
import { hashText, isAmount, parseUsdc, usdc } from "../lib/format";
import { useSeller } from "../lib/hooks";
import { useWallet } from "../lib/wallet";

const BPS = 10_000n;

/** Approves when needed, then pays. Each step is one wallet prompt. */
export function usePay() {
  const { network, client, account, write } = useWallet();

  return async (seller: Address, amount: bigint, window: number, jobRef: `0x${string}`) => {
    const escrow = network.address!;
    const allowance = await client.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account!, escrow],
    });
    if (allowance < amount) {
      const approved = await write("Approve USDC", {
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "approve",
        args: [escrow, amount],
      });
      if (!approved) return false;
    }
    return write("Pay through Surety", {
      address: escrow,
      abi: suretyAbi,
      functionName: "pay",
      args: [seller, amount, window, jobRef],
    });
  };
}

export function BuyerPage() {
  const { network } = useWallet();
  const [seller, setSeller] = useState("");
  const [amount, setAmount] = useState("0.05");
  const [windowMinutes, setWindowMinutes] = useState("5");
  const [job, setJob] = useState("");
  const pay = usePay();

  const address = isAddress(seller) ? seller : null;
  const { data: view, failed } = useSeller(address);
  const demo = network.sellers;
  const penaltyBps = view?.stats.registered ? view.stats.penaltyBps : null;
  const refund = penaltyBps !== null && isAmount(amount) ? parseUsdc(amount) : null;

  return (
    <>
      <Card title="Check a seller" hint="Anyone can read this record. Agents read it before they pay.">
        <Field
          label="Seller address"
          value={seller}
          onChange={(e) => setSeller(e.target.value.trim())}
          placeholder="0x…"
          spellCheck={false}
          warn
          note={seller && !address ? "Enter a full 0x address." : undefined}
        />
        {demo && (
          <div className="chips">
            <button className="chip" onClick={() => setSeller(demo.honest)}>
              Demo: honest seller
            </button>
            <button className="chip bad" onClick={() => setSeller(demo.bad)}>
              Demo: bad seller
            </button>
          </div>
        )}
        {address && network.address && !view && !failed && (
          <div className="seller">
            <Skeletons count={1} height={150} label="Reading the seller record" />
          </div>
        )}
        {address && !view && failed && (
          <div className="seller">
            <Notice tone="error">The RPC did not respond. Retrying.</Notice>
          </div>
        )}
        {address && view && <SellerCard address={address} view={view} />}
      </Card>

      <Card
        title="Pay with a guarantee"
        hint="If the seller stays silent past the deadline, you get a full refund plus the penalty from the bond."
      >
        <div className="row">
          <Field label="Amount (USDC)" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          <Field
            label="Delivery window (minutes)"
            value={windowMinutes}
            onChange={(e) => setWindowMinutes(e.target.value)}
            inputMode="numeric"
          />
        </div>
        <Field
          label="Job reference"
          value={job}
          onChange={(e) => setJob(e.target.value)}
          placeholder="What you are paying for"
          note="Surety stores only the hash of this text."
        />
        {refund !== null && penaltyBps !== null && (
          <p className="guarantee">
            <ShieldCheck size={17} aria-hidden="true" />
            <span>
              If this seller stays silent, you get {usdc(refund)} USDC back
              {penaltyBps > 0 && ` plus ${usdc((refund * BigInt(penaltyBps)) / BPS)} USDC from the bond`}.
            </span>
          </p>
        )}
        <WalletGate>
          <Button
            tone="primary"
            className="stretch"
            disabled={!address || !view?.stats.registered || !isAmount(amount) || !Number(windowMinutes)}
            onClick={() => pay(address!, parseUsdc(amount), Math.round(Number(windowMinutes) * 60), hashText(job))}
          >
            Pay through Surety
          </Button>
        </WalletGate>
      </Card>

      <PaymentList title="My payments" proofLabel="Response or receipt" />
    </>
  );
}
