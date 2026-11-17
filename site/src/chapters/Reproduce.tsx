import { motion } from "framer-motion";
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
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-line-strong bg-[#060A14] shadow-panel">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
        <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
        <span className="h-3 w-3 rounded-full bg-[#28C840]" />
        <span className="ml-3 font-mono text-[11.5px] text-ink-muted">es335-flight-delay — zsh</span>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-hidden p-6 font-mono text-[13px]">
        {lines.map(([cmd, out], i) => (
          <motion.div
            key={cmd}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.38, duration: 0.3 }}
          >
            <p>
              <span className="text-[#5CD6A5]">❯</span> <span className="text-ink">{cmd}</span>
            </p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 + i * 0.38 }}
              className="pl-4 text-ink-muted"
            >
              <span className="text-[#5CD6A5]">✓</span> {out}
            </motion.p>
          </motion.div>
        ))}
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 + lines.length * 0.38 }}>
          <span className="text-[#5CD6A5]">❯</span> <span className="caret inline-block h-4 w-2 translate-y-0.5 bg-amber" />
        </motion.p>
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
            <a href={REPO} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber px-4 py-3 text-[13.5px] font-semibold text-bg shadow-glow transition hover:brightness-110">
              <Github className="h-4 w-4" /> Source code
            </a>
            <a href={`${REPO}#readme`} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line-strong bg-white/[0.03] px-4 py-3 text-[13.5px] font-medium text-ink-soft transition hover:border-white/30 hover:text-ink">
              <BookOpen className="h-4 w-4" /> README & method
            </a>
          </div>
        </div>
      }
    />
  );
}
