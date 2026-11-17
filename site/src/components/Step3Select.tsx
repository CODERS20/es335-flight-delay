import { useState } from "react";
import {
  CartesianGrid,
  ErrorBar,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { P3Selection } from "../lib/data";
import { COLOR, MODEL_COLOR, MODEL_LABEL, axisProps } from "../lib/theme";
import { int, n3, n4, pct, settingsLabel } from "../lib/format";
import { Callout, Card, ChartFrame, Part, Pending, Pill, StepSection, SubHead, Table, Tooltip } from "./ui";
import FoldDetail from "./FoldDetail";

const MODELS = ["logistic_regression", "random_forest", "gradient_boosting"] as const;

/** The folds, drawn so it is obvious that each one is fitted and judged on
 *  different days and that no day is in both halves. */
function FoldStrip({ p3 }: { p3: P3Selection }) {
  const maxRows = Math.max(...p3.folds.map((f) => f.fit_rows + f.validate_rows));
  return (
    <div className="space-y-2">
      {p3.folds.map((f) => {
        const total = f.fit_rows + f.validate_rows;
        const fitPct = (f.fit_rows / total) * 100;
        return (
          <div key={f.fold} className="flex items-center gap-3">
            <span className="w-12 flex-none text-[12px] font-medium text-ink-soft">
              Fold {f.fold}
            </span>
            <div
              className="flex h-7 flex-1 overflow-hidden rounded-md"
              style={{ width: `${(total / maxRows) * 100}%` }}
            >
              <div
                className="flex items-center justify-start px-2 text-[11px] font-medium text-white"
                style={{ width: `${fitPct}%`, background: COLOR.s1 }}
                title={`fitted on ${int(f.fit_rows)} flights across ${f.fit_days} days`}
              >
                {f.fit_days} days
              </div>
              <div
                className="flex items-center justify-start px-2 text-[11px] font-medium text-white"
                style={{ width: `${100 - fitPct}%`, background: COLOR.s2 }}
                title={`scored on ${int(f.validate_rows)} flights across ${f.validate_days} days`}
              >
                {f.validate_days}
              </div>
            </div>
            <span className="tabular w-20 flex-none text-right text-[12px] text-ink-muted">
              {pct(f.validate_base_rate)} late
            </span>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-4 pt-2 text-[12.5px] text-ink-soft">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-sm"
            style={{ background: COLOR.s1 }}
          />
          Fitted on these days
        </span>
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-sm"
            style={{ background: COLOR.s2 }}
          />
          Scored on these days
        </span>
      </div>
    </div>
  );
}

export default function Step3Select({
  p3,
  part = 1,
}: {
  p3: P3Selection | null;
  part?: number;
}) {
  const [metric, setMetric] = useState<"precision" | "recall" | "balance">("balance");

  return (
    <StepSection
      id={
        ["select", "select-folds", "select-candidates", "select-threshold"][part - 1]
      }
      step="3"
      title={
        [
          "Cross-validate: how the folds work",
          "Each cross-validation iteration",
          "Every candidate, compared",
          "Choosing the decision threshold",
        ][part - 1]
      }
      lede={
        [
          <>
            Every candidate is scored the same way:{" "}
            <strong>5-fold cross-validation grouped by calendar day</strong>. No
            day is ever in both halves of a fold, so a model cannot learn a
            day's disruption and then be rewarded for it. The test file is not
            opened by this step.
          </>,
          <>
            The same five folds, for the winning model. An average hides whether
            a model was steady or merely lucky once, so here is each iteration
            on its own: what it was scored on, how hard that slice was, and what
            it found.
          </>,
          <>
            All {p3?.n_candidates ?? ""} candidate settings, scored on identical
            folds. What matters is not only which one wins but by how much —
            and the answer is that they finish far closer to each other than any
            of them finishes to the baseline.
          </>,
          <>
            A probability is not yet a decision. The cut-off is chosen here, on
            predictions the model made for days it had never been fitted on, and
            then frozen before the test set is opened.
          </>,
        ][part - 1]
      }
    >
      {!p3 ? (
        <Pending what="data/p3_selection.json" />
      ) : (
        <>
          <Part n={1} part={part}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card>
              <SubHead
                hint={`${p3.n_candidates} candidate settings × ${p3.folds.length} folds = ${p3.n_fits} fits, on ${int(p3.rows_used)} sampled training flights.`}
              >
                The folds
              </SubHead>
              <FoldStrip p3={p3} />
            </Card>

            <div className="space-y-5">
              <Callout title="Why the folds are grouped by date">
                <p>{p3.why_grouped}</p>
              </Callout>
              <Callout tone="good" title="What the baseline fixes in place">
                <p>
                  A model with no information scores the base rate,{" "}
                  {pct(p3.base_rate, 2)}. That is the floor every candidate below has
                  to clear, and it is why the area under the precision–recall curve is
                  the headline rather than accuracy: always predicting “on time” is{" "}
                  {pct(1 - p3.base_rate, 1)} accurate and catches nothing.
                </p>
              </Callout>
            </div>
          </div>
          </Part>

          <Part n={2} part={part}>
          <FoldDetail p3={p3} />
          </Part>

          <Part n={3} part={part}>
          <Card>
            <ChartFrame
              title="Every candidate setting, scored"
              hint={
                <>
                  Each point is one set of settings; the bar through it is one standard
                  deviation across the five folds. Points are spread horizontally
                  within their model only to keep them from overlapping. The dashed line
                  is the baseline.
                </>
              }
              height={320}
              table={{
                head: ["Model", "Settings", "Mean curve area", "Std", "× base rate", "Fit time"],
                rows: p3.results
                  .filter((r) => r.model !== "majority_baseline")
                  .sort((a, b) => b.mean_score - a.mean_score)
                  .map((r) => [
                    MODEL_LABEL[r.model] ?? r.model,
                    <span className="font-mono text-[12px]">{settingsLabel(r.settings)}</span>,
                    n4(r.mean_score),
                    n3(r.std_score),
                    `${r.mean_ratio_to_base.toFixed(3)}×`,
                    `${r.fit_seconds.toFixed(0)}s`,
                  ]),
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 16, bottom: 28, left: -8 }}>
                  <CartesianGrid stroke={COLOR.line} />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[-0.5, 2.5]}
                    ticks={[0, 1, 2]}
                    tickFormatter={(v) => MODEL_LABEL[MODELS[v as 0 | 1 | 2]] ?? ""}
                    {...axisProps}
                    tick={{ fill: COLOR.inkSoft, fontSize: 12 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    {...axisProps}
                    tickFormatter={(v) => v.toFixed(3)}
                    domain={["auto", "auto"]}
                    width={74}
                    label={{
                      value: "Curve area",
                      angle: -90,
                      position: "insideLeft",
                      offset: 10,
                      style: { fill: COLOR.inkMuted, fontSize: 11.5, textAnchor: "middle" },
                    }}
                  />
                  <ZAxis range={[90, 90]} />
                  <ReferenceLine
                    y={p3.base_rate}
                    stroke={COLOR.inkMuted}
                    strokeDasharray="4 4"
                    label={{
                      value: "baseline",
                      position: "insideBottomRight",
                      style: { fill: COLOR.inkMuted, fontSize: 11 },
                    }}
                  />
                  <RTooltip
                    content={
                      <Tooltip
                        formatter={(v, name) =>
                          name === "Curve area" ? n4(Number(v)) : String(v)
                        }
                      />
                    }
                  />
                  {MODELS.map((m, mi) => {
                    const rows = p3.results.filter((r) => r.model === m);
                    return (
                      <Scatter
                        key={m}
                        name={MODEL_LABEL[m]}
                        fill={MODEL_COLOR[m]}
                        data={rows.map((r, i) => ({
                          x: mi + (i / Math.max(rows.length - 1, 1) - 0.5) * 0.52,
                          y: r.mean_score,
                          err: r.std_score,
                          label: settingsLabel(r.settings),
                        }))}
                      >
                        <ErrorBar
                          dataKey="err"
                          width={0}
                          strokeWidth={1.5}
                          stroke={MODEL_COLOR[m]}
                          opacity={0.55}
                        />
                      </Scatter>
                    );
                  })}
                  <Legend
                    verticalAlign="bottom"
                    height={24}
                    iconType="circle"
                    iconSize={8}
                    formatter={(v) => <span className="text-[12.5px] text-ink-soft">{v}</span>}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </ChartFrame>
          </Card>
          </Part>

          <Part n={3} part={part}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <Card>
              <SubHead hint="Ranked by mean score across the five folds. The winner is refitted on all of the training data in step 4.">
                Best of each model, and the overall winner
              </SubHead>
              <Table
                head={["Model", "Best settings", "Curve area", "× base"]}
                highlight={(i) => i === 0}
                rows={[...MODELS]
                  .map((m) => {
                    const rows = p3.results
                      .filter((r) => r.model === m)
                      .sort((a, b) => b.mean_score - a.mean_score);
                    return rows[0];
                  })
                  .filter(Boolean)
                  .sort((a, b) => b.mean_score - a.mean_score)
                  .map((r) => [
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-block h-2.5 w-2.5 flex-none rounded-full"
                        style={{ background: MODEL_COLOR[r.model] }}
                      />
                      {MODEL_LABEL[r.model]}
                      {r.model === p3.best.model &&
                      JSON.stringify(r.settings) === JSON.stringify(p3.best.settings) ? (
                        <Pill tone="accent">chosen</Pill>
                      ) : null}
                    </span>,
                    <span className="font-mono text-[12px]">{settingsLabel(r.settings)}</span>,
                    <span className="font-semibold">{n4(r.mean_score)}</span>,
                    `${r.mean_ratio_to_base.toFixed(3)}×`,
                  ])}
                caption={`Baseline: ${n4(p3.base_rate)}. Every candidate beats it, which is the first thing worth checking.`}
              />
            </Card>

            <Card>
              <SubHead hint={p3.threshold.chosen_on}>The decision threshold</SubHead>
              <div className="grid grid-cols-3 gap-3">
                {[
                  ["Threshold", n3(p3.threshold.value)],
                  ["Precision", n3(p3.threshold.precision)],
                  ["Recall", n3(p3.threshold.recall)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-line bg-surface-sunken p-3">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">
                      {k}
                    </p>
                    <p className="tabular mt-1 text-[22px] font-semibold leading-none">{v}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Callout title="A probability is not a decision">
                  <p>
                    To act on a score you need a cut-off, and the cut-off is a
                    trade-off with no free lunch: catch more real delays and you raise
                    more false alarms. Ours is the value giving the best balance of
                    precision and recall, chosen here — on the cross-validation
                    predictions — and then frozen before the test set was opened.
                  </p>
                </Callout>
              </div>
            </Card>
          </div>
          </Part>

          <Part n={4} part={part}>
          <Card>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <SubHead hint="Every cut-off from 0.02 to 0.98, measured on the cross-validation predictions. The marked line is the one we chose.">
                What each threshold would cost
              </SubHead>
              <div
                className="flex gap-1 rounded-lg border border-line p-1"
                role="group"
                aria-label="Metric to emphasise"
              >
                {(["balance", "precision", "recall"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMetric(m)}
                    aria-pressed={metric === m}
                    className={`rounded-md px-2.5 py-1 text-[12.5px] font-medium capitalize transition-colors ${
                      metric === m ? "text-accent" : "text-ink-muted hover:text-ink"
                    }`}
                    style={metric === m ? { background: "rgb(var(--accent-soft))" } : undefined}
                  >
                    {m === "balance" ? "P/R balance" : m}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={p3.threshold_sweep}
                  margin={{ top: 8, right: 16, bottom: 20, left: -12 }}
                >
                  <CartesianGrid stroke={COLOR.line} />
                  <XAxis
                    dataKey="t"
                    {...axisProps}
                    ticks={[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]}
                    tickFormatter={(v) => Number(v).toFixed(1)}
                    label={{
                      value: "Decision threshold",
                      position: "insideBottom",
                      offset: -12,
                      style: { fill: COLOR.inkMuted, fontSize: 12 },
                    }}
                  />
                  <YAxis {...axisProps} domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} />
                  <RTooltip
                    content={<Tooltip formatter={(v) => n3(Number(v))} />}
                    labelFormatter={(l) => `Threshold ${Number(l).toFixed(2)}`}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    height={26}
                    iconType="plainline"
                    formatter={(v) => <span className="text-[12.5px] text-ink-soft">{v}</span>}
                  />
                  <ReferenceLine
                    x={p3.threshold_sweep.reduce((best, s) =>
                      Math.abs(s.t - p3.threshold.value) < Math.abs(best.t - p3.threshold.value)
                        ? s
                        : best,
                    ).t}
                    stroke={COLOR.ink}
                    strokeDasharray="3 3"
                    label={{
                      value: "chosen",
                      position: "top",
                      style: { fill: COLOR.ink, fontSize: 11 },
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="precision"
                    name="Precision"
                    stroke={COLOR.s1}
                    strokeWidth={metric === "precision" ? 2.5 : 1.5}
                    strokeOpacity={metric === "precision" ? 1 : 0.45}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="recall"
                    name="Recall"
                    stroke={COLOR.s2}
                    strokeWidth={metric === "recall" ? 2.5 : 1.5}
                    strokeOpacity={metric === "recall" ? 1 : 0.45}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="balance"
                    name="P/R balance"
                    stroke={COLOR.s3}
                    strokeWidth={metric === "balance" ? 2.5 : 1.5}
                    strokeOpacity={metric === "balance" ? 1 : 0.45}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <details className="mt-3 rounded-lg border border-line bg-surface-sunken px-4">
              <summary className="cursor-pointer py-2.5 text-[13px] font-medium text-ink-soft hover:text-ink">
                Show these numbers as a table
              </summary>
              <div className="pb-4">
                <Table
                  head={["Threshold", "Precision", "Recall", "P/R balance", "Accuracy", "Flagged"]}
                  rows={p3.threshold_sweep
                    .filter((s) => Math.round(s.t * 100) % 10 === 0)
                    .map((s) => [
                      s.t.toFixed(2),
                      n3(s.precision),
                      n3(s.recall),
                      n3(s.balance),
                      n3(s.accuracy),
                      int(s.tp + s.fp),
                    ])}
                />
              </div>
            </details>
          </Card>
          </Part>

        </>
      )}
    </StepSection>
  );
}
