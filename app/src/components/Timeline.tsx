import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EASE, SOFT_SPRING } from "./motion";

export type StepState = "todo" | "active" | "late" | "done" | "skipped" | "released" | "refunded";
export type Step = { label: string; state: StepState };

/**
 * Maps a payment to its steps. A payment with a proof hash reached delivery, so a refund with no
 * proof means that the seller declined or stayed silent.
 */
export function paymentSteps(status: number, delivered: boolean, late: boolean): Step[] {
  const paid: Step = { label: "Paid", state: "done" };
  const proof: Step = { label: "Delivered", state: "done" };

  switch (status) {
    case 1:
      return [paid, { label: "Delivery", state: late ? "late" : "active" }, { label: "Settlement", state: "todo" }];
    case 2:
      return [paid, proof, { label: "Settlement", state: late ? "late" : "active" }];
    case 3:
      return [
        paid,
        proof,
        { label: "With arbiter", state: late ? "late" : "active" },
        { label: "Settlement", state: "todo" },
      ];
    case 4:
      return [paid, proof, { label: "Released", state: "released" }];
    default:
      return [
        paid,
        delivered ? proof : { label: "Not delivered", state: "skipped" },
        { label: "Refunded", state: "refunded" },
      ];
  }
}

const GLYPH = {
  done: "M3.5 9.4l3.4 3.4L14.5 5.2",
  released: "M3.5 9.4l3.4 3.4L14.5 5.2",
  refunded: "M7.5 4.2L3.8 7.9l3.7 3.7M4 7.9h6.2a3.8 3.8 0 010 7.6H8",
  skipped: "M5 5l8 8M13 5l-8 8",
};

function StepNode({ state }: { state: StepState }) {
  const reduced = useReducedMotion();

  if (state === "todo") return null;
  if (state === "active" || state === "late") {
    return (
      <>
        {!reduced && (
          <motion.span
            className="step-pulse"
            animate={{ scale: [1, 1.7], opacity: [0.28, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <span className="step-core" />
      </>
    );
  }
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <motion.path
        d={GLYPH[state]}
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, delay: 0.15, ease: EASE }}
      />
    </svg>
  );
}

/** Draws the steps of a payment. A change of state moves the track and redraws the node. */
export function Timeline({ steps }: { steps: Step[] }) {
  const count = steps.length;
  const reached = steps.reduce((last, step, index) => (step.state === "todo" ? last : index), 0);
  const outcome = steps[count - 1].state;
  const edge = `${100 / (count * 2)}%`;
  const summary = steps
    .filter((step) => step.state !== "todo")
    .map((step) => step.label)
    .join(", ");

  return (
    <div className="timeline">
      <span className="track" style={{ left: edge, right: edge }} aria-hidden="true">
        <motion.span
          className={`track-fill ${outcome}`}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: reached / (count - 1) }}
          transition={SOFT_SPRING}
        />
      </span>
      <ol style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }} aria-label={`Payment progress: ${summary}`}>
        {steps.map((step, index) => (
          <li key={index} className={`step ${step.state}`}>
            <motion.span
              className="step-node"
              initial={false}
              animate={{ scale: step.state === "todo" ? 0.92 : 1 }}
              transition={SOFT_SPRING}
            >
              <motion.span
                key={step.state}
                className="step-glyph"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25 }}
              >
                <StepNode state={step.state} />
              </motion.span>
            </motion.span>
            <AnimatePresence initial={false} mode="wait">
              <motion.span
                key={step.label}
                className="step-label"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
              >
                {step.label}
              </motion.span>
            </AnimatePresence>
          </li>
        ))}
      </ol>
    </div>
  );
}
