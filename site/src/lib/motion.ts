import { useRef } from "react";
import type { Variants } from "framer-motion";

/** The house easing: fast out of the gate, long gentle settle. */
export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Children rise into place one after another. */
export const stagger = (step = 0.07, delay = 0.1): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
});

export const rise: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(4px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: EASE },
  },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.8, ease: EASE } },
};

/** A number shown at its final value. (It used to count up from zero; the
 *  signature is kept so callers need no change.) */
export function useCountUp(target: number, _duration = 0, _delay = 0) {
  const ref = useRef<HTMLSpanElement>(null);
  return { ref, value: target };
}
