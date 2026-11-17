import { useLayoutEffect, useRef, useState } from "react";

/** Measure a container, so charts draw at their real pixel size and their
 *  text stays crisp instead of scaling with a fixed viewBox. */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}

export const COLOR = {
  s1: "#3987E5",
  s2: "#D95926",
  s3: "#199E70",
  amber: "#FBBF24",
  ink: "#E8ECF5",
  soft: "#A3ADC2",
  muted: "#6B7693",
  line: "rgba(148,163,205,0.14)",
  good: "#2FB67C",
  bad: "#E5484D",
};

/** One colour per model, fixed everywhere on the site. */
export const MODEL_COLOR: Record<string, string> = {
  majority_baseline: COLOR.muted,
  logistic_regression: COLOR.s1,
  random_forest: COLOR.s2,
  gradient_boosting: COLOR.s3,
};

export const MODEL_LABEL: Record<string, string> = {
  majority_baseline: "Baseline",
  logistic_regression: "Logistic regression",
  random_forest: "Random forest",
  gradient_boosting: "Gradient boosting",
};

export const FEATURE_LABEL: Record<string, string> = {
  AIRLINE: "Airline",
  ORIGIN_AIRPORT: "Origin airport",
  DESTINATION_AIRPORT: "Destination",
  SCHED_DEP_HOUR: "Departure time",
  SCHED_ARR_HOUR: "Arrival time",
  DISTANCE: "Distance",
  SCHEDULED_TIME: "Scheduled duration",
  MONTH: "Month",
  DAY: "Day of month",
  DAY_OF_WEEK: "Weekday",
  IS_WEEKEND: "Weekend flag",
};

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
