import { useState } from "react";
import { isAddress, zeroAddress } from "viem";
import { suretyAbi } from "../contract/abi";
import { PaymentList } from "../components/PaymentList";
import { Card, Field, WalletGate } from "../components/ui";
import { hashText, isAmount, parseUsdc } from "../lib/format";
import { useSeller } from "../lib/hooks";
import { useWallet } from "../lib/wallet";
import { usePay } from "./BuyerPage";

const HOUR = 3_600;

function OpenInbox() {
  const { account, network, write } = useWallet();
  const { data: view } = useSeller(account);

  if (!view) return null;
  if (view.stats.registered) {
    return <p className="hint">Your inbox is open. Share your address, then reply below before each deadline.</p>;
  }
  return (
    <button
      className="primary"
      onClick={() =>
        write("Open my inbox", {
          address: network.address!,
          abi: suretyAbi,
          functionName: "register",
          args: [0, 60, HOUR, zeroAddress],
        })
      }
    >
      Open my inbox
    </button>
  );
}

export function ReplyPage() {
  const [recipient, setRecipient] = useState("");
  const [question, setQuestion] = useState("");
  const [amount, setAmount] = useState("1");
  const [hours, setHours] = useState("24");
  const pay = usePay();

  const address = isAddress(recipient) ? recipient : null;
  const { data: view } = useSeller(address);
  const unknownRecipient = Boolean(address && view && !view.stats.registered);

  return (
    <>
      <Card
        title="Pay for a reply"
        hint="Pay someone to answer you. If the answer does not come in time, the payment refunds itself."
      >
        <Field
          label="Recipient address"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value.trim())}
          placeholder="0x…"
          spellCheck={false}
          note={unknownRecipient ? "This address has not opened an inbox yet." : undefined}
        />
        <Field
          label="Your message"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Send the message in your usual channel too."
          note="Surety stores only the hash of this text."
        />
        <div className="row">
          <Field label="Amount (USDC)" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          <Field label="Reply within (hours)" value={hours} onChange={(e) => setHours(e.target.value)} inputMode="decimal" />
        </div>
        <WalletGate>
          <button
            className="primary"
            disabled={!address || unknownRecipient || !question || !isAmount(amount) || !Number(hours)}
            onClick={() =>
              pay(address!, parseUsdc(amount), Math.round(Number(hours) * HOUR), hashText(question))
            }
          >
            Pay for a reply
          </button>
        </WalletGate>
      </Card>

      <Card title="Get paid to reply" hint="Open an inbox with no bond. Your reply must arrive before the deadline.">
        <WalletGate>
          <OpenInbox />
        </WalletGate>
      </Card>

      <PaymentList title="Messages and replies" proofLabel="Your reply" />
    </>
  );
}
