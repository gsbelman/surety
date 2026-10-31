import { useLayoutEffect, useRef, type ReactNode } from "react";
import { animate, motion, useReducedMotion, type Variants } from "motion/react";

/** The house curve: a fast start and a long, soft landing. */
export const EASE = [0.22, 1, 0.36, 1] as const;
export const SPRING = { type: "spring", stiffness: 420, damping: 30 } as const;
export const SOFT_SPRING = { type: "spring", stiffness: 90, damping: 18 } as const;

export const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

/** Plays the entrance of a section once, when the section scrolls into view. */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={rise}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
    >
      {children}
    </motion.div>
  );
}

/** Counts from the last shown value to a new one. At rest, it shows the exact text. */
export function CountUp({ value, text }: { value: number; text: string }) {
  const node = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  const reduced = useReducedMotion();
  const decimals = text.match(/\.(\d+)/)?.[1].length ?? 0;
  const suffix = text.replace(/[\d.,]/g, "");

  useLayoutEffect(() => {
    const element = node.current!;
    if (reduced || shown.current === value) {
      shown.current = value;
      element.textContent = text;
      return;
    }
    const render = (current: number) =>
      current.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
    element.textContent = render(shown.current);
    const controls = animate(shown.current, value, {
      duration: 0.9,
      ease: EASE,
      onUpdate: (current) => {
        shown.current = current;
        element.textContent = render(current);
      },
      onComplete: () => {
        shown.current = value;
        element.textContent = text;
      },
    });
    return () => controls.stop();
  }, [value, text, reduced, decimals, suffix]);

  return <span ref={node} />;
}
