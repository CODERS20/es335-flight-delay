import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { P3Selection, P5Results } from "../lib/data";
import { COLOR, MODEL_COLOR, MODEL_LABEL, axisProps } from "../lib/theme";
import { int, n3, n4, pct } from "../lib/format";
import { Callout, Card, ChartFrame, Part, Pending, Pill, StepSection, SubHead, Table, Tooltip } from "./ui";

const ORDER = [
  "majority_baseline",
  "logistic_regression",
  "random_forest",
  "gradient_boosting",
];

function ConfusionMatrix({
  c,
  total,
}: {
  c: { tp: number; fp: number; fn: number; tn: number };
  total: number;
}) {
  const cells = [
    { k: "True negatives", v: c.tn, s: "on time, not flagged", good: true },
    { k: "False positives", v: c.fp, s: "on time, flagged anyway", good: false },
    { k: "False negatives", v: c.fn, s: "late, missed", good: false },
    { k: "True positives", v: c.tp, s: "late, caught", good: true },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {cells.map((cell) => (
        <div
          key={cell.k}
          className="rounded-lg border p-3.5"
          style={{
            borderColor: cell.good ? "rgb(var(--good))" : "rgb(var(--bad))",
            background: cell.good ? "rgb(var(--good-soft))" : "rgb(var(--bad-soft))",
          }}
        >
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">
            {cell.k}
          </p>
          <p className="tabular mt-1 text-[21px] font-semibold leading-none">{int(cell.v)}</p>
          <p className="mt-1.5 text-[12px] text-ink-soft">{cell.s}</p>
          <p className="tabular mt-0.5 text-[11.5px] text-ink-muted">
            {pct(cell.v / total, 1)} of all flights
          </p>
        </div>
      ))}
    </div>
  );
}

/** Precision and recall only mean something at a threshold. The chosen model
 *  has one; the baseline needs none, since it flags nothing whatever the
 *  cut-off; the other models would need their own, which were never chosen. */
const showDecisions = (model: string, chosen?: string) =>
  model === "majority_baseline" || model === chosen;

export default function Step5Evaluate({
  p3,
  p5,
  part = 1,
}: {
  p3: P3Selection | null;
  p5: P5Results | null;
  part?: number;
}) {
  const [slice, setSlice] = useState(0);

  return (
    <StepSection
      id={["evaluate", "evaluate-detail", "evaluate-forecast"][part - 1]}
      step="5"
      title={
        [
          "Evaluate on the held-out test set, once",
          "Honest probabilities, and where it fails",
          "The harder question: a future period",
        ][part - 1]
      }
      lede={
        <>
          The test days were separated in step 2 and not touched again. They are
          scored here with the model, settings and threshold all frozen. Nothing
          below was tuned against these flights, and nothing was re-run after
          seeing them.
        </>
      }
    >
      {!p5 ? (
        <Pending what="data/p5_results.json" />
      ) : (
        <>
          <Part n={1} part={part}>
          <Card>
            <SubHead
              hint={`${int(p5.test_rows)} held-out flights, delay rate ${pct(p5.test_delay_rate, 2)}. Ranges come from re-drawing the test flights at random ${p5.n_resamples} times and re-measuring.`}
            >
              Every model on the held-out flights
            </SubHead>
            <Table
              head={[
                "Model",
                "PR curve area",
                "95% range",
                "× base rate",
                "ROC area",
                "Precision",
                "Recall",
                "P/R balance",
                "Accuracy",
              ]}
              highlight={(i) => ORDER.filter((m) => p5.results[m])[i] === p5.chosen_model}
              rows={ORDER.filter((m) => p5.results[m]).map((m) => {
                const r = p5.results[m];
                return [
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block h-2.5 w-2.5 flex-none rounded-full"
                      style={{ background: MODEL_COLOR[m] }}
                    />
                    {MODEL_LABEL[m] ?? m}
                    {m === p5.chosen_model ? <Pill tone="accent">chosen</Pill> : null}
                  </span>,
                  <span className="font-semibold">{n4(r.pr_curve_area)}</span>,
                  r.pr_curve_area_range
                    ? `${n3(r.pr_curve_area_range[0])}–${n3(r.pr_curve_area_range[1])}`
                    : "—",
                  `${r.ratio_to_base_rate.toFixed(2)}×`,
                  n3(r.roc_curve_area),
                  // The threshold was chosen for the winning model only, so
                  // reporting the OTHER MODELS at that same cut-off would
                  // describe a decision rule nobody would use. The baseline is
                  // the exception: it predicts "on time" regardless of any
                  // threshold, so its numbers are the ones that make the point
                  // about accuracy.
                  showDecisions(m, p5.chosen_model) ? n3(r.precision) : "—",
                  showDecisions(m, p5.chosen_model) ? n3(r.recall) : "—",
                  showDecisions(m, p5.chosen_model) ? n3(r.balance) : "—",
                  showDecisions(m, p5.chosen_model) ? n3(r.accuracy) : "—",
                ];
              })}
              caption={
                <>
                  The first four columns need no threshold, so every model is
                  comparable on them. Precision, recall and accuracy depend on where
                  the cut-off sits, and the cut-off ({n3(p5.threshold)}) was chosen
                  during cross-validation for the winning model alone — applying it
                  to the others would describe a decision rule nobody would use, so
                  those cells are left empty. Accuracy is shown at all only to make
                  the point that the baseline beats every model on it while catching
                  no delayed flight whatsoever.
                </>
              }
            />
          </Card>
          </Part>

          <Part n={1} part={part}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <Card>
              <ChartFrame
                title="Precision against recall"
                hint="Each curve traces one model as the threshold moves. The dashed line is the base rate — where a model with no information would sit. Up and to the right is better."
                height={250}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart margin={{ top: 8, right: 12, bottom: 20, left: -14 }}>
                    <CartesianGrid stroke={COLOR.line} />
                    <XAxis
                      type="number"
                      dataKey="recall"
                      domain={[0, 1]}
                      {...axisProps}
                      tickFormatter={(v) => v.toFixed(1)}
                      label={{
                        value: "Recall",
                        position: "insideBottom",
                        offset: -12,
                        style: { fill: COLOR.inkMuted, fontSize: 12 },
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="precision"
                      domain={[0, "auto"]}
                      {...axisProps}
                      tickFormatter={(v) => v.toFixed(1)}
                    />
                    <RTooltip
                      content={<Tooltip formatter={(v) => n3(Number(v))} />}
                      labelFormatter={() => ""}
                    />
                    <ReferenceLine
                      y={p5.test_delay_rate}
                      stroke={COLOR.inkMuted}
                      strokeDasharray="4 4"
                      label={{
                        value: "base rate",
                        position: "insideTopRight",
                        style: { fill: COLOR.inkMuted, fontSize: 11 },
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      height={26}
                      iconType="plainline"
                      formatter={(v) => (
                        <span className="text-[12.5px] text-ink-soft">{v}</span>
                      )}
                    />
                    {Object.entries(p5.pr_curve).map(([m, pts]) => (
                      <Line
                        key={m}
                        data={pts}
                        type="monotone"
                        dataKey="precision"
                        name={MODEL_LABEL[m] ?? m}
                        stroke={MODEL_COLOR[m]}
                        strokeWidth={m === p5.chosen_model ? 2.5 : 1.6}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </ChartFrame>
            </Card>

            <Card>
              <SubHead
                hint={`At the frozen threshold of ${n3(p5.threshold)}, applied to ${int(p5.test_rows)} held-out flights.`}
              >
                What the decisions actually look like
              </SubHead>
              <ConfusionMatrix
                c={p5.results[p5.chosen_model].confusion}
                total={p5.test_rows}
              />
              <div className="mt-4">
                <Callout title="Reading this honestly">
                  <p>
                    The model flags{" "}
                    {int(
                      p5.results[p5.chosen_model].confusion.tp +
                        p5.results[p5.chosen_model].confusion.fp,
                    )}{" "}
                    flights and is right about{" "}
                    {pct(p5.results[p5.chosen_model].precision, 0)} of them, while
                    catching {pct(p5.results[p5.chosen_model].recall, 0)} of the flights
                    that were genuinely late. Useful for ranking which flights to worry
                    about; nowhere near reliable enough to promise an individual
                    traveller anything.
                  </p>
                </Callout>
              </div>
            </Card>
          </div>
          </Part>

          <Part n={3} part={part}>
          <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
          {p3 ? (
            <Card>
              <SubHead hint="The question every evaluation should answer: did the number selection promised actually survive on data it never saw?">
                Cross-validation against the held-out result
              </SubHead>
              <Table
                head={["Stage", "Curve area", "Base rate", "× base rate"]}
                rows={p5.cv_to_test
                  .filter((s) => !s.stage.startsWith("Cross-validation fold"))
                  .map((s) => [
                    s.stage,
                    n4(s.score),
                    pct(s.base_rate, 2),
                    `${s.ratio.toFixed(3)}×`,
                  ])}
                caption="Raw curve areas cannot be compared across periods with different base rates, which is why the last column is the one to read."
              />
              <details className="mt-3 rounded-lg border border-line bg-surface-sunken px-4">
                <summary className="cursor-pointer py-2.5 text-[13px] font-medium text-ink-soft hover:text-ink">
                  Show each fold separately
                </summary>
                <div className="pb-4">
                  <Table
                    head={["Fold", "Curve area", "Base rate", "× base rate"]}
                    rows={p5.cv_to_test
                      .filter((s) => s.stage.startsWith("Cross-validation fold"))
                      .map((s) => [
                        s.stage.replace("Cross-validation ", ""),
                        n4(s.score),
                        pct(s.base_rate, 2),
                        `${s.ratio.toFixed(3)}×`,
                      ])}
                  />
                </div>
              </details>
              <div className="mt-4">
                <Callout tone="warn" title="Why the held-out number is higher than cross-validation predicted">
                  <p>
                    Two reasons, and neither is the model being better than it
                    looked. First, cross-validation fitted each candidate on a{" "}
                    sample so that {p3.n_fits} fits would finish, while the final
                    model was refitted on every training row — roughly ten times the
                    data. Second, this split holds out whole days from inside the
                    same period, so a held-out day sits between training days that
                    shared its weather and its holiday traffic.
                  </p>
                  <p>
                    That second point is the cost of the design: it answers “can we
                    predict the flights we did not see, in a period we know”, which
                    is easier than “can we predict a period we have never seen”. The
                    harder question is measured below, and it scores lower.
                  </p>
                </Callout>
              </div>
            </Card>
          ) : null}
          </div>
          </Part>

          <Part n={2} part={part}>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <Card>
              <ChartFrame
                title="Are the probabilities honest?"
                hint="Flights are grouped by the probability the model gave them; each point compares that group's mean prediction against how often those flights were actually late. On the dashed line, a stated probability means what it says."
                height={230}
                table={{
                  head: ["Score band", "Mean predicted", "Observed rate", "Flights"],
                  rows: p5.calibration.map((c) => [
                    c.bin,
                    n3(c.mean_predicted),
                    n3(c.observed_rate),
                    int(c.n),
                  ]),
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={p5.calibration}
                    margin={{ top: 8, right: 12, bottom: 20, left: -14 }}
                  >
                    <CartesianGrid stroke={COLOR.line} />
                    <XAxis
                      type="number"
                      dataKey="mean_predicted"
                      domain={[0, 1]}
                      {...axisProps}
                      tickFormatter={(v) => v.toFixed(1)}
                      label={{
                        value: "Mean predicted probability",
                        position: "insideBottom",
                        offset: -12,
                        style: { fill: COLOR.inkMuted, fontSize: 12 },
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="observed_rate"
                      domain={[0, 1]}
                      {...axisProps}
                      tickFormatter={(v) => v.toFixed(1)}
                    />
                    <RTooltip content={<Tooltip formatter={(v) => n3(Number(v))} />} />
                    <Line
                      data={[
                        { mean_predicted: 0, observed_rate: 0 },
                        { mean_predicted: 1, observed_rate: 1 },
                      ]}
                      dataKey="observed_rate"
                      name="Perfect"
                      stroke={COLOR.inkMuted}
                      strokeDasharray="4 4"
                      strokeWidth={1.2}
                      dot={false}
                      legendType="none"
                    />
                    <Line
                      type="monotone"
                      dataKey="observed_rate"
                      name="Observed"
                      stroke={COLOR.s3}
                      strokeWidth={2}
                      dot={{ r: 3.5, strokeWidth: 0, fill: COLOR.s3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartFrame>
            </Card>

            <Card>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <SubHead hint="The same model, broken down by group. A model can look fine overall and still fail somewhere that matters.">
                  Where it goes wrong
                </SubHead>
                <div
                  className="flex gap-1 overflow-x-auto rounded-lg border border-line p-1"
                  role="group"
                  aria-label="Breakdown"
                >
                  {p5.slices.map((s, i) => (
                    <button
                      key={s.by}
                      type="button"
                      onClick={() => setSlice(i)}
                      aria-pressed={slice === i}
                      className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
                        slice === i ? "text-accent" : "text-ink-muted hover:text-ink"
                      }`}
                      style={slice === i ? { background: "rgb(var(--accent-soft))" } : undefined}
                    >
                      {s.by}
                    </button>
                  ))}
                </div>
              </div>
              {p5.slices[slice] ? (
                <Table
                  head={[p5.slices[slice].by, "Flights", "Actual rate", "Recall", "Precision"]}
                  rows={p5.slices[slice].rows.map((r) => [
                    r.group,
                    int(r.n),
                    <span className="flex items-center justify-end gap-2">
                      <span
                        aria-hidden="true"
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${
                            (r.actual_rate /
                              Math.max(...p5.slices[slice].rows.map((x) => x.actual_rate))) *
                            44
                          }px`,
                          background: COLOR.s1,
                        }}
                      />
                      {pct(r.actual_rate)}
                    </span>,
                    pct(r.recall),
                    pct(r.precision),
                  ])}
                />
              ) : null}
            </Card>
          </div>
          </Part>

          <Part n={3} part={part}>
          {p5.secondary_check ? (
            <Card>
              <SubHead hint={p5.secondary_check.design}>
                The harder question: predicting a future period
              </SubHead>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                <Table
                  head={["", "Value"]}
                  rows={[
                    ["Fitted on months", p5.secondary_check.train_months.join(", ")],
                    ["Scored on months", p5.secondary_check.test_months.join(", ")],
                    ["Base rate there", pct(p5.secondary_check.base_rate, 2)],
                    ["Curve area", n4(p5.secondary_check.pr_curve_area)],
                    [
                      "× base rate",
                      `${p5.secondary_check.ratio_to_base_rate.toFixed(2)}×`,
                    ],
                  ]}
                />
                <Callout tone="warn" title="Why this number is lower, and why we report it anyway">
                  <p>{p5.secondary_check.reading}</p>
                </Callout>
              </div>
            </Card>
          ) : null}
          </Part>

        </>
      )}
    </StepSection>
  );
}
