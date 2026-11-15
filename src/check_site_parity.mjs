/* Verification: does the JavaScript that actually ships in docs/app.js
 * reproduce the Python model?
 *
 * This does not re-implement the scoring. It reads docs/app.js, lifts the real
 * `sigmoid` and `scoreFlight` functions out of it, and runs them. The matching
 * Python script (check_site_parity.py) scores the same flights through the
 * fitted scikit-learn pipeline. If the two disagree, the website would be
 * showing predictions the repository cannot reproduce.
 *
 * Run: node src/check_site_parity.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");

const appSrc = readFileSync(join(repo, "docs", "app.js"), "utf8");

// Lift the two functions verbatim from the shipped file.
function lift(name) {
  const start = appSrc.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found in docs/app.js`);
  let depth = 0, i = appSrc.indexOf("{", start);
  const open = i;
  for (; i < appSrc.length; i++) {
    if (appSrc[i] === "{") depth++;
    else if (appSrc[i] === "}") {
      depth--;
      if (depth === 0) return appSrc.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

const scoring = lift("sigmoid") + "\n" + lift("scoreFlight");
const { sigmoid, scoreFlight } = new Function(
  `${scoring}; return { sigmoid, scoreFlight };`
)();

const model = JSON.parse(
  readFileSync(join(repo, "docs", "data", "model.json"), "utf8")
);
const flights = JSON.parse(
  readFileSync(join(repo, "artifacts", "parity_flights.json"), "utf8")
);

const out = flights.map((f) => scoreFlight(model, f));
writeFileSync(
  join(repo, "artifacts", "parity_js.json"),
  JSON.stringify(out, null, 2)
);

console.log(`scored ${out.length} flights with the shipped app.js functions`);
out.slice(0, 5).forEach((p, i) =>
  console.log(
    `  ${flights[i].AIRLINE} ${flights[i].ORIGIN_AIRPORT}->${flights[i].DESTINATION_AIRPORT} ` +
      `${String(flights[i].SCHED_DEP_HOUR).padStart(2, "0")}:00  ${p.toFixed(6)}`
  )
);
console.log("wrote artifacts/parity_js.json");
