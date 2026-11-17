import { animate, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Bundle } from "../lib/data";
import { COLOR, FEATURE_LABEL } from "../lib/labels";
import { EASE, rise, stagger } from "../lib/motion";
import { contributions, scoreFlight } from "../lib/score";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* ------------------------------------------------------------------ gauge */

const START = 135; // degrees, measured clockwise from three o'clock
const SWEEP = 270;

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M${a.x},${a.y} A${r},${r} 0 ${large} 1 ${b.x},${b.y}`;
}

function Gauge({ value, threshold }: { value: number; threshold: number }) {
  const size = 300;
  const c = size / 2;
  const r = 118;
  const spring = useSpring(0, { stiffness: 90, damping: 18 });
  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  const pct = useTransform(spring, (v) => `${(v * 100).toFixed(1)}`);
  const needle = useTransform(spring, (v) => START + SWEEP * Math.min(Math.max(v, 0), 1));
  const tip = useTransform(needle, (d) => {
    const p = polar(c, c, r, d);
    return `translate(${p.x}px, ${p.y}px)`;
  });

  const thrDeg = START + SWEEP * threshold;
  const t1 = polar(c, c, r - 18, thrDeg);
  const t2 = polar(c, c, r + 14, thrDeg);
  const tl = polar(c, c, r + 26, thrDeg);
  const anchor = Math.cos((thrDeg * Math.PI) / 180) < -0.2 ? "end" : Math.cos((thrDeg * Math.PI) / 180) > 0.2 ? "start" : "middle";
  const over = value >= threshold;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="overflow-visible">
        <defs>
          <linearGradient id="gauge" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={COLOR.s1} />
            <stop offset="55%" stopColor={COLOR.accent} />
            <stop offset="100%" stopColor={COLOR.s2} />
          </linearGradient>
        </defs>
        {/* scale ticks */}
        {Array.from({ length: 11 }, (_, i) => {
          const d = START + (SWEEP * i) / 10;
          const a = polar(c, c, r + 16, d);
          const b = polar(c, c, r + 21, d);
          return (
            <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={COLOR.muted} strokeWidth={1.2} />
          );
        })}
        <path d={arc(c, c, r, START, START + SWEEP)} fill="none" stroke="rgba(120,114,100,0.12)" strokeWidth={18} strokeLinecap="round" />
        <motion.path
          d={arc(c, c, r, START, START + SWEEP)}
          fill="none"
          stroke="url(#gauge)"
          strokeWidth={18}
          strokeLinecap="round"
          style={{ pathLength: spring }}
        />
        {/* the decision cut-off */}
        <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke={COLOR.accent} strokeWidth={2.5} strokeLinecap="round" />
        <text x={tl.x} y={tl.y} fill={COLOR.accent} fontSize={10.5} textAnchor={anchor} dominantBaseline="middle" fontFamily="'JetBrains Mono', monospace">
          cut-off
        </text>
        {/* the needle tip */}
        <motion.circle r={9} fill="#FFFFFF" stroke={COLOR.ink} strokeWidth={3} style={{ transform: tip }} />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="font-mono text-[60px] font-semibold leading-none tracking-tight">
          <motion.span className="tabular">{pct}</motion.span>
          <span className="text-[28px] text-ink-muted">%</span>
        </p>
        <p className="mt-2 text-[12px] text-ink-muted">chance of a 15+ minute delay</p>
        <motion.span
          key={String(over)}
          initial={{ opacity: 0, y: 6, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className={`mt-3 rounded-full px-3 py-1 text-[11.5px] font-semibold ring-1 ${
            over
              ? "bg-s2/15 text-[#C2471A] ring-s2/40"
              : "bg-s1/15 text-[#1F5FAF] ring-s1/40"
          }`}
        >
          {over ? "Flagged as likely late" : "Not flagged"}
        </motion.span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- the reasons */

function Reasons({ parts }: { parts: { feature: string; value: number }[] }) {
  const max = Math.max(...parts.map((p) => Math.abs(p.value)), 0.0001);
  return (
    <ul className="flex h-full flex-col justify-between">
      {parts.map((p) => {
        const w = (Math.abs(p.value) / max) * 50;
        const up = p.value >= 0;
        return (
          <motion.li layout key={p.feature} className="grid grid-cols-[118px_1fr_54px] items-center gap-3">
            <span className="truncate text-[12.5px] text-ink-soft">{FEATURE_LABEL[p.feature] ?? p.feature}</span>
            <span className="relative h-[14px] rounded-full bg-ink/[0.035]">
              <span className="absolute left-1/2 top-[-3px] h-[20px] w-px bg-line-strong" />
              <motion.span
                className="absolute top-0 h-full rounded-full"
                style={{
                  background: up ? COLOR.s2 : COLOR.s1,
                  [up ? "left" : "right"]: "50%",
                }}
                initial={{ width: 0 }}
                animate={{ width: `${w}%` }}
                transition={{ duration: 0.7, ease: EASE }}
              />
            </span>
            <span className={`tabular text-right font-mono text-[11.5px] ${up ? "text-[#C2471A]" : "text-[#1F5FAF]"}`}>
              {up ? "+" : "−"}
              {Math.abs(p.value).toFixed(2)}
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------------- chapter */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

const input =
  "w-full rounded border border-line-strong bg-ink/[0.03] px-3.5 py-2.5 text-[13.5px] text-ink transition hover:border-ink/25 focus:border-accent/60";

export default function Predict({ data }: { data: Bundle }) {
  const { options, p4, p5 } = data;
  const model = p4.browser_model;
  const origins = useMemo(() => Object.keys(options.routes).sort(), [options]);
  const cityOf = useMemo(() => {
    const m: Record<string, string> = {};
    options.airports.forEach((a) => (m[a.code] = a.city));
    return m;
  }, [options]);

  const [carrier, setCarrier] = useState(options.airlines[0]?.code ?? "");
  const [origin, setOrigin] = useState(origins.includes("ORD") ? "ORD" : origins[0]);
  const dests = Object.keys(options.routes[origin] ?? {}).sort();
  const [destRaw, setDest] = useState("LAX");
  const dest = dests.includes(destRaw) ? destRaw : dests[0];
  const [hour, setHour] = useState(19);
  const [dow, setDow] = useState(5);
  const [month, setMonth] = useState(12);

  const route = options.routes[origin]?.[dest];
  const flight = useMemo(() => {
    if (!route) return null;
    const [distance, hours] = route;
    return {
      AIRLINE: carrier,
      ORIGIN_AIRPORT: origin,
      DESTINATION_AIRPORT: dest,
      SCHED_DEP_HOUR: hour,
      SCHED_ARR_HOUR: (hour + hours) % 24,
      DISTANCE: distance,
      MONTH: month,
      DAY: 15,
      DAY_OF_WEEK: dow,
    } as Record<string, string | number>;
  }, [route, carrier, origin, dest, hour, dow, month]);

  const p = flight ? scoreFlight(model, flight) : 0;
  const parts = flight
    ? contributions(model, flight).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    : [];
  const avg = p5.test_delay_rate;

  // a gentle count on the "times the average" figure
  const rel = useMotionValue(0);
  const [relText, setRelText] = useState("0.00");
  useEffect(() => {
    const c = animate(rel, p / avg, { duration: 0.6, ease: EASE, onUpdate: (v) => setRelText(v.toFixed(2)) });
    return () => c.stop();
  }, [p, avg, rel]);

  return (
    <div className="grid h-full grid-cols-[minmax(360px,0.86fr)_1.4fr] gap-7 px-9 pb-3 pt-8">
      {/* inputs */}
      <motion.div variants={stagger(0.06, 0.1)} initial="hidden" animate="show" className="flex min-h-0 flex-col justify-center gap-5">
        <motion.p variants={rise} className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
          Try it · runs in your browser
        </motion.p>
        <motion.h1 variants={rise} className="font-display text-[clamp(30px,3.1vw,44px)] font-bold leading-[1.04] tracking-[-0.03em]">
          Score a real flight
        </motion.h1>
        <motion.p variants={rise} className="max-w-[46ch] text-[14.5px] leading-relaxed text-ink-soft">
          Pick a route and a time. The model's own coefficients run right here,
          checked against the Python version to within{" "}
          <span className="whitespace-nowrap font-mono text-ink">{model.verified_max_abs_error.toExponential(0)}</span>.
        </motion.p>

        <motion.div variants={rise} className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <Field label="Airline">
            <select className={input} value={carrier} onChange={(e) => setCarrier(e.target.value)}>
              {options.airlines.map((a) => (
                <option key={a.code} value={a.code}>{a.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Month">
            <select className={input} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12].map((m) => (
                <option key={m} value={m}>{MONTH_NAMES[m - 1]}</option>
              ))}
            </select>
          </Field>
          <Field label="From">
            <select className={input} value={origin} onChange={(e) => setOrigin(e.target.value)}>
              {origins.map((o) => (
                <option key={o} value={o}>{o} · {cityOf[o] ?? ""}</option>
              ))}
            </select>
          </Field>
          <Field label="To">
            <select className={input} value={dest} onChange={(e) => setDest(e.target.value)}>
              {dests.map((d) => (
                <option key={d} value={d}>{d} · {cityOf[d] ?? ""}</option>
              ))}
            </select>
          </Field>
          <Field label="Departs">
            <select className={input} value={hour} onChange={(e) => setHour(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
              ))}
            </select>
          </Field>
          <Field label="Day">
            <select className={input} value={dow} onChange={(e) => setDow(Number(e.target.value))}>
              {DAYS.map((d, i) => (
                <option key={d} value={i + 1}>{d}</option>
              ))}
            </select>
          </Field>
        </motion.div>

        {route ? (
          <motion.p variants={rise} className="text-[12px] text-ink-muted">
            {origin} → {dest}: <span className="text-ink-soft">{route[0].toLocaleString()} miles</span>,
            about <span className="text-ink-soft">{route[1]} h</span> on the clock — taken from this
            route's own training flights, so the model is never asked about a flight that cannot exist.
          </motion.p>
        ) : null}

        <motion.p variants={rise} className="flex gap-2.5 rounded border border-accent/20 bg-accent/[0.06] px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-soft">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none text-accent" />
          An estimate from 2015 schedule data, not a promise. The model cannot see weather or a
          late inbound aircraft — the two biggest real causes of delay.
        </motion.p>
      </motion.div>

      {/* output */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.7, delay: 0.2, ease: EASE } }}
        className="panel grid min-h-0 grid-rows-[auto_1fr] gap-5 p-7"
      >
        <div className="flex items-center justify-around gap-6">
          <Gauge value={p} threshold={p4.threshold} />
          <div className="max-w-[260px] space-y-5">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Versus the average flight</p>
              <p className="tabular mt-1 font-mono text-[34px] font-semibold leading-none text-accent">{relText}×</p>
              <p className="mt-1.5 text-[12px] text-ink-muted">
                the average held-out flight is late {(avg * 100).toFixed(1)}% of the time
              </p>
            </div>
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Decision cut-off</p>
              <p className="tabular mt-1 font-mono text-[22px] font-semibold leading-none">{(p4.threshold * 100).toFixed(1)}%</p>
              <p className="mt-1.5 text-[12px] text-ink-muted">
                chosen during cross-validation, frozen before the test set was opened
              </p>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col border-t border-line pt-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-[15px] font-semibold">What moved this estimate</h2>
            <p className="text-[11.5px] text-ink-muted">
              <span className="text-[#1F5FAF]">◀ lowers risk</span>
              <span className="mx-2 opacity-40">|</span>
              <span className="text-[#C2471A]">raises risk ▶</span>
            </p>
          </div>
          <div className="min-h-0 flex-1 pb-1">
            <Reasons parts={parts} />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
