import { ArrowRight, Gauge, Github } from "lucide-react";
import type { Bundle } from "../lib/data";
import { useCountUp } from "../lib/motion";

const REPO = "https://github.com/coders20/es335-flight-delay";

function KeyResult({
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
  const { ref, value: v } = useCountUp(value);
  return (
    <div className="border-l border-line px-6 py-4 text-center first:border-l-0">
      <p
        className={`tabular font-serif text-[40px] font-semibold leading-none ${
          accent ? "text-accent" : "text-ink"
        }`}
      >
        <span ref={ref}>{format(v)}</span>
      </p>
      <p className="mx-auto mt-2 max-w-[22ch] text-[12.5px] leading-snug text-ink-muted">{label}</p>
    </div>
  );
}

const pill =
  "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-medium transition";

/** The title page: what was asked, by whom, and the answer in three numbers. */
export default function Hero({ data }: { data: Bundle }) {
  const gb = data.p5.results[data.p5.chosen_model];

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto px-12 py-8">
      <article className="w-full max-w-[880px] text-center">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.2em] text-accent">
          ES 335 · Machine Learning · 2026
        </p>

        <h1 className="mt-5 font-serif text-[clamp(44px,4.6vw,66px)] font-semibold leading-[1.05] tracking-[-0.015em] text-ink">
          Will this flight be <span className="italic text-accent">late?</span>
        </h1>
        <p className="mt-3 font-serif text-[19px] italic text-ink-soft">
          Predicting US domestic flight delays from the schedule alone
        </p>

        <p className="mt-6 font-serif text-[17px] text-ink">
          Divya Saini <span className="text-[13px] text-ink-muted">(25110110)</span>
          <span className="mx-3 text-ink-muted">·</span>
          Shikha Ajeet Singh <span className="text-[13px] text-ink-muted">(25110292)</span>
        </p>
        <p className="mt-1 font-serif text-[14.5px] text-ink-muted">Indian Institute of Technology Gandhinagar</p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a href="#clean" className={`${pill} bg-ink text-white hover:bg-accent`}>
            Walk through the pipeline <ArrowRight className="h-4 w-4" />
          </a>
          <a href="#predict" className={`${pill} bg-ink text-white hover:bg-accent`}>
            <Gauge className="h-4 w-4" /> Try the predictor
          </a>
          <a href={REPO} className={`${pill} border border-line-strong bg-panel text-ink hover:border-ink`}>
            <Github className="h-4 w-4" /> Code
          </a>
        </div>

        <section className="mt-9 border-t border-line pt-7">
          <h2 className="font-serif text-[22px] font-semibold text-ink">Abstract</h2>
          <p className="mx-auto mt-3 max-w-[68ch] text-justify font-serif text-[17px] leading-[1.65] text-ink-soft [hyphens:auto]">
            Predicting whether a US domestic flight in 2015 arrives more than 15 minutes late — using
            only what is known <em className="text-ink">before it departs</em>. No weather, no live
            data: just the schedule.
          </p>
        </section>

        <section className="mt-7">
          <p className="mb-2 font-serif text-[13px] italic text-ink-muted">Key results on the held-out test days</p>
          <div className="mx-auto grid max-w-[760px] grid-cols-3 border-y-[1.5px] border-ink">
            <KeyResult
              value={data.p1.rows_clean / 1e6}
              format={(v) => `${v.toFixed(2)}M`}
              label="flights studied, after cleaning"
            />
            <KeyResult
              value={gb.ratio_to_base_rate}
              format={(v) => `${v.toFixed(2)}×`}
              label="better than guessing, on unseen flights"
              accent
            />
            <KeyResult
              value={gb.recall * 100}
              format={(v) => `${v.toFixed(1)}%`}
              label="of genuinely late flights caught"
            />
          </div>
        </section>
      </article>
    </div>
  );
}
