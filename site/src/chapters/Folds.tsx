import { motion } from "framer-motion";
import { useMemo } from "react";
import type { Bundle } from "../lib/data";
import { COLOR, MODEL_LABEL, MONTHS, useSize } from "../lib/labels";
import { EASE, useCountUp } from "../lib/motion";
import { Chapter, DataTable, DrawerSection, Legend } from "../ui/kit";

const fmt = (n: number) => n.toLocaleString("en-US");

function FoldScore({ value, ratio, delay }: { value: number; ratio: number; delay: number }) {
  const { ref, value: v } = useCountUp(value, 1.1, delay);
  return (
    <div className="text-right">
      <p className="tabular font-mono text-[19px] font-semibold leading-none">
        <span ref={ref}>{v.toFixed(4)}</span>
      </p>
      <p className="mt-1 font-mono text-[10.5px] text-ink-muted">{ratio.toFixed(2)}× base</p>
    </div>
  );
}

function FoldStrips({ data }: { data: Bundle }) {
  const { p3 } = data;
  const { ref, w } = useSize<HTMLDivElement>();

  // Every training day, in date order. Each one is in exactly one fold's
  // validation set, so the union of those sets is the whole training calendar.
  const days = useMemo(
    () => Array.from(new Set(p3.folds.flatMap((f) => f.validate_day_list))).sort((a, b) => a - b),
    [p3],
  );
  const monthStarts = useMemo(() => {
    const out: { m: number; i: number }[] = [];
    days.forEach((d, i) => {
      const m = Math.floor(d / 100);
      if (!out.length || out[out.length - 1].m !== m) out.push({ m, i });
    });
    return out;
  }, [days]);

  const stripW = Math.max(w, 1);
  const step = stripW / days.length;
  const tick = Math.max(step - 0.8, 1);
  const H = 46;

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-[62px_1fr_104px] gap-4">
        <div />
        {/* month ruler */}
        <div ref={ref} className="relative h-5">
          {monthStarts.map(({ m, i }) => (
            <span
              key={m}
              className="absolute top-0 border-l border-line-strong pl-1 text-[10px] font-medium text-ink-muted"
              style={{ left: i * step }}
            >
              {MONTHS[m - 1]}
            </span>
          ))}
        </div>
        <p className="text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">score</p>
      </div>

      <div className="mt-2 flex flex-1 flex-col justify-around">
        {p3.folds.map((f, fi) => {
          const val = new Set(f.validate_day_list);
          const win = p3.winner_by_fold[fi];
          const delay = 0.35 + fi * 0.32;
          return (
            <div key={f.fold} className="grid grid-cols-[62px_1fr_104px] items-center gap-4">
              <div>
                <p className="text-[13px] font-semibold">Fold {f.fold}</p>
                <p className="text-[10.5px] text-ink-muted">{f.validate_days} days</p>
              </div>

              <div className="relative" style={{ height: H }}>
                <svg width={stripW} height={H} className="absolute inset-0 overflow-visible">
                  <defs>
                    <clipPath id={`sweep-${fi}`}>
                      <motion.rect
                        x={0}
                        y={-4}
                        height={H + 8}
                        initial={{ width: 0 }}
                        animate={{ width: stripW }}
                        transition={{ duration: 1.0, delay, ease: [0.45, 0, 0.2, 1] }}
                      />
                    </clipPath>
                  </defs>
                  <g clipPath={`url(#sweep-${fi})`}>
                    {days.map((d, i) => {
                      const isVal = val.has(d);
                      return (
                        <rect
                          key={d}
                          x={i * step}
                          y={isVal ? 0 : H * 0.3}
                          width={tick}
                          height={isVal ? H : H * 0.4}
                          rx={Math.min(1.5, tick / 2)}
                          fill={isVal ? COLOR.s2 : COLOR.s1}
                          opacity={isVal ? 1 : 0.32}
                        />
                      );
                    })}
                  </g>
                  {/* the scanner line */}
                  <motion.rect
                    y={-4}
                    width={2}
                    height={H + 8}
                    fill={COLOR.amber}
                    initial={{ x: 0, opacity: 0 }}
                    animate={{ x: stripW, opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 1.0, delay, ease: [0.45, 0, 0.2, 1] }}
                  />
                </svg>
              </div>

              <FoldScore value={win.curve_area} ratio={win.ratio_to_base} delay={delay + 0.7} />
            </div>
          );
        })}
      </div>

      {/* the five results on one axis */}
      <MeanStrip data={data} />
    </div>
  );
}

function MeanStrip({ data }: { data: Bundle }) {
  const { p3 } = data;
  const scores = p3.winner_by_fold.map((f) => f.curve_area);
  const lo = p3.base_rate - 0.01;
  const hi = Math.max(...scores) + 0.01;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[12.5px] font-semibold">
          Five folds, one answer: <span className="font-mono text-amber">{p3.best.mean_score.toFixed(4)}</span>
          <span className="ml-1.5 font-mono text-[11.5px] text-ink-muted">± {p3.best.std_score.toFixed(4)}</span>
        </p>
        <p className="text-[11px] text-ink-muted">tight spread → the mean is trustworthy, not a lucky fold</p>
      </div>
      <div className="relative h-9">
        <div className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
        <motion.div
          className="absolute top-1 h-7 w-px border-l border-dashed border-ink-muted"
          style={{ left: `${x(p3.base_rate)}%` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.2 }}
        >
          <span className="absolute -top-0.5 left-1.5 whitespace-nowrap text-[10px] text-ink-muted">baseline {p3.base_rate.toFixed(3)}</span>
        </motion.div>
        {scores.map((s, i) => (
          <motion.span
            key={i}
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel"
            style={{ left: `${x(s)}%`, background: COLOR.s2 }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 2.2 + i * 0.08, type: "spring", stiffness: 300, damping: 15 }}
          />
        ))}
        <motion.div
          className="absolute top-0 h-9 w-[3px] -translate-x-1/2 rounded-full bg-amber shadow-glow"
          style={{ left: `${x(p3.best.mean_score)}%` }}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ delay: 2.7, duration: 0.5, ease: EASE }}
        />
      </div>
    </div>
  );
}

export default function Folds({ data }: { data: Bundle }) {
  const { p3 } = data;
  return (
    <Chapter
      step="04"
      kicker="Train · Cross-validation"
      title={<>Five rounds, five different tests</>}
      takeaway={
        <>
          The training days are dealt into five groups. Each round, the model learns from four and is
          scored on the fifth — so every flight gets judged by a model that{" "}
          <b className="text-ink">never saw its day</b>.
        </>
      }
      stats={[
        { label: "Folds", value: 5, format: (v) => Math.round(v).toString() },
        { label: "Fits run", value: p3.n_fits, format: (v) => Math.round(v).toString(), hint: `${p3.n_candidates} settings × 5` },
        { label: "Mean score", value: p3.best.mean_score, format: (v) => v.toFixed(4), accent: true, hint: `${MODEL_LABEL[p3.best.model]}` },
      ]}
      points={[
        <>Folds are grouped <b className="text-ink">by date</b>: a day can't be learned in one fold and tested in another.</>,
        <>Shown here: the winning model. All {p3.n_candidates} candidates ran through these same five folds.</>,
      ]}
      drawer={{
        title: "Every fold, in detail",
        body: (
          <>
            <DrawerSection title="How each fold was built">
              <DataTable
                head={["Fold", "Fit on", "Scored on", "Base rate"]}
                rows={p3.folds.map((f) => [
                  `Fold ${f.fold}`,
                  `${fmt(f.fit_rows)} · ${f.fit_days}d`,
                  `${fmt(f.validate_rows)} · ${f.validate_days}d`,
                  `${(f.validate_base_rate * 100).toFixed(1)}%`,
                ])}
              />
            </DrawerSection>
            <DrawerSection title={`${MODEL_LABEL[p3.best.model]}, fold by fold`}>
              <DataTable
                head={["Fold", "Curve area", "× base", "Precision", "Recall", "Caught", "Missed"]}
                rows={p3.winner_by_fold.map((f) => [
                  `Fold ${f.fold}`,
                  f.curve_area.toFixed(4),
                  `${f.ratio_to_base.toFixed(2)}×`,
                  f.precision.toFixed(3),
                  f.recall.toFixed(3),
                  fmt(f.confusion.tp),
                  fmt(f.confusion.fn),
                ])}
                caption="Precision and recall at the decision threshold chosen from these same out-of-fold predictions."
              />
            </DrawerSection>
          </>
        ),
      }}
      visualTitle="Each fold, across the training calendar"
      visualHint="Every tick is one training day. Tall orange ticks are the days that fold is scored on; the rest are what it learns from."
      legend={<Legend items={[{ color: COLOR.s1, label: "learned from" }, { color: COLOR.s2, label: "scored on" }]} />}
      visual={<FoldStrips data={data} />}
    />
  );
}
