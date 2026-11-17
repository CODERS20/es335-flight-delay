import type { P1Dataset } from "../lib/data";
import { Callout, Card, Mono, StepSection, Table } from "./ui";

const REPO = "https://github.com/CODERS20/es335-flight-delay";

const STEPS: [string, string, string][] = [
  ["p1_build_dataset.py", "~3 min", "cleans the raw csv, measures redundancy, writes one dataset"],
  ["p2_split.py", "~1 min", "holds out whole days from every month"],
  ["p3_select.py", "~35 min", "cross-validation, model comparison, tuning, threshold"],
  ["p4_retrain.py", "~5 min", "refits the winner on all training rows, exports the browser model"],
  ["p5_evaluate.py", "~4 min", "opens the test set, once"],
  ["p6_export_site.py", "~1 min", "copies the artifacts the website reads"],
];

export default function Reproduce({ p1 }: { p1: P1Dataset | null }) {
  return (
    <StepSection
      id="reproduce"
      step="↻"
      title="Reproduce this"
      lede={
        <>
          The split is defined in code, the seed is fixed at 42, and every number
          on this page is read from a JSON file the pipeline wrote. Running the six
          scripts in order rebuilds all of it.
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card>
          <ol className="space-y-3 text-[13.5px] leading-relaxed">
            <li>
              <span className="font-semibold">Clone the repository.</span>{" "}
              <a href={REPO} className="text-accent underline-offset-2 hover:underline">
                {REPO.replace("https://", "")}
              </a>
            </li>
            <li>
              <span className="font-semibold">Get the data.</span> Download{" "}
              <Mono>flights.csv</Mono>, <Mono>airlines.csv</Mono> and{" "}
              <Mono>airports.csv</Mono> from the Kaggle mirror of the US DOT on-time
              performance data and put them in a <Mono>Dataset/</Mono> folder{" "}
              <em>next to</em> the repository. We do not redistribute the raw files.
            </li>
            <li>
              <span className="font-semibold">Set up Python.</span>{" "}
              <Mono>python -m venv .venv</Mono>, activate it, then{" "}
              <Mono>pip install -r requirements.txt</Mono>.
            </li>
            <li>
              <span className="font-semibold">Check the paths resolve.</span>{" "}
              <Mono>python src/pconfig.py</Mono>
            </li>
            <li>
              <span className="font-semibold">Run the pipeline in order.</span> Each
              step reads only what the previous one wrote.
            </li>
            <li>
              <span className="font-semibold">Verify.</span>{" "}
              <Mono>python src/check_parity.py</Mono> confirms the predictor on this
              page reproduces scikit-learn, and{" "}
              <Mono>cd site && node shoot.mjs</Mono> loads the built site in a
              real browser, fails on any console error, empty section or
              placeholder left on the page, and saves screenshots of it.
            </li>
            <li>
              <span className="font-semibold">Build the site.</span>{" "}
              <Mono>cd site && npm install && npm run build</Mono>, which writes the
              static files into <Mono>docs/</Mono> for GitHub Pages. Use{" "}
              <Mono>npm run dev</Mono> while working on it.
            </li>
          </ol>
        </Card>

        <div className="space-y-5">
          <Card>
            <Table
              head={["Script", "Runtime", "What it does"]}
              rows={STEPS.map(([s, t, d]) => [
                <span className="font-mono text-[12px]">{s}</span>,
                t,
                <span className="text-left">{d}</span>,
              ])}
            />
          </Card>

          <Callout title="What makes this reproducible rather than merely repeatable">
            <p>
              Every choice that could change a number lives in{" "}
              <Mono>src/pconfig.py</Mono>: the seed, the feature allow-list, the
              redundancy threshold, which days are held out, the fold count, and the
              rule for choosing the decision threshold. Re-running on the same input
              gives the same output, and changing a decision means changing it in one
              place.
            </p>
          </Callout>

          {p1 ? (
            <Callout tone="warn" title="One honest caveat about the test set">
              <p>
                An earlier version of this project scored the same November and
                December flights under a different split. Those months are therefore
                not untouched data in the strictest sense. The held-out days used for
                the headline result here were drawn fresh for this pipeline, and the
                earlier run is still in the repository's git history if you want to
                compare.
              </p>
            </Callout>
          ) : null}
        </div>
      </div>
    </StepSection>
  );
}
