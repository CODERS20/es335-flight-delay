import { motion } from "framer-motion";
import type { Bundle } from "../lib/data";
import { COLOR, useSize } from "../lib/labels";
import { EASE } from "../lib/motion";
import { Chapter, DataTable, DrawerSection } from "../ui/kit";

function Calibration({ data }: { data: Bundle }) {
  const { p5 } = data;
  const { ref, w, h } = useSize<HTMLDivElement>();
  const pad = { l: 40, r: 14, t: 12, b: 36 };
  const sw = Math.max(w - pad.l - pad.r, 10);
  const side = Math.max(h - pad.t - pad.b, 10);
  const top = Math.max(...p5.calibration.map((c) => Math.max(c.mean_predicted, c.observed_rate))) + 0.08;
  const lim = Math.min(1, Math.ceil(top * 10) / 10);
  const x = (v: number) => pad.l + (v / lim) * sw;
  const y = (v: number) => pad.t + side - (v / lim) * side;
  const maxN = Math.max(...p5.calibration.map((c) => c.n));
  const d = p5.calibration.map((c, i) => `${i ? "L" : "M"}${x(c.mean_predicted)},${y(c.observed_rate)}`).join(" ");
  const ticks = Array.from({ length: Math.round(lim * 5) + 1 }, (_, i) => i * 0.2).filter((t) => t <= lim + 1e-9);

  return (
    <div ref={ref} className="absolute inset-0">
      {w > 0 ? (
        <svg width={w} height={h}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={pad.l + sw} y1={y(t)} y2={y(t)} stroke={COLOR.line} strokeDasharray="3 5" />
              <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize={10.5} fill={COLOR.muted} fontFamily="'JetBrains Mono', monospace">{t.toFixed(1)}</text>
              <text x={x(t)} y={pad.t + side + 16} textAnchor="middle" fontSize={10.5} fill={COLOR.muted} fontFamily="'JetBrains Mono', monospace">{t.toFixed(1)}</text>
            </g>
          ))}
          <text x={pad.l + sw / 2} y={pad.t + side + 32} textAnchor="middle" fontSize={11} fill={COLOR.muted}>what the model said</text>
          <text x={12} y={pad.t + side / 2} textAnchor="middle" fontSize={11} fill={COLOR.muted} transform={`rotate(-90 12 ${pad.t + side / 2})`}>what actually happened</text>

          <motion.line
            x1={x(0)} y1={y(0)} x2={x(lim)} y2={y(lim)}
            stroke={COLOR.soft} strokeDasharray="6 6" strokeWidth={1.5}
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, delay: 0.3 }}
          />
          <text x={x(lim) - 6} y={y(lim) + 16} textAnchor="end" fontSize={10.5} fill={COLOR.soft}>perfectly honest</text>

          {/* the gap between promise and outcome */}
          {p5.calibration.map((c, i) => (
            <motion.line
              key={`g-${c.bin}`}
              x1={x(c.mean_predicted)} x2={x(c.mean_predicted)}
              y1={y(c.mean_predicted)} y2={y(c.observed_rate)}
              stroke={COLOR.bad} strokeWidth={1.5} strokeDasharray="2 3" opacity={0.7}
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
              transition={{ delay: 1.4 + i * 0.06, duration: 0.4 }}
            />
          ))}

          <motion.path
            d={d} fill="none" stroke={COLOR.s3} strokeWidth={2.5}
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, delay: 0.6, ease: EASE }}
          />
          {p5.calibration.map((c, i) => (
            <motion.circle
              key={c.bin}
              cx={x(c.mean_predicted)} cy={y(c.observed_rate)}
              r={3 + Math.sqrt(c.n / maxN) * 9}
              fill={COLOR.s3} fillOpacity={0.85} stroke="#0B1122" strokeWidth={2}
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ delay: 0.7 + i * 0.08, type: "spring", stiffness: 260, damping: 16 }}
              style={{ transformOrigin: `${x(c.mean_predicted)}px ${y(c.observed_rate)}px` }}
            >
              <title>{`said ${(c.mean_predicted * 100).toFixed(0)}%, happened ${(c.observed_rate * 100).toFixed(0)}% (${c.n.toLocaleString()} flights)`}</title>
            </motion.circle>
          ))}
        </svg>
      ) : null}
    </div>
  );
}

function ByHour({ data }: { data: Bundle }) {
  const rows = data.p5.slices.find((s) => s.by === "Departure hour")?.rows ?? [];
  const max = Math.max(...rows.map((r) => r.actual_rate));
  const busy = rows.filter((r) => r.n > 5000);
  const lo = busy.reduce((a, b) => (a.actual_rate < b.actual_rate ? a : b));
  const hi = busy.reduce((a, b) => (a.actual_rate > b.actual_rate ? a : b));
  const avg = data.p5.test_delay_rate;
  return (
    <div className="flex h-full flex-col">
      <div className="relative flex min-h-0 flex-1 items-end gap-[3px] pt-6">
        {/* the average flight, for reference */}
        <div
          className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-ink-soft/70"
          style={{ bottom: `calc((100% - 24px) * ${(avg / max).toFixed(4)})` }}
        >
          <span className="absolute -top-5 left-0 rounded bg-panel/80 px-1 font-mono text-[10.5px] text-ink-soft">
            average {(avg * 100).toFixed(1)}%
          </span>
        </div>
        {rows.map((r, i) => {
          const share = r.actual_rate / max;
          const mark = r === lo || r === hi;
          return (
            <div key={r.group} className="group relative flex h-full flex-1 flex-col justify-end">
              {mark ? (
                <motion.span
                  className={`mb-1 text-center font-mono text-[11px] font-semibold ${r === hi ? "text-amber" : "text-ink"}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.4 }}
                >
                  {(r.actual_rate * 100).toFixed(1)}%
                </motion.span>
              ) : null}
              <motion.div
                className="rounded-t-md"
                style={{ background: `rgba(217,89,38,${0.25 + share * 0.75})` }}
                initial={{ height: 0 }}
                animate={{ height: `${share * 100}%` }}
                transition={{ delay: 0.5 + i * 0.035, duration: 0.7, ease: EASE }}
                title={`${r.group}: ${(r.actual_rate * 100).toFixed(1)}% late`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[3px]">
        {rows.map((r, i) => (
          <span key={r.group} className="flex-1 text-center font-mono text-[9.5px] text-ink-muted">
            {i % 3 === 0 ? r.group.slice(0, 2) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Errors({ data }: { data: Bundle }) {
  const { p5 } = data;
  const hours = p5.slices.find((s) => s.by === "Departure hour")?.rows ?? [];
  const busy = hours.filter((h) => h.n > 5000);
  const low = busy.reduce((a, b) => (a.actual_rate < b.actual_rate ? a : b));
  const high = busy.reduce((a, b) => (a.actual_rate > b.actual_rate ? a : b));

  return (
    <Chapter
      step="09"
      kicker="Evaluate · Honesty & failure"
      title={<>Where it is right, and where it isn't</>}
      takeaway={
        <>
          A good model's probabilities should mean what they say. Ours rank flights well but run{" "}
          <b className="text-ink">a little hot in the riskiest band</b>. And risk is not spread evenly:
          it builds through the day as delays cascade.
        </>
      }
      stats={[
        { label: "Worst gap", value: p5.calibration_worst_gap * 100, format: (v) => `${v.toFixed(0)} pts`, hint: "between stated and actual rate" },
        { label: `Late at ${low.group}`, value: low.actual_rate * 100, format: (v) => `${v.toFixed(1)}%` },
        { label: `Late at ${high.group}`, value: high.actual_rate * 100, format: (v) => `${v.toFixed(1)}%`, accent: true },
      ]}
      points={[
        <>An evening flight inherits every delay that happened upstream of it earlier in the day.</>,
        <>The model can't see weather or the inbound aircraft — the reasons behind its confident misses.</>,
        <>Evening flights are riskier; evening doesn't <i>cause</i> delay. This is association, not causation.</>,
      ]}
      drawer={{
        title: "Errors in detail",
        body: (
          <>
            <DrawerSection title="Calibration — said vs happened">
              <DataTable
                head={["Score band", "Said", "Happened", "Flights"]}
                rows={p5.calibration.map((c) => [c.bin, c.mean_predicted.toFixed(3), c.observed_rate.toFixed(3), c.n.toLocaleString("en-US")])}
              />
            </DrawerSection>
            {p5.slices.map((s) => (
              <DrawerSection key={s.by} title={`By ${s.by.toLowerCase()}`}>
                <DataTable
                  head={[s.by, "Flights", "Late", "Recall", "Precision"]}
                  rows={s.rows.map((r) => [r.group, r.n.toLocaleString("en-US"), `${(r.actual_rate * 100).toFixed(1)}%`, `${(r.recall * 100).toFixed(0)}%`, `${(r.precision * 100).toFixed(0)}%`])}
                />
              </DrawerSection>
            ))}
          </>
        ),
      }}
      visual={
        <div className="grid h-full grid-cols-2 gap-8">
          <div className="flex min-h-0 flex-col">
            <p className="text-[13px] font-semibold">Are the probabilities honest?</p>
            <p className="mb-2 text-[11.5px] text-ink-muted">Each dot is a group of flights; on the dashed line, a stated chance comes true exactly that often.</p>
            <div className="relative min-h-0 flex-1"><Calibration data={data} /></div>
          </div>
          <div className="flex min-h-0 flex-col">
            <p className="text-[13px] font-semibold">Risk climbs through the day</p>
            <p className="mb-4 text-[11.5px] text-ink-muted">Share of held-out flights arriving 15+ minutes late, by scheduled departure hour</p>
            <div className="min-h-0 flex-1"><ByHour data={data} /></div>
          </div>
        </div>
      }
    />
  );
}
