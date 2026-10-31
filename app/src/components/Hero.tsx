import { motion } from "motion/react";
import { ArrowDown, Check, ShieldCheck } from "lucide-react";
import { useWallet } from "../lib/wallet";
import { FlowDiagram } from "./FlowDiagram";
import { EASE, rise, SPRING, stagger } from "./motion";
import { ExplorerLink } from "./ui";

const FACTS = ["No owner", "No fee", "Terms never change"];
const HEADLINE = ["for", "work,", "not", "for", "promises."];

export function Hero() {
  const { network } = useWallet();

  return (
    <section className="hero">
      <motion.div className="hero-copy" variants={stagger} initial="hidden" animate="show">
        <motion.span className="pill" variants={rise}>
          <ShieldCheck size={15} aria-hidden="true" />
          Bonded USDC payments on Arc
        </motion.span>

        <motion.h1 variants={stagger} aria-label="Pay for work, not for promises.">
          <motion.span className="word" variants={rise} aria-hidden="true">
            Pay
          </motion.span>{" "}
          {HEADLINE.map((word, index) => (
            <span key={index} aria-hidden="true">
              <motion.span className="word" variants={rise}>
                {word === "work," ? (
                  <span className="mark">
                    <motion.span
                      className="mark-fill"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.8, delay: 0.7, ease: EASE }}
                    />
                    {word}
                  </span>
                ) : (
                  word
                )}
              </motion.span>{" "}
            </span>
          ))}
        </motion.h1>

        <motion.p className="lede" variants={rise}>
          Surety holds USDC until the seller delivers. If the seller stays silent, the buyer gets a refund plus a
          penalty from the seller's bond.
        </motion.p>

        <motion.div className="hero-actions" variants={rise}>
          <motion.a className="button primary" href="#app" whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} transition={SPRING}>
            Try a payment
          </motion.a>
          <motion.a className="button" href="#how" whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} transition={SPRING}>
            How it works
            <ArrowDown size={16} aria-hidden="true" />
          </motion.a>
        </motion.div>

        <motion.ul className="facts" variants={rise}>
          {FACTS.map((fact) => (
            <li key={fact}>
              <Check size={16} strokeWidth={3} aria-hidden="true" />
              {fact}
            </li>
          ))}
        </motion.ul>

        {network.address && (
          <motion.p className="contract" variants={rise}>
            Contract <ExplorerLink kind="address" value={network.address} /> on {network.label}
          </motion.p>
        )}
      </motion.div>

      <FlowDiagram />
    </section>
  );
}
