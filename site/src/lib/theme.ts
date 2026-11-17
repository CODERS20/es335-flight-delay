/** Chart colours, read from the CSS custom properties so light and dark mode
 *  stay in one place. Series colours are assigned in a fixed order and never
 *  cycled: a series keeps its colour when other series are filtered out. */
export const SERIES = ["s1", "s2", "s3"] as const;

export const cssVar = (name: string) => `rgb(var(--${name}))`;

export const COLOR = {
  s1: cssVar("s1"),
  s2: cssVar("s2"),
  s3: cssVar("s3"),
  accent: cssVar("accent"),
  ink: cssVar("ink"),
  inkSoft: cssVar("ink-soft"),
  inkMuted: cssVar("ink-muted"),
  line: cssVar("line"),
  good: cssVar("good"),
  bad: cssVar("bad"),
  warn: cssVar("warn"),
  surface: cssVar("surface"),
};

/** One colour per model, fixed for the whole site. */
export const MODEL_COLOR: Record<string, string> = {
  majority_baseline: COLOR.inkMuted,
  logistic_regression: COLOR.s1,
  random_forest: COLOR.s2,
  gradient_boosting: COLOR.s3,
};

export const MODEL_LABEL: Record<string, string> = {
  majority_baseline: "Majority baseline",
  logistic_regression: "Logistic regression",
  random_forest: "Random forest",
  gradient_boosting: "Gradient boosting",
};

export const axisProps = {
  stroke: COLOR.line,
  tick: { fill: COLOR.inkMuted, fontSize: 12 },
  tickLine: false,
} as const;
