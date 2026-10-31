import { useState } from "react";
import { suretyAbi } from "../contract/abi";
import { countdown, hashText, shorten, usdc } from "../lib/format";
import { useNow, usePayments, type Payment } from "../lib/hooks";
import { useWallet, type Call } from "../lib/wallet";
import { Card } from "./ui";

const STATUS = ["None", "Awaiting delivery", "Delivered", "With arbiter", "Released", "Refunded"];

function PaymentRow({ payment, proofLabel }: { payment: Payment; proofLabel: string }) {
  const { account, network, write } = useWallet();
  const now = useNow();
  const [proof, setProof] = useState("");

  const { id, status, amount, penalty } = payment;
  const isBuyer = payment.buyer === account;
  const isSeller = payment.seller === account;
  const deadline = Number(status === 1 ? payment.deliverBy : payment.decideBy);
  const open = status >= 1 && status <= 3;
  const remaining = deadline - now;
  const expired = open && remaining < 0;

  const contract = { address: network.address!, abi: suretyAbi };
  const act = (label: string, functionName: string, args: readonly unknown[]) =>
    write(label, { ...contract, functionName, args } as Call);

  return (
    <li className="payment">
      <div className="payment-head">
        <span className="id">#{id.toString()}</span>
        <strong>{usdc(amount)} USDC</strong>
        <span className={`badge s${status}`}>{STATUS[status]}</span>
        {open && (
          <span className={expired ? "timer expired" : "timer"}>
            {expired ? "deadline passed" : countdown(remaining)}
          </span>
        )}
      </div>
      <div className="payment-meta">
        {isBuyer ? "to" : "from"} <code>{shorten(isBuyer ? payment.seller : payment.buyer)}</code>
        {open && penalty > 0n && <> · bond covers {usdc(penalty)}</>}
      </div>

      <div className="actions">
        {isSeller && status === 1 && !expired && (
          <>
            <input
              value={proof}
              onChange={(e) => setProof(e.target.value)}
              placeholder={proofLabel}
              aria-label={proofLabel}
            />
            <button
              className="primary"
              disabled={!proof}
              onClick={() => act(`Deliver payment ${id}`, "deliver", [id, hashText(proof)])}
            >
              Deliver
            </button>
            <button onClick={() => act(`Decline payment ${id}`, "decline", [id])}>Decline</button>
          </>
        )}
        {isBuyer && status === 2 && !expired && (
          <>
            <button className="primary" onClick={() => act(`Release payment ${id}`, "release", [id])}>
              Accept and release
            </button>
            <button className="danger" onClick={() => act(`Object to payment ${id}`, "object", [id])}>
              Object
            </button>
          </>
        )}
        {expired && (
          <button className="primary" onClick={() => act(`Settle payment ${id}`, "settle", [id])}>
            {status === 2 ? "Settle: pay the seller" : "Settle: refund the buyer"}
          </button>
        )}
      </div>
    </li>
  );
}

export function PaymentList({ title, proofLabel }: { title: string; proofLabel: string }) {
  const { account } = useWallet();
  const { data, failed } = usePayments();
  if (!account) return null;

  return (
    <Card title={title}>
      {failed && !data && <p className="notice">The RPC did not respond. Retrying.</p>}
      {data?.length === 0 && <p className="hint">No payments yet.</p>}
      <ul className="payments">
        {data?.map((payment) => (
          <PaymentRow key={payment.id.toString()} payment={payment} proofLabel={proofLabel} />
        ))}
      </ul>
    </Card>
  );
}
