"""
Verification: does the predictor on the website compute the same thing as the
Python model?

The page scores flights in the visitor's browser from the coefficients in
p4_model.json. If that JavaScript and scikit-learn ever disagree, the site is
showing predictions the repository cannot reproduce, which would make every
number on the page unverifiable.

This script scores real routes both ways and fails on any disagreement larger
than 1e-9. It does not re-implement the browser arithmetic: it reads the
functions out of the shipped site source and runs them through node, so what is
tested is what ships.

Run:  python src/check_parity.py
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

import pconfig as P

SITE_PREDICTOR = P.REPO_ROOT / "site" / "src" / "components" / "Predictor.tsx"
TOL = 1e-9
N_FLIGHTS = 300

print("=" * 74)
print("PARITY CHECK  (website JavaScript vs scikit-learn)")
print("=" * 74)

with open(P.ART / "p4_model.json", encoding="utf-8") as fh:
    p4 = json.load(fh)
with open(P.ART / "p4_options.json", encoding="utf-8") as fh:
    options = json.load(fh)

FEATURES = p4["features"]
model = p4["browser_model"]

# ---------------------------------------------------------------------------
# build flights from the routes the site actually offers
# ---------------------------------------------------------------------------
rng = np.random.default_rng(P.SEED)
carriers = [a["code"] for a in options["airlines"]]
pairs = [
    (o, d, v[0], v[1])
    for o, dests in options["routes"].items()
    for d, v in dests.items()
]
rows = []
for _ in range(N_FLIGHTS):
    o, d, distance, offset = pairs[rng.integers(0, len(pairs))]
    dep = int(rng.integers(0, 24))
    row = {
        "AIRLINE": carriers[rng.integers(0, len(carriers))],
        "ORIGIN_AIRPORT": o,
        "DESTINATION_AIRPORT": d,
        "SCHED_DEP_HOUR": dep,
        "SCHED_ARR_HOUR": (dep + int(offset)) % 24,
        "DISTANCE": int(distance),
        "MONTH": int(rng.choice([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12])),
        "DAY": 15,
        "DAY_OF_WEEK": int(rng.integers(1, 8)),
    }
    rows.append({k: row[k] for k in FEATURES})
print(f"\nbuilt {len(rows)} flights from the site's own route list")

# ---------------------------------------------------------------------------
# score them with the JavaScript that ships
# ---------------------------------------------------------------------------
src = SITE_PREDICTOR.read_text(encoding="utf-8")


def lift(name: str) -> str:
    """Take a function out of the site source by matching its braces.

    The text is kept exactly as it ships, types and all; esbuild turns it into
    runnable JavaScript below. Nothing is re-implemented here, so what gets
    tested is what a visitor's browser runs.
    """
    start = src.index(f"export function {name}(")
    i = src.index("{", start)
    depth = 0
    for j in range(i, len(src)):
        if src[j] == "{":
            depth += 1
        elif src[j] == "}":
            depth -= 1
            if depth == 0:
                return src[start:j + 1].replace("export function", "function")
    raise SystemExit(f"could not read {name} out of {SITE_PREDICTOR.name}")


ts = f"""
{lift("sigmoid")}
{lift("scoreFlight")}
const model = {json.dumps(model)};
const flights = {json.dumps(rows)};
console.log(JSON.stringify(flights.map((f) => scoreFlight(model, f))));
"""
# The snippet still carries its TypeScript types, so hand it to esbuild -- the
# transpiler the site is already built with -- rather than stripping types by
# hand and hoping the regular expressions caught every one.
tmpdir = Path(tempfile.mkdtemp())
ts_file = tmpdir / "score.ts"
js_file = tmpdir / "score.mjs"
ts_file.write_text(ts, encoding="utf-8")

esbuild = P.REPO_ROOT / "site" / "node_modules" / ".bin" / (
    "esbuild.cmd" if sys.platform == "win32" else "esbuild"
)
if not esbuild.exists():
    raise SystemExit(
        f"esbuild not found at {esbuild}. Run `npm install` in site/ first."
    )

build = subprocess.run(
    [str(esbuild), str(ts_file), "--format=esm", f"--outfile={js_file}"],
    capture_output=True, text=True,
)
if build.returncode != 0:
    raise SystemExit("FAIL: could not transpile the site's scoring code.\n" + build.stderr)

out = subprocess.run(["node", str(js_file)], capture_output=True, text=True)
if out.returncode != 0:
    raise SystemExit("FAIL: the site's scoring code did not run.\n" + out.stderr.strip())
from_js = np.array(json.loads(out.stdout), dtype=float)
shutil.rmtree(tmpdir, ignore_errors=True)

print(f"scored them with the real sigmoid/scoreFlight from "
      f"{SITE_PREDICTOR.relative_to(P.REPO_ROOT)}")

# ---------------------------------------------------------------------------
# score them with scikit-learn
# ---------------------------------------------------------------------------
# The page runs the model p4 exported, which is not the same object as the
# best-of-family logistic regression: it is refitted for the page with its own
# settings. Comparing against the wrong one would make this check meaningless.
pipe_path = P.MODELS_DIR / "browser.joblib"
if not pipe_path.exists():
    raise SystemExit(
        "artifacts/models/browser.joblib is missing. Run p4_retrain.py, which "
        "saves the exact pipeline whose coefficients the website ships."
    )
pipe = joblib.load(pipe_path)
from_py = pipe.predict_proba(pd.DataFrame(rows)[FEATURES])[:, 1]
print(f"scored them with {pipe_path.name}")

diff = np.abs(from_js - from_py)
print(f"\nlargest disagreement : {diff.max():.3e}")
print(f"mean disagreement    : {diff.mean():.3e}")
print("\nfirst five:")
print(f"  {'route':<22}{'hour':>5}{'javascript':>14}{'python':>14}{'diff':>11}")
for i in range(5):
    r = rows[i]
    route = f"{r['AIRLINE']} {r['ORIGIN_AIRPORT']}->{r['DESTINATION_AIRPORT']}"
    print(f"  {route:<22}{r['SCHED_DEP_HOUR']:>5}{from_js[i]:>14.9f}"
          f"{from_py[i]:>14.9f}{diff[i]:>11.2e}")

result = {
    "n_flights": len(rows),
    "max_abs_difference": float(diff.max()),
    "mean_abs_difference": float(diff.mean()),
    "tolerance": TOL,
    "passed": bool(diff.max() <= TOL),
    "what_this_proves": (
        "The JavaScript in site/src/components/Predictor.tsx, run on the "
        "coefficients in p4_model.json, reproduces scikit-learn's predict_proba "
        f"for the fitted pipeline on {len(rows)} real routes."
    ),
}
with open(P.ART / "parity_check.json", "w", encoding="utf-8") as fh:
    json.dump(result, fh, indent=2)

if diff.max() > TOL:
    raise SystemExit(
        f"\nFAIL: the website and the Python model disagree by {diff.max():.3e} "
        f"(tolerance {TOL:.0e})."
    )

print(f"\nPASS: agreement within {TOL:.0e}. The predictor on the website is the")
print("same model, not an approximation of it.")
print("wrote artifacts/parity_check.json")
