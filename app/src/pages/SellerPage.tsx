import { useState } from "react";
import { isAddress, zeroAddress } from "viem";
import { erc20Abi, suretyAbi } from "../contract/abi";
import { USDC_ADDRESS } from "../contract/networks";
import { PaymentList } from "../components/PaymentList";
import { SellerCard } from "../components/SellerCard";
import { Button, Card, Field, Notice, Skeletons, WalletGate } from "../components/ui";
import { isAmount, parseUsdc } from "../lib/format";
import { useSeller } from "../lib/hooks";
import { useWallet } from "../lib/wallet";

function RegisterForm() {
  const { network, write } = useWallet();
  const [penalty, setPenalty] = useState("10");
  const [minDelivery, setMinDelivery] = useState("60");
  const [objection, setObjection] = useState("300");
  const [arbiter, setArbiter] = useState("");

  return (
    <Card title="Register as a seller" hint="Terms are permanent for this address, so buyers can rely on them.">
      <div className="row">
        <Field label="Penalty (%)" value={penalty} onChange={(e) => setPenalty(e.target.value)} inputMode="decimal" />
        <Field
          label="Minimum delivery (s)"
          value={minDelivery}
          onChange={(e) => setMinDelivery(e.target.value)}
          inputMode="numeric"
        />
        <Field
          label="Objection window (s)"
          value={objection}
          onChange={(e) => setObjection(e.target.value)}
          inputMode="numeric"
        />
      </div>
      <Field
        label="Arbiter (optional)"
        value={arbiter}
        onChange={(e) => setArbiter(e.target.value.trim())}
        placeholder="0x…"
        note="With no arbiter, an objection refunds the buyer and takes the penalty from your bond."
        spellCheck={false}
      />
      <Button
        tone="primary"
        className="stretch"
        disabled={arbiter !== "" && !isAddress(arbiter)}
        onClick={() =>
          write("Register", {
            address: network.address!,
            abi: suretyAbi,
            functionName: "register",
            args: [
              Math.round(Number(penalty) * 100),
              Number(minDelivery),
              Number(objection),
              arbiter === "" ? zeroAddress : arbiter,
            ],
          })
        }
      >
        Register
      </Button>
    </Card>
  );
}

function BondForm({ free }: { free: bigint }) {
  const { network, client, account, write } = useWallet();
  const [amount, setAmount] = useState("1");
  const escrow = network.address!;

  const add = async () => {
    const value = parseUsdc(amount);
    const allowance = await client.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account!, escrow],
    });
    if (allowance < value) {
      const approved = await write("Approve USDC", {
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "approve",
        args: [escrow, value],
      });
      if (!approved) return;
    }
    await write("Post bond", { address: escrow, abi: suretyAbi, functionName: "addBond", args: [value] });
  };

  const withdraw = () =>
    write("Withdraw bond", {
      address: escrow,
      abi: suretyAbi,
      functionName: "withdrawBond",
      args: [parseUsdc(amount)],
    });

  return (
    <Card title="Bond" hint="Open payments lock part of the bond. You can withdraw the rest at any time.">
      <Field label="Amount (USDC)" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      <div className="actions">
        <Button tone="primary" disabled={!isAmount(amount)} onClick={add}>
          Post bond
        </Button>
        <Button disabled={!isAmount(amount) || free === 0n} onClick={withdraw}>
          Withdraw
        </Button>
      </div>
    </Card>
  );
}

export function SellerPage() {
  const { account, network } = useWallet();
  const { data: view, failed } = useSeller(account);

  return (
    <>
      <WalletGate>
        {!view && failed && <Notice tone="error">The RPC did not respond. Retrying.</Notice>}
        {!view && !failed && <Skeletons count={2} height={150} label="Reading your seller record" />}
        {view && !view.stats.registered && <RegisterForm />}
        {view?.stats.registered && (
          <>
            <Card title="My reliability score">
              <SellerCard address={account!} view={view} />
            </Card>
            <BondForm free={view.freeBond} />
          </>
        )}
      </WalletGate>
      {network.address && <PaymentList title="Incoming payments" proofLabel="Response or receipt" />}
    </>
  );
}
