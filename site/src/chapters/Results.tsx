import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import type { Bundle } from "../lib/data";
import { COLOR, MODEL_COLOR, MODEL_LABEL, useSize } from "../lib/labels";
import { EASE, useCountUp } from "../lib/motion";
import { Chapter, DataTable, DrawerSection, Legend } from "../ui/kit";

const ORDER = ["gradient_boosting", "random_forest", "logistic_regression", "majority_baseline"];

function BarValue({ value, delay }: { value: number; delay: number }) {
  const { ref, value: v } = useCountUp(value, 1.2, delay);
  return <span ref={ref}>{v.toFixed(4)}</span>;
}

function Bars({ data }: { data: Bundle }) {
  const { p5 } = data;
  const max = Math.max(...ORDER.map((m) => p5.results[m]?.pr_curve_area ?? 0)) * 1.08;
  const base = p5.results.majority_baseline.pr_curve_area;
  return (
    <div className="flex h-full flex-col justify-evenly">
      {ORDER.map((m, i) => {
        const r = p5.results[m];
        if (!r) return null;
        const win = m === p5.chosen_model;
        const delay = 0.3 + i * 0.15;
        return (
          <div key={m}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <p className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: win ? COLOR.ink : COLOR.soft }}>
                {win ? <Trophy className="h-3.5 w-3.5 text-amber" /> : null}
                {MODEL_LABEL[m]}
              </p>
              <p className="tabular font-mono text-[13px]">
                <span className={win ? "font-semibold text-amber" : "text-ink-soft"}>
                  <BarValue value={r.pr_curve_area} delay={delay + 0.3} />
                </span>
                <span className="ml-2 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[11px] text-ink-muted">
                  {r.ratio_to_base_rate.toFixed(2)}×
                </span>
              </p>
            </div>
            <div className="relative h-[34px] rounded-lg bg-white/[0.035]">
              <motion.div
                className={`h-full rounded-lg ${win ? "shadow-[0_0_28px_-6px_rgba(25,158,112,0.85)]" : ""}`}
                style={{ background: m === "majority_baseline" ? "rgba(107,118,147,0.5)" : MODEL_COLOR[m] }}
                initial={{ width: 0 }}
                animate={{ width: `${(r.pr_curve_area / max) * 100}%` }}
                transition={{ delay, duration: 1.1, ease: EASE }}
              />
              {/* the resampling range */}
              {m !== "majority_baseline" ? (
                <motion.div
                  className="absolute top-1/2 h-[10px] -translate-y-1/2 border-x-2 border-white/70"
                  style={{
                    left: `${(r.pr_curve_area_range[0] / max) * 100}%`,
                    width: `${Math.max(((r.pr_curve_area_range[1] - r.pr_curve_area_range[0]) / max) * 100, 0.4)}%`,
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: delay + 1.1 }}
                />
              ) : null}
              <div
                className="absolute -bottom-1 -top-1 border-l-2 border-dashed border-ink-muted/70"
                style={{ left: `${(base / max) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-ink-muted">
        Dashed line: the baseline. Whiskers: the 95% range across {data.p5.n_resamples} re-draws of the test flights — narrower than the bars can show.
      </p>
    </div>
  );
}

function PRCurves({ data }: { data: Bundle }) {
  const { p5 } = data;
  const { ref, w, h } = useSize<HTMLDivElement>();
  const pad = { l: 40, r: 14, t: 12, b: 34 };
  const iw = Math.max(w - pad.l - pad.r, 10);
  const ih = Math.max(h - pad.t - pad.b, 10);
  const ymax = 0.9;
  const x = (v: number) => pad.l + v * iw;
  const y = (v: number) => pad.t + ih - (Math.min(v, ymax) / ymax) * ih;
  const models = ["logistic_regression", "random_forest", "gradient_boosting"].filter((m) => p5.pr_curve[m]);

  return (
    <div ref={ref} className="absolute inset-0">
      {w > 0 ? (
        <svg width={w} height={h}>
          {[0, 0.2, 0.4, 0.6, 0.8].map((g) => (
            <g key={g}>
              <line x1={pad.l} x2={pad.l + iw} y1={y(g)} y2={y(g)} stroke={COLOR.line} strokeDasharray="3 5" />
              <text x={pad.l - 8} y={y(g) + 4} textAnchor="end" fontSize={10.5} fill={COLOR.muted} fontFamily="'JetBrains Mono', monospace">{g.toFixed(1)}</text>
            </g>
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map((g) => (
            <text key={g} x={x(g)} y={pad.t + ih + 18} textAnchor="middle" fontSize={10.5} fill={COLOR.muted} fontFamily="'JetBrains Mono', monospace">{g}</text>
          ))}
          <text x={pad.l + iw / 2} y={h - 2} textAnchor="middle" fontSize={11} fill={COLOR.muted}>recall — share of late flights caught</text>
          <text x={12} y={pad.t + ih / 2} textAnchor="middle" fontSize={11} fill={COLOR.muted} transform={`rotate(-90 12 ${pad.t + ih / 2})`}>precision</text>

          <line x1={pad.l} x2={pad.l + iw} y1={y(p5.test_delay_rate)} y2={y(p5.test_delay_rate)} stroke={COLOR.soft} strokeDasharray="6 6" strokeWidth={1.5} />
          <text x={pad.l + 6} y={y(p5.test_delay_rate) + 15} fontSize={10.5} fill={COLOR.soft}>no-skill line (the base rate)</text>

          {models.map((m, i) => {
            const pts = p5.pr_curve[m].filter((p) => p.recall > 0.002);
            const d = pts.map((p, k) => `${k ? "L" : "M"}${x(p.recall).toFixed(1)},${y(p.precision).toFixed(1)}`).join(" ");
            return (
              <motion.path
                key={m}
                d={d}
                fill="none"
                stroke={MODEL_COLOR[m]}
                strokeWidth={m === p5.chosen_model ? 3 : 2}
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.8, delay: 0.6 + i * 0.25, ease: EASE }}
              />
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}

export default function Results({ data }: { data: Bundle }) {
  const { p5 } = data;
  const gb = p5.results[p5.chosen_model];
  const base = p5.results.majority_baseline;
  return (
    <Chapter
      step="08"
      kicker="Evaluate · The test, opened once"
      title={<>{gb.ratio_to_base_rate.toFixed(2)}× better than guessing</>}
      takeaway={
        <>
          The held-out days, sealed since step 3, are scored exactly once — model, settings and
          cut-off all frozen. <b className="text-ink">Every model beats the baseline</b>, and gradient boosting
          leads by a margin that holds in every re-draw.
        </>
      }
      stats={[
        { label: "Curve area", value: gb.pr_curve_area, format: (v) => v.toFixed(4), accent: true, hint: `baseline ${base.pr_curve_area.toFixed(4)}` },
        { label: "Delays caught", value: gb.recall * 100, format: (v) => `${v.toFixed(1)}%` },
        { label: "Flights", value: p5.test_rows / 1e6, format: (v) => `${v.toFixed(2)}M`, hint: "never seen in training" },
      ]}
      points={[
        <>Why not accuracy? Always guessing "on time" scores <b className="text-ink">{(base.accuracy * 100).toFixed(1)}%</b> — and catches zero delays.</>,
        <>Precision {(gb.precision * 100).toFixed(1)}%: about {Math.round(gb.precision * 10)} in 10 flags are real. Useful for ranking risk, not for promises.</>,
      ]}
      drawer={{
        title: "The held-out results",
        body: (
          <>
            <DrawerSection title={`Every model, on ${p5.test_rows.toLocaleString("en-US")} held-out flights`}>
              <DataTable
                head={["Model", "Curve area", "95% range", "× base", "ROC"]}
                rows={ORDER.filter((m) => p5.results[m]).map((m) => {
                  const r = p5.results[m];
                  return [
                    MODEL_LABEL[m],
                    r.pr_curve_area.toFixed(4),
                    `${r.pr_curve_area_range[0].toFixed(3)}–${r.pr_curve_area_range[1].toFixed(3)}`,
                    `${r.ratio_to_base_rate.toFixed(2)}×`,
                    r.roc_curve_area.toFixed(3),
                  ];
                })}
              />
            </DrawerSection>
            <DrawerSection title={`${MODEL_LABEL[p5.chosen_model]} at the frozen cut-off (${p5.threshold.toFixed(3)})`}>
              <DataTable
                head={["Measure", "Value"]}
                rows={[
                  ["Precision", gb.precision.toFixed(3)],
                  ["Recall", gb.recall.toFixed(3)],
                  ["Precision/recall balance", gb.balance.toFixed(3)],
                  ["Accuracy", gb.accuracy.toFixed(3)],
                  ["Caught", gb.confusion.tp.toLocaleString("en-US")],
                  ["Missed", gb.confusion.fn.toLocaleString("en-US")],
                  ["False alarms", gb.confusion.fp.toLocaleString("en-US")],
                ]}
              />
            </DrawerSection>
            {p5.comparison ? (
              <DrawerSection title="Is the winner's lead real?">
                <p className="text-[12.5px] leading-relaxed text-ink-soft">
                  {MODEL_LABEL[p5.comparison.better]} beats {MODEL_LABEL[p5.comparison.than]} by{" "}
                  {p5.comparison.mean_difference.toFixed(4)} (range {p5.comparison.range[0].toFixed(4)} to{" "}
                  {p5.comparison.range[1].toFixed(4)}), above the {p5.comparison.material_margin} margin we fixed
                  in advance as the smallest difference worth acting on.
                </p>
              </DrawerSection>
            ) : null}
          </>
        ),
      }}
      visualTitle="Every model, on flights it never saw"
      legend={<Legend items={["gradient_boosting", "random_forest", "logistic_regression"].map((m) => ({ color: MODEL_COLOR[m], label: MODEL_LABEL[m] }))} />}
      visual={
        <div className="grid h-full grid-cols-[1fr_1.05fr] gap-8">
          <Bars data={data} />
          <div className="flex min-h-0 flex-col">
            <p className="text-[13px] font-semibold">Precision against recall</p>
            <p className="mb-2 text-[11.5px] text-ink-muted">Each curve is one model as the cut-off moves. Higher and further right is better.</p>
            <div className="relative min-h-0 flex-1">
              <PRCurves data={data} />
            </div>
          </div>
        </div>
      }
    />
  );
}
