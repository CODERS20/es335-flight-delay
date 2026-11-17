import type { P1Dataset, P2Split, P3Selection, P5Results } from "../lib/data";
import { MODEL_LABEL } from "../lib/theme";
import { int, n4, pct } from "../lib/format";
import { StatCard } from "./ui";

export default function Hero({
  p1,
  p2,
  p3,
  p5,
}: {
  p1: P1Dataset | null;
  p2: P2Split | null;
  p3: P3Selection | null;
  p5: P5Results | null;
}) {
  const best = p5 && p5.results[p5.chosen_model];
  const baseline = p5 && p5.results["majority_baseline"];

  return (
    <div id="top" className="hero-glow grid-bg relative pt-12 sm:pt-20">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
        ES 335 · Machine Learning · Course Project
      </p>

      <h1 className="mt-4 max-w-4xl text-[38px] font-bold leading-[1.05] tracking-[-0.035em] sm:text-[58px]">
        Flight Delay Prediction
        <span className="block bg-gradient-to-r from-[rgb(var(--s1))] via-[rgb(var(--s1))] to-[rgb(var(--s3))] bg-clip-text text-transparent">
          Predicting Arrival Delays
        </span>
      </h1>

      <p
        className="mt-5 max-w-prose border-l-[3px] pl-4 text-[16px] leading-relaxed text-ink-soft sm:text-[17px]"
        style={{ borderColor: "rgb(var(--s1))" }}
      >
        Can we predict whether a flight will arrive more than 15 minutes late
        using information available before its scheduled departure?
      </p>

      <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-ink-soft">
        <span className="font-medium text-ink">Divya Saini</span>
        <span className="text-ink-muted">25110110</span>
        <span className="text-ink-muted">·</span>
        <span className="font-medium text-ink">Shikha Ajeet Singh</span>
        <span className="text-ink-muted">25110292</span>
      </p>

      <div className="mt-6 flex flex-wrap gap-2.5">
        <a
          href="#predict"
          className="rounded-xl bg-accent px-5 py-2.5 text-[14.5px] font-semibold text-white shadow-[0_10px_24px_-12px_rgb(var(--s1))] transition-all hover:-translate-y-0.5 hover:brightness-110"
        >
          Try the predictor →
        </a>
        <a
          href="#data"
          className="rounded-xl border border-line bg-surface px-5 py-2.5 text-[14.5px] font-medium text-ink-soft transition-all hover:-translate-y-0.5 hover:border-line-strong hover:text-ink"
        >
          Walk through the pipeline
        </a>
      </div>

      {/* The four numbers a reader needs before anything else. */}
      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          tone="primary"
          label="Precision-recall curve area"
          value={best ? n4(best.pr_curve_area) : "—"}
          sub={
            p5 ? `${MODEL_LABEL[p5.chosen_model] ?? p5.chosen_model}, on held-out flights` : "pending"
          }
          detail={
            best?.pr_curve_area_range
              ? `Range ${n4(best.pr_curve_area_range[0])} to ${n4(
                  best.pr_curve_area_range[1],
                )} across ${p5?.n_resamples} re-draws of the test flights. The curve trades precision against recall as the threshold moves; its area scores the rare class.`
              : "The curve trades precision against recall as the threshold moves; its area scores the rare class, which is the one we care about."
          }
        />
        <StatCard
          label="Baseline curve area"
          value={baseline ? n4(baseline.pr_curve_area) : p1 ? n4(p1.target.delay_rate_overall) : "—"}
          sub="always predicts “on time”"
          detail={
            baseline
              ? `Equal to the test delay rate of ${pct(
                  p5!.test_delay_rate,
                  2,
                )} — the score any model with no information gets. It is ${pct(
                  baseline.accuracy,
                  1,
                )} accurate and catches zero delays.`
              : "Equal to the delay rate: the score any model with no information gets."
          }
        />
        <StatCard
          label="Times the base rate"
          value={best ? `${best.ratio_to_base_rate.toFixed(2)}×` : "—"}
          sub="what the model adds over knowing nothing"
          detail={
            p3 && best
              ? `The curve area divided by the period's base rate. Cross-validation during selection reached ${p3.best.mean_ratio_to_base.toFixed(
                  2,
                )}×, so the held-out result is ${
                  best.ratio_to_base_rate >= p3.best.mean_ratio_to_base ? "in line with" : "a little below"
                } what selection predicted.`
              : "The curve area divided by the period's base rate."
          }
        />
        <StatCard
          label="Held-out flights"
          value={p2 ? int(p2.test_rows) : "—"}
          sub={p2 ? `${pct(p2.test_rows / (p2.train_rows + p2.test_rows), 0)} of the data, whole days` : "pending"}
          detail={
            p1 && p2
              ? `Drawn as entire calendar days from every month, so no day's weather appears on both sides of the split and nothing has to be extrapolated. ${int(
                  p1.rows_clean,
                )} flights in total after cleaning.`
              : "Drawn as entire calendar days from every month."
          }
        />
      </div>
    </div>
  );
}
