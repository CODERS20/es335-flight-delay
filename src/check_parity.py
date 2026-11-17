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
import re
import subprocess
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
    """Take a function out of the site source by matching its braces."""
    start = src.index(f"export function {name}(")
    i = src.index("{", start)
    depth = 0
    for j in range(i, len(src)):
        if src[j] == "{":
            depth += 1
        elif src[j] == "}":
            depth -= 1
            if depth == 0:
                body = src[start:j + 1]
                # strip the TypeScript annotations; the arithmetic is unchanged
                body = body.replace("export function", "function")
                body = re.sub(r":\s*P4Model\[\"browser_model\"\]", "", body)
                body = re.sub(r":\s*Record<string, string \| number>", "", body)
                body = re.sub(r"\)\s*:\s*number\s*\{", ") {", body)
                return body
    raise SystemExit(f"could not read {name} out of {SITE_PREDICTOR.name}")


js = f"""
{lift("sigmoid")}
{lift("scoreFlight")}
const model = {json.dumps(model)};
const flights = {json.dumps(rows)};
console.log(JSON.stringify(flights.map((f) => scoreFlight(model, f))));
"""
with tempfile.NamedTemporaryFile("w", suffix=".mjs", delete=False, encoding="utf-8") as fh:
    fh.write(js)
    tmp = fh.name
try:
    out = subprocess.run(["node", tmp], capture_output=True, text=True, check=True)
    from_js = np.array(json.loads(out.stdout), dtype=float)
finally:
    Path(tmp).unlink(missing_ok=True)
print(f"scored them with the real sigmoid/scoreFlight from "
      f"{SITE_PREDICTOR.relative_to(P.REPO_ROOT)}")

# ---------------------------------------------------------------------------
# score them with scikit-learn
# ---------------------------------------------------------------------------
pipe_path = P.MODELS_DIR / ("logistic_regression.joblib"
                            if (P.MODELS_DIR / "logistic_regression.joblib").exists()
                            else "final.joblib")
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
