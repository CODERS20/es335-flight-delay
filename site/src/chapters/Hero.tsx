import { motion } from "framer-motion";
import { ArrowRight, Gauge } from "lucide-react";
import type { Bundle } from "../lib/data";
import { rise, stagger, useCountUp } from "../lib/motion";
import FlightMap from "../visuals/FlightMap";

function BigStat({
  value,
  format,
  label,
  accent,
}: {
  value: number;
  format: (v: number) => string;
  label: string;
  accent?: boolean;
}) {
  const { ref, value: v } = useCountUp(value, 1.8, 0.6);
  return (
    <motion.div variants={rise}>
      <p
        className={`tabular font-mono text-[38px] font-semibold leading-none tracking-tight ${
          accent ? "text-amber" : "text-ink"
        }`}
      >
        <span ref={ref}>{format(v)}</span>
      </p>
      <p className="mt-2 max-w-[18ch] text-[12.5px] leading-snug text-ink-muted">{label}</p>
    </motion.div>
  );
}

export default function Hero({ data }: { data: Bundle }) {
  const gb = data.p5.results[data.p5.chosen_model];

  return (
    <div className="relative h-full overflow-hidden">
      {/* the map fills the stage; the text sits over its western edge */}
      <div className="absolute bottom-[9%] left-[44%] right-[2%] top-[7%]">
        <FlightMap options={data.options} />
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[50%] bg-gradient-to-r from-bg via-bg/80 to-transparent" />

      <motion.div
        variants={stagger(0.09, 0.2)}
        initial="hidden"
        animate="show"
        className="relative z-10 flex h-full max-w-[640px] flex-col justify-center px-12"
      >
        <motion.p
          variants={rise}
          className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber"
        >
          ES 335 · Machine Learning · 2026
        </motion.p>

        <motion.h1
          variants={rise}
          className="mt-5 font-display text-[clamp(48px,5.6vw,80px)] font-bold leading-[0.95] tracking-[-0.045em]"
        >
          Will this flight
          <br />
          be <span className="text-amber">late?</span>
        </motion.h1>

        <motion.p variants={rise} className="mt-6 max-w-[48ch] text-[16.5px] leading-relaxed text-ink-soft">
          Predicting whether a US domestic flight in 2015 arrives more than 15
          minutes late — using only what is known <em className="text-ink not-italic">before it departs</em>.
          No weather, no live data: just the schedule.
        </motion.p>

        <motion.p variants={rise} className="mt-5 text-[13px] text-ink-muted">
          <span className="text-ink-soft">Divya Saini</span> 25110110
          <span className="mx-2 opacity-50">·</span>
          <span className="text-ink-soft">Shikha Ajeet Singh</span> 25110292
        </motion.p>

        <motion.div variants={stagger(0.12, 0.1)} className="mt-9 grid grid-cols-3 gap-6">
          <BigStat
            value={data.p1.rows_clean / 1e6}
            format={(v) => `${v.toFixed(2)}M`}
            label="flights studied, after cleaning"
          />
          <BigStat
            value={gb.ratio_to_base_rate}
            format={(v) => `${v.toFixed(2)}×`}
            label="better than guessing, on unseen flights"
            accent
          />
          <BigStat
            value={gb.recall * 100}
            format={(v) => `${v.toFixed(1)}%`}
            label="of genuinely late flights caught"
          />
        </motion.div>

        <motion.div variants={rise} className="mt-10 flex flex-wrap gap-3">
          <a
            href="#clean"
            className="inline-flex items-center gap-2 rounded-full bg-amber px-6 py-3 text-[14px] font-semibold text-bg shadow-glow transition hover:brightness-110"
          >
            Walk through the pipeline <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="#predict"
            className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-white/[0.03] px-6 py-3 text-[14px] font-medium text-ink-soft backdrop-blur transition hover:border-white/30 hover:text-ink"
          >
            <Gauge className="h-4 w-4" /> Try the predictor
          </a>
        </motion.div>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.2 }}
        className="absolute bottom-6 left-[44%] z-10 text-[11px] text-ink-muted"
      >
        {data.options.top_routes.length} busiest routes · {data.options.airports.length} airports with
        2,000+ flights · all from the training data
      </motion.p>
    </div>
  );
}
