import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { P3Selection } from "../lib/data";
import { COLOR, MODEL_LABEL, axisProps } from "../lib/theme";
import { int, monthShort, n3, n4, pct } from "../lib/format";
import { Card, ChartFrame, SubHead, Table, Tooltip } from "./ui";

/** Every fold of the winning model, one row each: which days it was judged on,
 *  how hard that slice was, and what it scored. This is the step people usually
 *  show as a single averaged number, which hides whether the model was steady
 *  or lucky. */
export default function FoldDetail({ p3 }: { p3: P3Selection }) {
  const folds = p3.winner_by_fold ?? [];
  if (!folds.length) return null;

  const mean = p3.best.mean_score;
  const best = Math.max(...folds.map((f) => f.curve_area));
  const worst = Math.min(...folds.map((f) => f.curve_area));

  return (
    <Card>
      <SubHead
        hint={
          <>
            The winner — {MODEL_LABEL[p3.best.model] ?? p3.best.model} — scored on
            each fold in turn. Every flight here was scored by a copy of the model
            that was never fitted on that flight's day. Mean {n4(mean)}, and the
            folds span {n4(worst)} to {n4(best)}: a spread of{" "}
            {n4(best - worst)}, which is what tells you whether the mean is solid
            or an average of very different runs.
          </>
        }
      >
        Fold by fold
      </SubHead>

      <div className="grid gap-3 xl:grid-cols-5 lg:grid-cols-3 sm:grid-cols-2">
        {folds.map((f) => {
          const widthPct = (f.curve_area / (best * 1.12)) * 100;
          return (
            <div
              key={f.fold}
              className="rounded-xl border border-line bg-surface-sunken p-3.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[13px] font-semibold">Fold {f.fold}</p>
                <p className="tabular text-[11.5px] text-ink-muted">
                  base {pct(f.base_rate)}
                </p>
              </div>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                {int(f.validate_rows)} flights · {f.validate_days} days
              </p>

              <p className="tabular mt-2.5 text-[22px] font-bold leading-none tracking-[-0.02em]">
                {n4(f.curve_area)}
              </p>
              <p className="tabular mt-1 text-[12px] text-ink-soft">
                {f.ratio_to_base.toFixed(2)}× the base rate
              </p>

              <div
                className="mt-2 h-2 overflow-hidden rounded-full"
                style={{ background: "rgb(var(--line))" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${widthPct.toFixed(1)}%`,
                    background: f.curve_area >= mean ? COLOR.s3 : COLOR.s1,
                  }}
                />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-[11.5px]">
                {[
                  ["Prec.", n3(f.precision)],
                  ["Recall", n3(f.recall)],
                  ["Bal.", n3(f.balance)],
                  ["Caught", int(f.confusion.tp)],
                  ["Missed", int(f.confusion.fn)],
                  ["Alarms", int(f.confusion.fp)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-[10px] uppercase tracking-wider text-ink-muted">
                      {k}
                    </p>
                    <p className="tabular mt-0.5 font-medium">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ChartFrame
          title="Fold score against how hard that fold was"
          hint="Folds differ in difficulty: a fold full of busy days has a higher base rate, and the curve area rises with it. Dividing by each fold's own base rate is what makes them comparable, which is the last column in the table."
          height={210}
          table={{
            head: ["Fold", "Months", "Flights", "Base rate", "Curve area", "× base rate"],
            rows: folds.map((f) => [
              `Fold ${f.fold}`,
              f.validate_months.map((m) => monthShort(m)).join(", "),
              int(f.validate_rows),
              pct(f.base_rate),
              n4(f.curve_area),
              `${f.ratio_to_base.toFixed(3)}×`,
            ]),
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={folds.map((f) => ({
                name: `Fold ${f.fold}`,
                ratio: f.ratio_to_base,
                area: f.curve_area,
                base: f.base_rate,
              }))}
              margin={{ top: 8, right: 12, bottom: 4, left: -18 }}
            >
              <CartesianGrid vertical={false} stroke={COLOR.line} />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis
                {...axisProps}
                domain={[0, (max: number) => max * 1.18]}
                tickFormatter={(v) => `${Number(v).toFixed(1)}×`}
              />
              <RTooltip
                content={
                  <Tooltip
                    formatter={(v, name) =>
                      name === "Times the base rate"
                        ? `${Number(v).toFixed(3)}×`
                        : n4(Number(v))
                    }
                  />
                }
                cursor={{ fill: "rgb(var(--surface-sunken))" }}
              />
              <ReferenceLine
                y={p3.best.mean_ratio_to_base}
                stroke={COLOR.ink}
                strokeDasharray="3 3"
                label={{
                  value: `mean ${p3.best.mean_ratio_to_base.toFixed(2)}×`,
                  position: "insideTopRight",
                  offset: 8,
                  style: { fill: COLOR.inkMuted, fontSize: 11 },
                }}
              />
              <Bar dataKey="ratio" name="Times the base rate" radius={[4, 4, 0, 0]}>
                {folds.map((f, i) => (
                  <Cell
                    key={i}
                    fill={f.ratio_to_base >= p3.best.mean_ratio_to_base ? COLOR.s3 : COLOR.s1}
                  />
                ))}
                <LabelList
                  dataKey="ratio"
                  position="top"
                  formatter={(v: number) => `${v.toFixed(2)}×`}
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

      {p3.oof_calibration?.length ? (
        <div>
          <SubHead
            hint="Before the test set was opened at all, the fold predictions already show whether a stated probability means what it says. Each row groups flights by the probability they were given."
          >
            Were the fold predictions honest probabilities?
          </SubHead>
          <Table
            head={["Score band", "Mean predicted", "Actually late", "Flights"]}
            rows={p3.oof_calibration.map((c) => [
              c.bin,
              n3(c.mean_predicted),
              <span
                className={
                  Math.abs(c.mean_predicted - c.observed_rate) > 0.1
                    ? "font-semibold text-[rgb(var(--bad))]"
                    : ""
                }
              >
                {n3(c.observed_rate)}
              </span>,
              int(c.n),
            ])}
            caption="A band where the two middle columns disagree is a band where the number on the page would mislead a reader."
          />
        </div>
      ) : null}
      </div>
    </Card>
  );
}
