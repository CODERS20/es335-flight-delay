import { motion } from "framer-motion";
import type { Bundle } from "../lib/data";
import { COLOR, MONTHS, useSize } from "../lib/labels";
import { EASE } from "../lib/motion";
import { Chapter, DataTable, DrawerSection, Legend } from "../ui/kit";

const fmt = (n: number) => n.toLocaleString("en-US");

export function Calendar({
  data,
  mode = "days",
  cell = 15,
}: {
  data: Bundle;
  /** "days": the main split. "forecast": train on Jan-Sep, test on Nov-Dec. */
  mode?: "days" | "forecast";
  cell?: number;
}) {
  const { p2 } = data;
  const months = Object.keys(p2.days_by_month).map(Number).sort((a, b) => a - b);
  const gap = Math.max(2, Math.round(cell / 6));
  return (
    <div className="inline-grid" style={{ gridTemplateColumns: `34px repeat(31, ${cell}px)`, gap }}>
      {months.map((m, row) => {
        const held = new Set(p2.test_days_by_month[String(m)]);
        const n = p2.days_by_month[String(m)];
        return (
          <div key={m} className="contents">
            <div className="flex items-center text-[10.5px] font-medium text-ink-muted" style={{ height: cell }}>
              {cell >= 13 ? MONTHS[m - 1] : row === 0 || row === months.length - 1 ? MONTHS[m - 1] : ""}
            </div>
            {Array.from({ length: 31 }, (_, d) => {
              const day = d + 1;
              if (day > n) return <div key={day} style={{ width: cell, height: cell }} />;
              // In the forecasting check the model learned from the Jan-Sep
              // training days only and was scored on the held-out days of
              // Nov-Dec; everything else sat out. Draw exactly that.
              const isTest = mode === "days" ? held.has(day) : m >= 11 && held.has(day);
              const unused = mode === "forecast" && !isTest && (m >= 11 || held.has(day));
              return (
                <motion.div
                  key={day}
                  title={`${MONTHS[m - 1]} ${day}: ${isTest ? "test" : unused ? "not used" : "training"}`}
                  className="rounded-[3px]"
                  style={{
                    width: cell,
                    height: cell,
                    background: isTest
                      ? COLOR.s2
                      : unused
                        ? "rgba(120,114,100,0.07)"
                        : "rgba(42,120,214,0.22)",
                    
                  }}
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    delay: 0.25 + (row + d) * 0.012 + (isTest ? 0.35 : 0),
                    duration: 0.45,
                    ease: EASE,
                  }}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** The calendar, sized to fill the width it is given. */
export function FitCalendar({
  data,
  mode = "days",
  max = 26,
}: {
  data: Bundle;
  mode?: "days" | "forecast";
  max?: number;
}) {
  const { ref, w } = useSize<HTMLDivElement>();
  const cell = Math.max(5, Math.min(max, Math.floor((w - 36) / 36.3)));
  return (
    <div ref={ref} className="w-full">
      {w > 0 ? <Calendar data={data} mode={mode} cell={cell} /> : null}
    </div>
  );
}

function Dumbbell({ data }: { data: Bundle }) {
  const { p2 } = data;
  const rows = p2.per_month;
  const lo = Math.min(...rows.flatMap((r) => [r.train_delay_rate, r.test_delay_rate])) * 0.9;
  const hi = Math.max(...rows.flatMap((r) => [r.train_delay_rate, r.test_delay_rate])) * 1.05;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  return (
    <div className="grid grid-flow-col grid-cols-2 grid-rows-6 gap-x-10 gap-y-3.5">
      {rows.map((r, i) => {
        const a = x(r.train_delay_rate);
        const b = x(r.test_delay_rate);
        return (
          <div key={r.month} className="grid grid-cols-[30px_1fr] items-center gap-2">
            <span className="text-[10.5px] text-ink-muted">{MONTHS[r.month - 1]}</span>
            <div className="relative h-3">
              <div className="absolute inset-y-[5px] left-0 right-0 rounded bg-ink/[0.03]" />
              <motion.div
                className="absolute top-[5px] h-[2px] bg-ink-muted/60"
                initial={{ left: `${a}%`, width: 0 }}
                animate={{ left: `${Math.min(a, b)}%`, width: `${Math.abs(a - b)}%` }}
                transition={{ delay: 1.2 + i * 0.05, duration: 0.6, ease: EASE }}
              />
              <motion.span
                className="absolute top-0 h-3 w-3 -translate-x-1/2 rounded-full ring-2 ring-panel"
                style={{ background: COLOR.s1, left: `${a}%` }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1.0 + i * 0.05 }}
              />
              <motion.span
                className="absolute top-0 h-3 w-3 -translate-x-1/2 rounded-full ring-2 ring-panel"
                style={{ background: COLOR.s2 }}
                initial={{ left: `${a}%`, scale: 0 }}
                animate={{ left: `${b}%`, scale: 1 }}
                transition={{ delay: 1.2 + i * 0.05, duration: 0.6, ease: EASE }}
              />
            </div>
          </div>
        );
      })}
      <p className="col-span-2 row-start-7 pt-1 text-right font-mono text-[10px] text-ink-muted">
        axis runs from {(lo * 100).toFixed(0)}% to {(hi * 100).toFixed(0)}% delay rate
      </p>
    </div>
  );
}

export default function Split({ data }: { data: Bundle }) {
  const { p2 } = data;
  const total = p2.train_rows + p2.test_rows;
  return (
    <Chapter
      step="03"
      kicker="Prepare · Split"
      title={<>Hold out whole days</>}
      takeaway={
        <>
          Twenty percent of flights are set aside as <b className="text-ink">entire calendar days</b>,
          six from every month. A day's storm can't leak from training into test, and no month is
          missing from training.
        </>
      }
      stats={[
        { label: "Training", value: p2.train_rows / 1e6, format: (v) => `${v.toFixed(2)}M` },
        { label: "Held out", value: p2.test_rows / 1e6, format: (v) => `${v.toFixed(2)}M`, accent: true, hint: `${((p2.test_rows / total) * 100).toFixed(0)}% of flights` },
      ]}
      points={[
        <>Split single flights at random and one bad day lands on <b className="text-ink">both</b> sides — the model gets the test half almost free.</>,
        <>Train on Jan–Sep and test on Nov–Dec and the model must guess at months it never saw. We report that too, at the end.</>,
        <>Delay rate: <b className="text-ink">{(p2.train_delay_rate * 100).toFixed(2)}%</b> training vs <b className="text-ink">{(p2.test_delay_rate * 100).toFixed(2)}%</b> test — the split isn't biased.</>,
      ]}
      drawer={{
        title: "The split, month by month",
        body: (
          <>
            <DrawerSection title="Held-out days">
              <DataTable
                head={["Month", "Days held out"]}
                rows={Object.entries(p2.test_days_by_month).map(([m, d]) => [MONTHS[Number(m) - 1], d.join(", ")])}
              />
            </DrawerSection>
            <DrawerSection title="Flights and delay rates">
              <DataTable
                head={["Month", "Train", "Test", "Train rate", "Test rate"]}
                rows={p2.per_month.map((r) => [
                  MONTHS[r.month - 1],
                  fmt(r.train_rows),
                  fmt(r.test_rows),
                  `${(r.train_delay_rate * 100).toFixed(1)}%`,
                  `${(r.test_delay_rate * 100).toFixed(1)}%`,
                ])}
              />
            </DrawerSection>
            <DrawerSection title="Guarantees the script asserts">
              <DataTable
                head={["Check", "Result"]}
                rows={[
                  ["A day on both sides", "never"],
                  ...Object.entries(p2.unseen_categories_in_test).map(([k, v]) => [`${k} unseen in training`, String(v)]),
                ]}
              />
            </DrawerSection>
          </>
        ),
      }}
      visualTitle="2015, with the held-out days lit"
      visualHint="One square per day. October is missing — removed in step 1."
      legend={<Legend items={[{ color: "rgba(42,120,214,0.45)", label: "training day" }, { color: COLOR.s2, label: "held-out day" }]} />}
      visual={
        <div className="flex h-full flex-col justify-center gap-10">
          <FitCalendar data={data} />
          <div className="border-t border-line pt-5">
            <div className="mb-3 flex items-baseline justify-between">
              <p className="text-[13px] font-semibold">Same delay rate on both sides, every month</p>
              <p className="text-[11.5px] text-ink-muted">
                <span style={{ color: COLOR.s1 }}>●</span> training days &nbsp;
                <span style={{ color: COLOR.s2 }}>●</span> held-out days
              </p>
            </div>
            <Dumbbell data={data} />
          </div>
        </div>
      }
    />
  );
}
