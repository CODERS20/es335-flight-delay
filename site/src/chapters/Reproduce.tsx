import { BookOpen, Github } from "lucide-react";
import type { Bundle } from "../lib/data";
import { MODEL_LABEL } from "../lib/labels";
import { Chapter } from "../ui/kit";

const REPO = "https://github.com/CODERS20/es335-flight-delay";
const fmt = (n: number) => n.toLocaleString("en-US");

function Terminal({ data }: { data: Bundle }) {
  const { p1, p2, p3, p4, p5 } = data;
  const gb = p5.results[p5.chosen_model];
  const lines: [string, string][] = [
    ["python src/p1_build_dataset.py", `${fmt(p1.rows_clean)} rows · ${p1.final_features.length} features`],
    ["python src/p2_split.py", `${fmt(p2.train_rows)} train · ${fmt(p2.test_rows)} test, whole days`],
    ["python src/p3_select.py", `${MODEL_LABEL[p3.best.model].toLowerCase()} · ${p3.best.mean_score.toFixed(4)} over 5 folds`],
    ["python src/p4_retrain.py", `refit on ${fmt(p4.trained_on_rows)} rows · nothing re-tuned`],
    ["python src/p5_evaluate.py", `${gb.pr_curve_area.toFixed(4)} · ${gb.ratio_to_base_rate.toFixed(2)}× the base rate`],
    ["python src/p6_export_site.py", "site data written"],
    ["python src/check_parity.py", `browser = scikit-learn, to ${p4.browser_model.verified_max_abs_error.toExponential(0)}`],
    ["node site/shoot.mjs", "every screen renders · no errors"],
  ];
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded border border-line bg-[#F6F5F1]">
      <p className="border-b border-line px-5 py-2.5 font-serif text-[13px] italic text-ink-muted">
        The whole pipeline, run from the repository root
      </p>
      <div className="flex min-h-0 flex-1 flex-col justify-evenly overflow-hidden px-6 py-3 font-mono text-[14px] leading-relaxed">
        {lines.map(([cmd, out]) => (
          <div key={cmd}>
            <p>
              <span className="select-none text-ink-muted">$ </span>
              <span className="text-ink">{cmd}</span>
            </p>
            <p className="pl-4 text-ink-muted">
              <span className="text-[#0B7A43]">✓</span> {out}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Reproduce({ data }: { data: Bundle }) {
  return (
    <Chapter
      step="11"
      kicker="Finish · Reproduce"
      title={<>Six scripts, one command each</>}
      takeaway={
        <>
          Every number on these screens was written by the pipeline, not typed in. Clone the repo, add
          the public dataset, run the six scripts in order, and you get the same results — the seed is
          fixed at 42.
        </>
      }
      points={[
        <>Every choice that changes a number lives in one file: <span className="font-mono text-[12.5px] text-ink">src/pconfig.py</span>.</>,
        <>The raw data isn't redistributed; download it from Kaggle (<span className="font-mono text-[12.5px] text-ink">usdot/flight-delays</span>).</>,
        <>Built by Divya Saini and Shikha Ajeet Singh for ES 335, with AI coding assistance disclosed in the README.</>,
      ]}
      visual={
        <div className="grid h-full grid-rows-[1fr_auto] gap-4">
          <Terminal data={data} />
          <div className="flex gap-3">
            <a href={REPO} className="flex flex-1 items-center justify-center gap-2 rounded bg-ink px-4 py-3 text-[13.5px] font-semibold text-white transition hover:bg-accent">
              <Github className="h-4 w-4" /> Source code
            </a>
            <a href={`${REPO}#readme`} className="flex flex-1 items-center justify-center gap-2 rounded border border-line-strong bg-panel px-4 py-3 text-[13.5px] font-medium text-ink transition hover:border-ink">
              <BookOpen className="h-4 w-4" /> README & method
            </a>
          </div>
        </div>
      }
    />
  );
}
