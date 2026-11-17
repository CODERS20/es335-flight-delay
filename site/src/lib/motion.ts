import { animate, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
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

/** Screens enter from the side you are travelling towards. */
export const page: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 60, filter: "blur(6px)" }),
  center: {
    opacity: 1,
    x: 0,
    filter: "blur(0px)",
    transition: { duration: 0.65, ease: EASE },
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir * -40,
    filter: "blur(6px)",
    transition: { duration: 0.35, ease: EASE },
  }),
};

/** Count a number up from zero when it first appears on screen. */
export function useCountUp(target: number, duration = 1.4, delay = 0.2) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setValue(target);
      return;
    }
    const controls = animate(0, target, {
      duration,
      delay,
      ease: EASE,
      onUpdate: setValue,
    });
    return () => controls.stop();
  }, [inView, target, duration, delay, reduced]);

  return { ref, value };
}
