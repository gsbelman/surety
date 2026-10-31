import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Clock, Inbox } from "lucide-react";
import { formatUnits, zeroHash } from "viem";
import { suretyAbi } from "../contract/abi";
import { USDC_DECIMALS } from "../contract/networks";
import { countdown, hashText, shorten, usdc } from "../lib/format";
import { useNow, usePayments, type Payment } from "../lib/hooks";
import { useWallet, type Call } from "../lib/wallet";
import { CountUp, EASE } from "./motion";
import { paymentSteps, Timeline } from "./Timeline";
import { Button, Card, Empty, Notice, Skeletons } from "./ui";

const STATUS = ["None", "Awaiting delivery", "Delivered", "With arbiter", "Released", "Refunded"];

/** A deadline passes when a block is later than it. One more second absorbs block jitter. */
const SETTLE_MARGIN = 1;

function PaymentRow({
  payment,
  proofLabel,
  clockOffset,
}: {
  payment: Payment;
  proofLabel: string;
  clockOffset: number;
}) {
  const { account, network, write } = useWallet();
  const now = useNow() + clockOffset;
  const [proof, setProof] = useState("");

  const { id, status, amount, penalty } = payment;
  const isBuyer = payment.buyer === account;
  const isSeller = payment.seller === account;
  const deadline = Number(status === 1 ? payment.deliverBy : payment.decideBy);
  const open = status >= 1 && status <= 3;
  const remaining = deadline - now;
  const expired = open && remaining < -SETTLE_MARGIN;

  const contract = { address: network.address!, abi: suretyAbi };
  const act = (label: string, functionName: string, args: readonly unknown[]) =>
    write(label, { ...contract, functionName, args } as Call);

  return (
    <motion.li
      className="payment"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      whileHover={{ y: -2 }}
    >
      <div className="payment-head">
        <span className="id">#{id.toString()}</span>
        <strong className="amount">
          <CountUp value={Number(formatUnits(amount, USDC_DECIMALS))} text={usdc(amount)} />
          <small>USDC</small>
        </strong>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={status}
            className={`badge s${status}`}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.2 }}
          >
            {STATUS[status]}
          </motion.span>
        </AnimatePresence>
        {open && (
          <span className={expired ? "timer expired" : "timer"}>
            <Clock size={14} aria-hidden="true" />
            {expired ? "deadline passed" : countdown(Math.max(remaining, 0))}
          </span>
        )}
      </div>

      <Timeline steps={paymentSteps(status, payment.proofHash !== zeroHash, expired)} />

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
            <Button
              tone="primary"
              small
              disabled={!proof}
              onClick={() => act(`Deliver payment ${id}`, "deliver", [id, hashText(proof)])}
            >
              Deliver
            </Button>
            <Button small onClick={() => act(`Decline payment ${id}`, "decline", [id])}>
              Decline
            </Button>
          </>
        )}
        {isBuyer && status === 2 && !expired && (
          <>
            <Button tone="primary" small onClick={() => act(`Release payment ${id}`, "release", [id])}>
              Accept and release
            </Button>
            <Button tone="danger" small onClick={() => act(`Object to payment ${id}`, "object", [id])}>
              Object
            </Button>
          </>
        )}
        {expired && (
          <Button tone="primary" small onClick={() => act(`Settle payment ${id}`, "settle", [id])}>
            {status === 2 ? "Settle: pay the seller" : "Settle: refund the buyer"}
          </Button>
        )}
      </div>
    </motion.li>
  );
}

export function PaymentList({ title, proofLabel }: { title: string; proofLabel: string }) {
  const { account } = useWallet();
  const { data, failed } = usePayments();
  if (!account) return null;

  return (
    <Card title={title}>
      {failed && !data && <Notice tone="error">The RPC did not respond. Retrying.</Notice>}
      {failed && data && <Notice tone="warn">The RPC did not respond. This list can be out of date.</Notice>}
      {!data && !failed && <Skeletons count={2} height={132} label="Loading payments" />}
      {data?.payments.length === 0 && (
        <Empty icon={Inbox} title="No payments yet">
          A payment appears here after this wallet pays or gets paid.
        </Empty>
      )}
      <ul className="payments">
        {data?.payments.map((payment) => (
          <PaymentRow
            key={payment.id.toString()}
            payment={payment}
            proofLabel={proofLabel}
            clockOffset={data.clockOffset}
          />
        ))}
      </ul>
    </Card>
  );
}
