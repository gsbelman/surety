import { motion } from "motion/react";
import { FileCheck2, Landmark, Lock, Sparkles, type LucideIcon } from "lucide-react";
import { Reveal, rise, SPRING, stagger } from "./motion";

const STEPS: { title: string; text: string; icon: LucideIcon; tint: string }[] = [
  {
    title: "The seller posts a bond",
    text: "The seller locks USDC in the contract. The bond backs each promise.",
    icon: Lock,
    tint: "lavender",
  },
  {
    title: "The buyer pays into escrow",
    text: "The USDC goes to the contract, not to the seller. The delivery deadline starts.",
    icon: Landmark,
    tint: "sky",
  },
  {
    title: "The seller delivers proof",
    text: "The seller posts a hash of the work before the deadline. The objection window starts.",
    icon: FileCheck2,
    tint: "mint",
  },
  {
    title: "The payment settles itself",
    text: "After a deadline, anyone can settle the payment. No one can freeze the funds.",
    icon: Sparkles,
    tint: "peach",
  },
];

const OUTCOMES = [
  {
    title: "The seller delivers",
    text: "The buyer accepts, or the objection window ends.",
    ledger: [
      ["Seller gets", "10.00"],
      ["Bond", "unlocked"],
    ],
  },
  {
    title: "The seller stays silent",
    text: "The deadline passes with no proof. Anyone can settle.",
    ledger: [
      ["Buyer gets", "11.00"],
      ["Bond pays", "1.00"],
    ],
  },
  {
    title: "The buyer objects",
    text: "With no arbiter, the buyer gets the refund and the penalty. With an arbiter, the arbiter decides.",
    ledger: [
      ["Buyer gets", "11.00"],
      ["Bond pays", "1.00"],
    ],
  },
  {
    title: "The seller declines",
    text: "The seller refuses the job before the deadline.",
    ledger: [
      ["Buyer gets", "10.00"],
      ["Bond pays", "0.00"],
    ],
  },
];

export function HowItWorks() {
  return (
    <section className="section" id="how">
      <Reveal className="section-head">
        <span className="eyebrow">How it works</span>
        <h2>Four steps. The contract settles them.</h2>
        <p>One contract covers each payment, for agents and for people.</p>
      </Reveal>

      <motion.ol
        className="steps"
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      >
        {STEPS.map(({ title, text, icon: Icon, tint }, index) => (
          <motion.li
            key={title}
            className={`step-card ${tint}`}
            variants={rise}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.98 }}
            transition={SPRING}
          >
            <div className="step-top">
              <span className="step-icon">
                <Icon size={20} aria-hidden="true" />
              </span>
              <span className="step-number">{index + 1}</span>
            </div>
            <h3>{title}</h3>
            <p>{text}</p>
          </motion.li>
        ))}
      </motion.ol>

      <div className="outcomes">
        <Reveal className="outcomes-head">
          <h3>Every payment ends one of four ways</h3>
          <p>Example: 10 USDC with a 10% penalty.</p>
        </Reveal>
        <motion.div
          className="outcome-grid"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "0px 0px -8% 0px" }}
        >
          {OUTCOMES.map(({ title, text, ledger }) => (
            <motion.article
              key={title}
              className="outcome"
              variants={rise}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
              transition={SPRING}
            >
              <div>
                <h4>{title}</h4>
                <p>{text}</p>
              </div>
              <dl className="ledger">
                {ledger.map(([term, value]) => (
                  <div key={term}>
                    <dt>{term}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
