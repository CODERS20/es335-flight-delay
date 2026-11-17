import { motion, useSpring, useTransform } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Bundle } from "../lib/data";
import { COLOR, useSize } from "../lib/labels";
import { Chapter, DataTable, DrawerSection, Legend } from "../ui/kit";

/** A number that glides to its new value instead of jumping. */
function Glide({ value, format }: { value: number; format: (v: number) => string }) {
  const s = useSpring(value, { stiffness: 120, damping: 20 });
  useEffect(() => {
    s.set(value);
  }, [value, s]);
  const text = useTransform(s, format);
  return <motion.span className="tabular">{text}</motion.span>;
}

function Curves({
  sweep,
  t,
  chosen,
}: {
  sweep: Bundle["p3"]["threshold_sweep"];
  t: number;
  chosen: number;
}) {
  const { ref, w, h } = useSize<HTMLDivElement>();
  const pad = { l: 40, r: 16, t: 14, b: 30 };
  const iw = Math.max(w - pad.l - pad.r, 10);
  const ih = Math.max(h - pad.t - pad.b, 10);
  const x = (v: number) => pad.l + v * iw;
  const y = (v: number) => pad.t + ih - v * ih;
  const line = (key: "precision" | "recall" | "balance") =>
    sweep.map((s, i) => `${i ? "L" : "M"}${x(s.t).toFixed(1)},${y(s[key]).toFixed(1)}`).join(" ");

  const series = [
    { key: "precision" as const, color: COLOR.s1 },
    { key: "recall" as const, color: COLOR.s2 },
    { key: "balance" as const, color: COLOR.s3 },
  ];

  return (
    <div ref={ref} className="absolute inset-0">
      {w > 0 ? (
        <svg width={w} height={h}>
          {[0, 0.25, 0.5, 0.75, 1].map((g) => (
            <g key={g}>
              <line x1={pad.l} x2={pad.l + iw} y1={y(g)} y2={y(g)} stroke={COLOR.line} strokeDasharray="3 5" />
              <text x={pad.l - 8} y={y(g) + 4} textAnchor="end" fontSize={10.5} fill={COLOR.muted} fontFamily="'JetBrains Mono', monospace">
                {g.toFixed(2)}
              </text>
            </g>
          ))}
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((g) => (
            <text key={g} x={x(g)} y={pad.t + ih + 20} textAnchor="middle" fontSize={10.5} fill={COLOR.muted} fontFamily="'JetBrains Mono', monospace">
              {g.toFixed(1)}
            </text>
          ))}

          {series.map((s, i) => (
            <motion.path
              key={s.key}
              d={line(s.key)}
              fill="none"
              stroke={s.color}
              strokeWidth={2.4}
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.4, delay: 0.3 + i * 0.2, ease: [0.16, 1, 0.3, 1] }}
            />
          ))}

          {/* the chosen cut-off */}
          <line x1={x(chosen)} x2={x(chosen)} y1={pad.t} y2={pad.t + ih} stroke={COLOR.amber} strokeDasharray="4 4" strokeWidth={1.5} opacity={0.7} />
          <text x={x(chosen) + 6} y={pad.t + 10} fontSize={10.5} fill={COLOR.amber}>chosen</text>

          {/* where the slider is */}
          <motion.line
            y1={pad.t}
            y2={pad.t + ih}
            stroke={COLOR.ink}
            strokeWidth={2}
            initial={{ x1: x(t), x2: x(t) }}
            animate={{ x1: x(t), x2: x(t) }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
          />
          {series.map((s) => {
            const pt = sweep.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
            return (
              <motion.circle
                key={s.key}
                r={5.5}
                fill={s.color}
                stroke="#0B1122"
                strokeWidth={2}
                initial={{ cx: x(pt.t), cy: y(pt[s.key]) }}
                animate={{ cx: x(pt.t), cy: y(pt[s.key]) }}
                transition={{ type: "spring", stiffness: 260, damping: 30 }}
              />
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}

function Matrix({ c, total }: { c: { tp: number; fp: number; fn: number; tn: number }; total: number }) {
  const cells = [
    { k: "Caught", sub: "late, flagged", v: c.tp, good: true },
    { k: "Missed", sub: "late, not flagged", v: c.fn, good: false },
    { k: "False alarms", sub: "on time, flagged", v: c.fp, good: false },
    { k: "Correctly cleared", sub: "on time, not flagged", v: c.tn, good: true },
  ];
  return (
    <div className="grid h-full grid-cols-2 gap-2.5">
      {cells.map((cell) => (
        <div
          key={cell.k}
          className={`relative flex flex-col justify-between overflow-hidden rounded-2xl border p-3.5 ${
            cell.good ? "border-good/30 bg-good/[0.07]" : "border-bad/30 bg-bad/[0.07]"
          }`}
        >
          <motion.div
            className={`absolute inset-x-0 bottom-0 ${cell.good ? "bg-good/15" : "bg-bad/15"}`}
            animate={{ height: `${(cell.v / total) * 100}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 22 }}
          />
          <p className={`relative text-[11px] font-semibold uppercase tracking-[0.1em] ${cell.good ? "text-[#5CD6A5]" : "text-[#FF8A8D]"}`}>
            {cell.k}
          </p>
          <div className="relative">
            <p className="font-mono text-[24px] font-semibold leading-none">
              <Glide value={cell.v} format={(v) => Math.round(v).toLocaleString("en-US")} />
            </p>
            <p className="mt-1 text-[11px] text-ink-muted">{cell.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Explorer({ data }: { data: Bundle }) {
  const { p3 } = data;
  const sweep = p3.threshold_sweep;
  const chosen = p3.threshold.value;
  const start = useMemo(
    () => sweep.reduce((bi, s, i) => (Math.abs(s.t - chosen) < Math.abs(sweep[bi].t - chosen) ? i : bi), 0),
    [sweep, chosen],
  );
  const [i, setI] = useState(start);
  const s = sweep[i];
  const total = s.tp + s.fp + s.fn + s.tn;
  const flagged = (s.tp + s.fp) / total;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* the control */}
      <div className="flex items-center gap-5 rounded-2xl border border-line bg-white/[0.02] px-5 py-3.5">
        <div className="w-[118px] flex-none">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Cut-off</p>
          <p className="font-mono text-[26px] font-semibold leading-none text-amber">
            <Glide value={s.t} format={(v) => v.toFixed(2)} />
          </p>
        </div>
        <input
          type="range"
          min={0}
          max={sweep.length - 1}
          step={1}
          value={i}
          onChange={(e) => setI(Number(e.target.value))}
          aria-label="Decision threshold"
          className="flex-1"
        />
        <button
          type="button"
          onClick={() => setI(start)}
          className="flex flex-none items-center gap-1.5 rounded-full border border-line-strong px-3 py-1.5 text-[12px] text-ink-soft transition hover:border-amber/50 hover:text-ink"
        >
          <RotateCcw className="h-3.5 w-3.5" /> chosen
        </button>
      </div>

      {/* what it means, in words */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { k: "Flights flagged", v: flagged, c: COLOR.ink },
          { k: "Delays caught (recall)", v: s.recall, c: "#FF9466" },
          { k: "Flags that are right (precision)", v: s.precision, c: "#8EC0FF" },
        ].map((m) => (
          <div key={m.k} className="rounded-2xl border border-line bg-white/[0.02] px-4 py-3">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{m.k}</p>
            <p className="mt-1 font-mono text-[24px] font-semibold leading-none" style={{ color: m.c }}>
              <Glide value={m.v * 100} format={(v) => `${v.toFixed(1)}%`} />
            </p>
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[1.3fr_1fr] gap-4">
        <div className="relative min-h-0">
          <Curves sweep={sweep} t={s.t} chosen={chosen} />
        </div>
        <Matrix c={s} total={total} />
      </div>
    </div>
  );
}

export default function Threshold({ data }: { data: Bundle }) {
  const { p3 } = data;
  return (
    <Chapter
      step="06"
      kicker="Train · Decision threshold"
      title={<>Where do we draw the line?</>}
      takeaway={
        <>
          The model gives a probability; acting on it needs a cut-off. Lower it and you catch more
          delays but raise more false alarms. <b className="text-ink">Drag the slider</b> to feel the trade-off.
        </>
      }
      stats={[
        { label: "Chosen cut-off", value: p3.threshold.value, format: (v) => v.toFixed(3), accent: true },
        { label: "Recall there", value: p3.threshold.recall * 100, format: (v) => `${v.toFixed(1)}%` },
        { label: "Precision", value: p3.threshold.precision * 100, format: (v) => `${v.toFixed(1)}%` },
      ]}
      points={[
        <>Chosen where precision and recall are <b className="text-ink">best balanced</b> — the rule we fixed in our proposal.</>,
        <>Measured on the cross-validation predictions, then <b className="text-ink">frozen</b> before any test flight was read.</>,
      ]}
      drawer={{
        title: "Every cut-off we measured",
        body: (
          <DrawerSection title="On the 400,000 cross-validation predictions">
            <DataTable
              head={["Cut-off", "Precision", "Recall", "Balance", "Flagged"]}
              rows={p3.threshold_sweep
                .filter((s) => Math.round(s.t * 100) % 5 === 0)
                .map((s) => [
                  s.t.toFixed(2),
                  s.precision.toFixed(3),
                  s.recall.toFixed(3),
                  s.balance.toFixed(3),
                  (s.tp + s.fp).toLocaleString("en-US"),
                ])}
            />
          </DrawerSection>
        ),
      }}
      visualTitle="Move the cut-off, see the cost"
      visualHint="All numbers here come from the cross-validation predictions — the test set was still sealed when this choice was made."
      legend={<Legend items={[{ color: COLOR.s1, label: "precision" }, { color: COLOR.s2, label: "recall" }, { color: COLOR.s3, label: "balance" }]} />}
      visual={<Explorer data={data} />}
    />
  );
}
