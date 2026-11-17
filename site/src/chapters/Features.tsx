import { motion } from "framer-motion";
import { Check, Lock, X } from "lucide-react";
import type { Bundle } from "../lib/data";
import { COLOR, FEATURE_LABEL, useSize } from "../lib/labels";
import { EASE } from "../lib/motion";
import { Chapter, DataTable, DrawerSection } from "../ui/kit";

/** Short names that fit on the matrix axes. */
const SHORT: Record<string, string> = {
  SCHED_DEP_HOUR: "Dep hour",
  SCHED_ARR_HOUR: "Arr hour",
  SCHEDULED_TIME: "Duration",
  DISTANCE: "Distance",
  MONTH: "Month",
  DAY: "Day",
  DAY_OF_WEEK: "Weekday",
  IS_WEEKEND: "Weekend",
};

function Matrix({ data }: { data: Bundle }) {
  const { p1 } = data;
  const vars: string[] = [];
  Object.keys(p1.correlations).forEach((k) =>
    k.split("|").forEach((v) => !vars.includes(v) && vars.push(v)),
  );
  const r = (a: string, b: string) => p1.correlations[`${a}|${b}`] ?? p1.correlations[`${b}|${a}`] ?? 0;
  const dropped = Object.keys(p1.dropped_features);
  const { ref, w, h } = useSize<HTMLDivElement>();
  const n = vars.length - 1;
  const cell = Math.max(34, Math.min(66, Math.floor(Math.min((w - 84) / n, (h - 110) / n))));

  return (
    <div ref={ref} className="flex h-full flex-col items-center justify-center">
      <div className="grid" style={{ gridTemplateColumns: `76px repeat(${vars.length - 1}, ${cell}px)` }}>
        {vars.slice(1).map((row, i) => (
          <div key={row} className="contents">
            <div
              className={`flex items-center justify-end pr-2.5 text-[11px] ${
                dropped.includes(row) ? "font-semibold text-accent line-through decoration-accent/60" : "text-ink-soft"
              }`}
              style={{ height: cell }}
            >
              {SHORT[row] ?? row}
            </div>
            {vars.slice(0, vars.length - 1).map((col, j) => {
              if (j > i) return <div key={col} style={{ width: cell, height: cell }} />;
              const v = r(row, col);
              const strong = Math.abs(v) >= 0.75;
              const pos = v >= 0;
              return (
                <motion.div
                  key={col}
                  className="relative m-[2px] flex items-center justify-center rounded-md"
                  style={{
                    width: cell - 4,
                    height: cell - 4,
                    background: pos
                      ? `rgba(217,89,38,${0.08 + Math.abs(v) * 0.85})`
                      : `rgba(57,135,229,${0.08 + Math.abs(v) * 0.85})`,
                  }}
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + (i + j) * 0.05, duration: 0.5, ease: EASE }}
                >
                  <span className={`tabular font-mono text-[10.5px] ${strong ? "font-semibold text-white" : "text-ink-soft"}`}>
                    {v.toFixed(2).replace("0.", ".").replace("-.", "−.")}
                    {strong ? "*" : ""}
                  </span>
                </motion.div>
              );
            })}
          </div>
        ))}
        {/* column labels */}
        <div />
        {vars.slice(0, vars.length - 1).map((col) => (
          <div
            key={`c-${col}`}
            className={`flex h-[72px] items-start justify-center pt-2 text-[11px] ${
              dropped.includes(col) ? "font-semibold text-accent line-through" : "text-ink-soft"
            }`}
          >
            <span className="origin-top-left translate-x-2 rotate-45 whitespace-nowrap">{SHORT[col] ?? col}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex items-center gap-4 text-[11.5px] text-ink-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR.s2 }} /> move together</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR.s1 }} /> move oppositely</span>
        <span className="flex items-center gap-1.5"><span className="font-mono font-semibold text-ink">*</span> redundant pair</span>
      </div>
    </div>
  );
}

function Chips({ data }: { data: Bundle }) {
  const { p1 } = data;
  const dropped = Object.entries(p1.dropped_features);
  return (
    <div className="flex h-full flex-col justify-center gap-5">
      <section>
        <p className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[#0B7A43]">
          <Check className="h-3.5 w-3.5" /> Kept · {p1.final_features.length}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {p1.final_features.map((f, i) => (
            <motion.span
              key={f}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 + i * 0.05 }}
              className="rounded-full border border-s3/40 bg-s3/10 px-2.5 py-1 text-[11.5px] text-ink"
            >
              {FEATURE_LABEL[f] ?? f}
            </motion.span>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-accent">
          <X className="h-3.5 w-3.5" /> Dropped as redundant · {dropped.length}
        </p>
        <div className="space-y-2">
          {dropped.map(([f, why], i) => (
            <motion.div
              key={f}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.3 + i * 0.15 }}
              className="rounded border border-accent/25 bg-accent/[0.06] px-3 py-2"
            >
              <p className="text-[12.5px] font-semibold text-ink line-through decoration-accent/70">
                {FEATURE_LABEL[f] ?? f}
              </p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-ink-muted">
                {why.split(",")[0].replace(/^correlated/, "correlates")}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[#B42318]">
          <Lock className="h-3.5 w-3.5" /> Refused · {p1.forbidden_features.length} known only after take-off
        </p>
        <div className="flex flex-wrap gap-1">
          {p1.forbidden_features.map((f, i) => (
            <motion.span
              key={f}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.6 + i * 0.025 }}
              className="rounded-md border border-bad/25 bg-bad/[0.07] px-1.5 py-0.5 font-mono text-[9.5px] text-[#B42318]/90"
            >
              {f}
            </motion.span>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function Features({ data }: { data: Bundle }) {
  const { p1 } = data;
  const strongest = Object.entries(p1.correlations).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  return (
    <Chapter
      step="02"
      kicker="Prepare · Features"
      title={<>Only what's known before take-off</>}
      takeaway={
        <>
          A column is unusable unless it is <b className="text-ink">named as available at booking time</b>.
          Then we measured which of the survivors repeat each other, and dropped those on evidence — not intuition.
        </>
      }
      stats={[
        { label: "Candidates", value: 11, format: (v) => Math.round(v).toString() },
        { label: "Redundant", value: Object.keys(p1.dropped_features).length, format: (v) => Math.round(v).toString() },
        { label: "Features used", value: p1.final_features.length, format: (v) => Math.round(v).toString(), accent: true },
      ]}
      points={[
        <>The strongest overlap: <b className="text-ink">{strongest[0].replace("|", " ↔ ")}</b> at r = {strongest[1].toFixed(3)} — the airline's padded estimate of distance.</>,
        <>A leakage check runs before <b className="text-ink">every</b> fit: a refused column stops the program instead of producing a flattering score.</>,
      ]}
      drawer={{
        title: "Features, in full",
        body: (
          <>
            <DrawerSection title="Correlation between candidate features (training rows)">
              <DataTable
                head={["Pair", "r"]}
                rows={Object.entries(p1.correlations)
                  .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                  .map(([k, v]) => [k.replace("|", " ↔ "), v.toFixed(3)])}
              />
            </DrawerSection>
            <DrawerSection title="Why each dropped feature went">
              <DataTable head={["Feature", "Reason"]} rows={Object.entries(p1.dropped_features).map(([f, w]) => [f, <span className="font-sans text-[12px]">{w}</span>])} />
            </DrawerSection>
          </>
        ),
      }}
      visualTitle="Which features repeat each other?"
      visualHint="Correlation between every pair of numeric candidates. Darker means more alike; starred cells (*) are the pairs that carried the same information."
      visual={
        <div className="grid h-full grid-cols-[1.25fr_1fr] gap-6">
          <Matrix data={data} />
          <Chips data={data} />
        </div>
      }
    />
  );
}
