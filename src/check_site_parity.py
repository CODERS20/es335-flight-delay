"""
Verification: the website's JavaScript against the Python model.

Two phases:
  python src/check_site_parity.py --make    writes a set of real flights to score
  node   src/check_site_parity.mjs          scores them with the shipped app.js
  python src/check_site_parity.py           compares, and fails loudly on drift

The flights are drawn from the actual routes the website offers, so this tests
the path a visitor exercises, not a synthetic one.
"""

from __future__ import annotations

import json
import sys

import joblib
import numpy as np
import pandas as pd

import config as C

FLIGHTS = C.ARTIFACTS_DIR / "parity_flights.json"
JS_OUT = C.ARTIFACTS_DIR / "parity_js.json"
TOL = 1e-9

with open(C.DOCS_DATA_DIR / "options.json", encoding="utf-8") as fh:
    options = json.load(fh)


def make_flights(n: int = 200) -> list[dict]:
    """Build n plausible flights from the routes the site actually offers."""
    rng = np.random.default_rng(C.SEED)
    carriers = [a["code"] for a in options["airlines"]]
    pairs = [
        (o, d, v[0], v[1])
        for o, dests in options["routes"].items()
        for d, v in dests.items()
    ]
    rows = []
    for _ in range(n):
        o, d, dist, sched = pairs[rng.integers(0, len(pairs))]
        dep = int(rng.integers(0, 24))
        dow = int(rng.integers(1, 8))
        rows.append({
            "AIRLINE": carriers[rng.integers(0, len(carriers))],
            "ORIGIN_AIRPORT": o,
            "DESTINATION_AIRPORT": d,
            "SCHED_DEP_HOUR": dep,
            "SCHED_ARR_HOUR": (dep + round(sched / 60)) % 24,
            "SCHEDULED_TIME": int(sched),
            "DISTANCE": int(dist),
            "MONTH": int(rng.integers(1, 13)),
            "DAY": 15,
            "DAY_OF_WEEK": dow,
            "IS_WEEKEND": 1 if dow >= 6 else 0,
        })
    return rows


if "--make" in sys.argv:
    flights = make_flights()
    with open(FLIGHTS, "w", encoding="utf-8") as fh:
        json.dump(flights, fh, indent=2)
    print(f"wrote {FLIGHTS.relative_to(C.REPO_ROOT)} ({len(flights)} flights)")
    print("now run:  node src/check_site_parity.mjs")
    raise SystemExit(0)

# ---------------------------------------------------------------------------
# compare
# ---------------------------------------------------------------------------
if not JS_OUT.exists():
    raise SystemExit(
        "artifacts/parity_js.json is missing. Run:\n"
        "  python src/check_site_parity.py --make\n"
        "  node src/check_site_parity.mjs"
    )

with open(FLIGHTS, encoding="utf-8") as fh:
    flights = json.load(fh)
with open(JS_OUT, encoding="utf-8") as fh:
    js = np.array(json.load(fh), dtype=float)

X = pd.DataFrame(flights)[C.ALLOWED_FEATURES]
lr = joblib.load(C.ARTIFACTS_DIR / "models" / "logistic_regression.joblib")
py = lr.predict_proba(X)[:, 1]

diff = np.abs(js - py)
print("=" * 72)
print("WEBSITE PARITY CHECK  (docs/app.js vs scikit-learn)")
print("=" * 72)
print(f"flights scored : {len(flights)}")
print(f"max abs diff   : {diff.max():.3e}")
print(f"mean abs diff  : {diff.mean():.3e}")
print("\nfirst five:")
print(f"  {'route':22s} {'hour':>5s} {'javascript':>12s} {'python':>12s} {'diff':>10s}")
for i in range(5):
    f = flights[i]
    route = f"{f['AIRLINE']} {f['ORIGIN_AIRPORT']}->{f['DESTINATION_AIRPORT']}"
    print(f"  {route:22s} {f['SCHED_DEP_HOUR']:>5d} "
          f"{js[i]:>12.8f} {py[i]:>12.8f} {diff[i]:>10.2e}")

if diff.max() > TOL:
    raise SystemExit(
        f"\nFAIL: the website and the Python model disagree by {diff.max():.3e} "
        f"(tolerance {TOL:.0e}). The site must not ship predictions the "
        f"repository cannot reproduce."
    )

print(f"\nPASS: agreement within {TOL:.0e}. The interactive predictor on the")
print("website is the same model, not an approximation of it.")

with open(C.ARTIFACTS_DIR / "parity_check.json", "w", encoding="utf-8") as fh:
    json.dump({
        "n_flights": len(flights),
        "max_abs_difference": float(diff.max()),
        "mean_abs_difference": float(diff.mean()),
        "tolerance": TOL,
        "passed": True,
        "what_this_proves": (
            "The JavaScript in docs/app.js, run on the coefficients in "
            "docs/data/model.json, reproduces scikit-learn's predict_proba for "
            "the fitted logistic-regression pipeline on 200 real routes."
        ),
    }, fh, indent=2)
print("wrote artifacts/parity_check.json")
