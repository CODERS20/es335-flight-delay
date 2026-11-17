import type { P1Dataset, P2Split, P3Selection, P4Model, P5Results } from "../lib/data";
import { MODEL_LABEL } from "../lib/theme";
import { int, n4 } from "../lib/format";

/** The whole project in one strip, so a reader knows what they are about to
 *  scroll through and can jump straight to a step. */
export default function PipelineMap({
  p1,
  p2,
  p3,
  p4,
  p5,
}: {
  p1: P1Dataset | null;
  p2: P2Split | null;
  p3: P3Selection | null;
  p4: P4Model | null;
  p5: P5Results | null;
}) {
  const steps = [
    {
      id: "data",
      n: "1",
      title: "Build one clean dataset",
      script: "p1_build_dataset.py",
      out: p1 ? `${int(p1.rows_clean)} flights · ${p1.final_features.length} features` : null,
    },
    {
      id: "split",
      n: "2",
      title: "Split off a test set",
      script: "p2_split.py",
      out: p2 ? `${int(p2.train_rows)} train · ${int(p2.test_rows)} test` : null,
    },
    {
      id: "select",
      n: "3",
      title: "Cross-validate and tune",
      script: "p3_select.py",
      out: p3 ? `${p3.n_candidates} settings · ${p3.n_fits} fits` : null,
    },
    {
      id: "retrain",
      n: "4",
      title: "Retrain on all training data",
      script: "p4_retrain.py",
      out: p4 ? `${MODEL_LABEL[p4.chosen_model] ?? p4.chosen_model}` : null,
    },
    {
      id: "evaluate",
      n: "5",
      title: "Evaluate on the test set",
      script: "p5_evaluate.py",
      out: p5 ? `curve area ${n4(p5.results[p5.chosen_model]?.pr_curve_area)}` : null,
    },
  ];

  return (
    <section aria-label="Pipeline overview" className="mt-14">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
        How the project runs, end to end
      </h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="card card-hover group flex h-full flex-col p-4"
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="step-badge flex h-6 w-6 items-center justify-center rounded-md text-[12px] font-bold"
                >
                  {s.n}
                </span>
                <span className="text-[13.5px] font-semibold tracking-tight group-hover:text-accent">
                  {s.title}
                </span>
              </span>
              <span className="mt-2.5 block font-mono text-[11.5px] text-ink-muted">
                {s.script}
              </span>
              <span className="tabular mt-1 block text-[12.5px] text-ink-soft">
                {s.out ?? "not run yet"}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
