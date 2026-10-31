import { useState } from "react";
import { isAddress, type Address } from "viem";
import { erc20Abi, suretyAbi } from "../contract/abi";
import { USDC_ADDRESS } from "../contract/networks";
import { PaymentList } from "../components/PaymentList";
import { SellerCard } from "../components/SellerCard";
import { Card, Field, WalletGate } from "../components/ui";
import { hashText, isAmount, parseUsdc } from "../lib/format";
import { useSeller } from "../lib/hooks";
import { useWallet } from "../lib/wallet";

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
  const { data: view } = useSeller(address);
  const demo = network.sellers;

  return (
    <>
      <Card title="Check a seller" hint="Anyone can read this record. Agents read it before they pay.">
        <Field
          label="Seller address"
          value={seller}
          onChange={(e) => setSeller(e.target.value.trim())}
          placeholder="0x…"
          spellCheck={false}
        />
        {demo && (
          <div className="chips">
            <button onClick={() => setSeller(demo.honest)}>Demo: honest seller</button>
            <button onClick={() => setSeller(demo.bad)}>Demo: bad seller</button>
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
        <WalletGate>
          <button
            className="primary"
            disabled={!address || !view?.stats.registered || !isAmount(amount) || !Number(windowMinutes)}
            onClick={() => pay(address!, parseUsdc(amount), Math.round(Number(windowMinutes) * 60), hashText(job))}
          >
            Pay through Surety
          </button>
        </WalletGate>
      </Card>

      <PaymentList title="My payments" proofLabel="Response or receipt" />
    </>
  );
}
