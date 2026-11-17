import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { P3Selection, P4Model } from "../lib/data";
import { COLOR, MODEL_LABEL, axisProps } from "../lib/theme";
import { int, n4, settingsLabel } from "../lib/format";
import { Callout, Card, ChartFrame, Mono, Pending, StepSection, SubHead, Table, Tooltip } from "./ui";

export default function Step4Retrain({
  p3,
  p4,
}: {
  p3: P3Selection | null;
  p4: P4Model | null;
}) {
  return (
    <StepSection
      id="retrain"
      step="4"
      title="Retrain the winner on all of the training data"
      lede={
        <>
          Cross-validation picked the settings while deliberately holding a fifth
          of the training days back each time. Now that the choice is made, there
          is no reason to keep any of it back: the final model is fitted on{" "}
          <strong>every training row</strong>, with the settings frozen exactly as
          selected.
        </>
      }
    >
      {!p4 ? (
        <Pending what="data/p4_model.json" />
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Card>
              <SubHead hint="Nothing here was chosen after looking at test data.">
                What was frozen
              </SubHead>
              <Table
                head={["", ""]}
                rows={[
                  ["Model", MODEL_LABEL[p4.chosen_model] ?? p4.chosen_model],
                  [
                    "Settings",
                    <span className="font-mono text-[12px]">{settingsLabel(p4.settings)}</span>,
                  ],
                  ["Chosen by", "5-fold cross-validation, grouped by date"],
                  [
                    "Threshold",
                    p3 ? `${p3.threshold.value.toFixed(3)} (from the fold predictions)` : "—",
                  ],
                  ["Fitted on", `${int(p4.trained_on_rows)} flights`],
                  ["Across", `${int(p4.trained_on_days)} calendar days`],
                  ["Features", `${p4.features.length}`],
                ]}
              />
              {p3 ? (
                <p className="mt-3 text-[12.5px] leading-relaxed text-ink-muted">
                  Selection used a sample of {int(p3.rows_used)} flights so that{" "}
                  {p3.n_fits} fits would finish on a laptop. The final model sees{" "}
                  {((p4.trained_on_rows / p3.rows_used) * 100).toFixed(0)}% more data
                  than any single candidate did, which is why its scores should be at
                  least as good as cross-validation suggested.
                </p>
              ) : null}
            </Card>

            <Card>
              <ChartFrame
                title="Which features carry the signal"
                hint={
                  <>
                    Feature ablation: shuffle one column at a time, breaking its link
                    to the target while leaving everything else intact, and measure how
                    far the curve area falls. A feature that matters hurts when it is
                    shuffled.
                  </>
                }
                height={Math.max(170, p4.importance.length * 26)}
                table={{
                  head: ["Feature", "Drop in curve area", "Std"],
                  rows: p4.importance.map((r) => [
                    <span className="font-mono text-[12px]">{r.feature}</span>,
                    n4(r.drop_in_score),
                    n4(r.std),
                  ]),
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[...p4.importance].sort((a, b) => a.drop_in_score - b.drop_in_score)}
                    layout="vertical"
                    margin={{ top: 4, right: 52, bottom: 4, left: 4 }}
                  >
                    <CartesianGrid horizontal={false} stroke={COLOR.line} />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="feature"
                      width={140}
                      {...axisProps}
                      tick={{ fill: COLOR.inkSoft, fontSize: 11.5 }}
                    />
                    <RTooltip
                      content={<Tooltip formatter={(v) => n4(Number(v))} />}
                      cursor={{ fill: "rgb(var(--surface-sunken))" }}
                    />
                    <Bar
                      dataKey="drop_in_score"
                      name="Drop when shuffled"
                      fill={COLOR.s1}
                      radius={[0, 4, 4, 0]}
                      barSize={14}
                    >
                      <LabelList
                        dataKey="drop_in_score"
                        position="right"
                        formatter={(v: number) => v.toFixed(4)}
                        style={{
                          fill: COLOR.inkMuted,
                          fontSize: 11,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
              <p className="mt-3 max-w-prose text-[12.5px] leading-relaxed text-ink-muted">
                {p4.importance_note}
              </p>
            </Card>
          </div>

          <Card>
            <SubHead hint="The predictor at the top of this page runs in your browser, with no server involved.">
              How the model gets into the page
            </SubHead>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <div className="space-y-3 text-[13.5px] leading-relaxed text-ink-soft">
                <p>{p4.browser_model.note}</p>
                <p>
                  The export is checked rather than trusted: the same flights are scored
                  in Python and in the shipped JavaScript, and the two must agree to
                  within <Mono>1e-9</Mono>. The largest disagreement across the check is{" "}
                  <strong className="text-ink">
                    {p4.browser_model.verified_max_abs_error.toExponential(1)}
                  </strong>
                  , which is floating-point noise rather than a difference in the model.
                </p>
              </div>
              <Table
                head={["Part of the export", "Count"]}
                rows={[
                  ["Intercept", "1"],
                  [
                    "Carrier / airport coefficients",
                    int(
                      Object.values(p4.browser_model.categorical).reduce(
                        (n, t) => n + Object.keys(t).length,
                        0,
                      ),
                    ),
                  ],
                  [
                    "Hour-of-day terms",
                    int(Object.keys(p4.browser_model.cyclic_hours).length * 2),
                  ],
                  ["Numeric terms", int(Object.keys(p4.browser_model.numeric).length)],
                ]}
                caption="Clock hours enter as a sine and a cosine, so 23:00 sits next to 00:00 instead of 23 units away from it."
              />
            </div>
            {p4.browser_model.kind !== p4.chosen_model ? (
              <div className="mt-4">
                <Callout tone="warn" title="The predictor and the headline are different models">
                  <p>
                    The headline numbers come from{" "}
                    <strong>{MODEL_LABEL[p4.chosen_model] ?? p4.chosen_model}</strong>,
                    which cross-validation chose. The in-browser predictor runs the{" "}
                    <strong>{MODEL_LABEL[p4.browser_model.kind] ?? p4.browser_model.kind}</strong>{" "}
                    instead, because it is the one that exports to exact arithmetic a
                    page can reproduce. Both are fitted on the same data with the same
                    features; the predictor is there to show how a prediction is built,
                    not to restate the result.
                  </p>
                </Callout>
              </div>
            ) : null}
          </Card>
        </>
      )}
    </StepSection>
  );
}
