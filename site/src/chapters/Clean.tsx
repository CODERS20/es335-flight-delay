import { motion } from "framer-motion";
import { Database, FileCheck2 } from "lucide-react";
import type { Bundle } from "../lib/data";
import { COLOR, MONTHS } from "../lib/labels";
import { EASE } from "../lib/motion";
import { Chapter, DataTable, DrawerSection } from "../ui/kit";

const fmt = (n: number) => n.toLocaleString("en-US");

function Funnel({ data }: { data: Bundle }) {
  const { p1 } = data;
  const raw = p1.rows_raw;
  const LABEL: Record<string, string> = {
    "cancelled flights": "Cancelled",
    "diverted flights": "Diverted",
    "missing arrival delay": "No arrival delay",
  };
  const steps = p1.cleaning_log.filter((s) => s.rows_removed > 0);

  return (
    <div className="flex h-full flex-col">
      {/* the flow */}
      <div className="flex flex-1 flex-col justify-around">
        <Row
          icon={<Database className="h-4 w-4" />}
          label="Raw file"
          sub="flights.csv, 31 columns"
          value={raw}
          widthPct={100}
          color={COLOR.s1}
          delay={0.1}
        />

        {steps.map((s, i) => {
          const before = s.rows_left + s.rows_removed;
          const name = s.step.startsWith("month") ? "All of October" : LABEL[s.step] ?? s.step;
          return (
            <Row
              key={s.step}
              label={`− ${name}`}
              note={`−${fmt(s.rows_removed)}`}
              sub={s.reason}
              value={s.rows_left}
              widthPct={(before / raw) * 100}
              removedPct={(s.rows_removed / raw) * 100}
              removed={s.rows_removed}
              color="rgba(42,120,214,0.82)"
              delay={0.45 + i * 0.35}
            />
          );
        })}

        <Row
          icon={<FileCheck2 className="h-4 w-4" />}
          label="Clean dataset"
          sub="flights_clean.csv — every later step reads only this"
          value={p1.rows_clean}
          widthPct={(p1.rows_clean / raw) * 100}
          color={COLOR.s3}
          delay={0.45 + steps.length * 0.35 + 0.2}
          final
        />
      </div>

      {/* the October defect */}
      <div className="mt-6 border-t border-line pt-5">
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-[13px] font-semibold">Airport codes, month by month</p>
          <p className="text-[11.5px] text-ink-muted">checked over all 5.8M rows, not sampled</p>
        </div>
        <div className="grid grid-cols-12 gap-1.5">
          {MONTHS.map((m, i) => {
            const fmtInfo = p1.airport_code_format_by_month[String(i + 1)];
            const bad = (fmtInfo?.pct_numeric_codes ?? 0) > 50;
            return (
              <motion.div
                key={m}
                initial={{ opacity: 0, y: 10 }}
                animate={
                  bad
                    ? { opacity: 1, y: 0, x: [0, -3, 3, -2, 2, 0] }
                    : { opacity: 1, y: 0 }
                }
                transition={{
                  delay: 1.8 + i * 0.05,
                  duration: bad ? 0.6 : 0.4,
                  ease: EASE,
                }}
                className={`rounded border px-1 py-2 text-center ${
                  bad ? "border-bad/60 bg-bad/15" : "border-line bg-ink/[0.025]"
                }`}
              >
                <p className={`text-[11px] font-semibold ${bad ? "text-[#B42318]" : "text-ink-soft"}`}>{m}</p>
                <p className={`mt-0.5 font-mono text-[10px] ${bad ? "text-[#B42318]" : "text-ink-muted"}`}>
                  {bad ? "1234" : "ATL"}
                </p>
              </motion.div>
            );
          })}
        </div>
        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-muted">
          October names airports by numeric id, every other month by letter code — and{" "}
          <span className="font-mono text-ink-soft">airports.csv</span> has no column to translate
          them. Keeping it would add hundreds of airports that exist in no other month.
        </p>
      </div>
    </div>
  );
}

function Row({
  icon,
  note,
  label,
  sub,
  value,
  widthPct,
  removedPct,
  color,
  delay,
  final,
}: {
  icon?: React.ReactNode;
  note?: string;
  label: string;
  sub: string;
  value: number;
  widthPct: number;
  removedPct?: number;
  removed?: number;
  color: string;
  delay: number;
  final?: boolean;
}) {
  // Show the removed slice at a readable minimum width: some removals are a
  // fraction of a percent of the file.
  const slice = removedPct !== undefined ? Math.max(removedPct, 2.2) : 0;
  return (
    <div className="grid grid-cols-[230px_1fr] items-center gap-5">
      <div className="min-w-0">
        <p className={`flex items-center gap-2 text-[13.5px] font-semibold ${final ? "text-[#0B7A43]" : "text-ink"}`}>
          {icon}
          {label}
          {note ? (
            <span className="ml-auto font-mono text-[12px] font-semibold text-[#C2471A]">{note}</span>
          ) : null}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-muted">{sub}</p>
      </div>
      <div className="relative h-12">
        <motion.div
          className={`absolute inset-y-0 left-0 flex items-center rounded px-3 `}
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${widthPct - (removedPct ? slice : 0)}%` }}
          transition={{ duration: 0.9, delay, ease: EASE }}
        >
          <span className={`tabular whitespace-nowrap font-mono text-[13px] font-semibold ${final ? "text-ink" : "text-white"}`}>
            {value.toLocaleString("en-US")}
          </span>
        </motion.div>
        {removedPct !== undefined ? (
          <motion.div
            className="absolute inset-y-0 flex items-center rounded bg-s2"
            style={{ left: `${widthPct - slice}%`, width: `${slice}%` }}
            initial={{ opacity: 0, x: 0 }}
            animate={{ opacity: [0, 1, 1, 0.9], x: [0, 0, 0, 12] }}
            transition={{ duration: 1.2, delay: delay + 0.5, times: [0, 0.2, 0.6, 1], ease: EASE }}
          >

          </motion.div>
        ) : null}
      </div>
    </div>
  );
}

export default function Clean({ data }: { data: Bundle }) {
  const { p1 } = data;
  const removed = p1.rows_raw - p1.rows_clean;
  return (
    <Chapter
      step="01"
      kicker="Prepare · Clean"
      title={<>One clean dataset</>}
      takeaway={
        <>
          A flight that never arrives has no arrival delay to learn from, and one
          month of the file is written in a different language. Both go — and
          everything after this reads only the clean file.
        </>
      }
      stats={[
        { label: "Raw", value: p1.rows_raw / 1e6, format: (v) => `${v.toFixed(2)}M` },
        { label: "Removed", value: removed / 1000, format: (v) => `${Math.round(v)}K`, hint: `${fmt(removed)} rows · ${((removed / p1.rows_raw) * 100).toFixed(1)}%` },
        { label: "Kept", value: p1.rows_clean / 1e6, format: (v) => `${v.toFixed(2)}M`, accent: true },
      ]}
      points={[
        <>Label: arrival delay of <b className="text-ink">15 minutes or more</b> — the official BTS definition, not ours.</>,
        <>Overall, <b className="text-ink">{(p1.target.delay_rate_overall * 100).toFixed(1)}%</b> of flights are late. That is the bar a model has to beat.</>,
      ]}
      drawer={{
        title: "Cleaning, step by step",
        body: (
          <>
            <DrawerSection title="Rows removed">
              <DataTable
                head={["Step", "Removed", "Left"]}
                rows={[
                  ["Raw file", "—", fmt(p1.rows_raw)],
                  ...p1.cleaning_log.map((l) => [l.step, fmt(l.rows_removed), fmt(l.rows_left)]),
                ]}
              />
            </DrawerSection>
            <DrawerSection title="Airport code format by month">
              <DataTable
                head={["Month", "Flights", "Numeric codes"]}
                rows={Object.entries(p1.airport_code_format_by_month).map(([m, v]) => [
                  MONTHS[Number(m) - 1],
                  fmt(v.rows),
                  `${v.pct_numeric_codes.toFixed(0)}%`,
                ])}
              />
            </DrawerSection>
            <DrawerSection title="Other checks">
              <DataTable
                head={["Check", "Result"]}
                rows={[
                  ["Missing scheduled durations", fmt(p1.scheduled_time_missing)],
                  ["Filled with (training median)", `${p1.scheduled_time_median_train.toFixed(0)} min`],
                  ["Rows with identical features", fmt(p1.identical_feature_rows)],
                  ["Kept?", "Yes — the same leg on different dates is a different flight"],
                ]}
              />
            </DrawerSection>
          </>
        ),
      }}
      visualTitle="From raw file to clean dataset"
      visualHint="Each bar is the data left after a step; the orange slice is what that step removed."
      visual={<Funnel data={data} />}
    />
  );
}
