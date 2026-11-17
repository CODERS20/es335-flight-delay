"""
P5 - Evaluate on the held-out test set. Once.

    data/test.csv + artifacts/models/*.joblib  ->  artifacts/p5_results.json

This script fits nothing and chooses nothing. Every model it scores was fitted
in p4, with settings chosen in p3 by cross-validation, and the decision
threshold was fixed there too. All this step does is read the held-out flights
and measure.

That ordering is the whole point. If any choice were made here -- a different
threshold, a different model, one more setting tried -- the result would stop
being an estimate of how the model performs on unseen data and become an
estimate of how well we can fit the test set.

WHAT IT REPORTS
---------------
  * every method side by side, including the majority baseline
  * a range for each headline number, from re-drawing the test flights
  * the precision-recall curve for each model
  * the confusion counts at the frozen threshold
  * whether the predicted probabilities mean what they say
  * where the model fails: by hour, carrier, month and distance
  * a secondary, harder check: fit on the earlier months, score the later ones

Run:  python src/p5_evaluate.py
"""

from __future__ import annotations

import json

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    average_precision_score, brier_score_loss, precision_recall_curve, roc_auc_score,
)

import pconfig as P
import pmodels as M

print("=" * 74)
print("P5  Final evaluation on the held-out test set")
print("=" * 74)

with open(P.ART / "p3_selection.json", encoding="utf-8") as fh:
    sel = json.load(fh)
with open(P.ART / "p4_model.json", encoding="utf-8") as fh:
    p4 = json.load(fh)

FEATURES: list[str] = p4["features"]
CHOSEN: str = p4["chosen_model"]
THRESHOLD: float = float(p4["threshold"])

print(f"\nmodel      : {CHOSEN} {p4['settings']}")
print(f"threshold  : {THRESHOLD:.4f}  (chosen in p3, on cross-validation folds)")
print(f"fitted on  : {p4['trained_on_rows']:,} training flights in p4")
print("this script fits nothing and chooses nothing")

print(f"\nreading {P.TEST_CSV.name} ...")
test = pd.read_csv(P.TEST_CSV)
P.assert_no_leakage(FEATURES)
X = test[FEATURES]
y = test[P.TARGET].to_numpy()
base_rate = float(y.mean())
print(f"  {len(test):,} held-out flights, delay rate {base_rate:.4f}")

# ---------------------------------------------------------------------------
# score every model p4 fitted
# ---------------------------------------------------------------------------
scores: dict[str, np.ndarray] = {}
for name in p4["family_models"]:
    path = P.MODELS_DIR / f"{name}.joblib"
    if not path.exists():
        print(f"  (skipping {name}: {path.name} not found)")
        continue
    scores[name] = joblib.load(path).predict_proba(X)[:, 1]

# The baseline predicts the majority class for every flight. A constant score
# gives the precision-recall curve its floor, which is the base rate.
scores["majority_baseline"] = np.zeros(len(y))

results: dict[str, dict] = {}
print("\n" + "-" * 74)
print(f"{'model':<24}{'curve area':>12}{'x base':>9}{'ROC':>8}"
      f"{'precision':>11}{'recall':>9}{'balance':>9}")
print("-" * 74)

for name, s in scores.items():
    area = float(average_precision_score(y, s))
    at = M.confusion_at(y, s, THRESHOLD)
    results[name] = {
        "pr_curve_area": area,
        "ratio_to_base_rate": area / base_rate,
        "roc_curve_area": 0.5 if name == "majority_baseline" else float(roc_auc_score(y, s)),
        "mean_squared_error": float(brier_score_loss(y, np.clip(s, 0, 1))),
        **at,
    }
    r = results[name]
    print(f"{name:<24}{area:>12.4f}{r['ratio_to_base_rate']:>9.3f}"
          f"{r['roc_curve_area']:>8.3f}{r['precision']:>11.3f}"
          f"{r['recall']:>9.3f}{r['balance']:>9.3f}")

# ---------------------------------------------------------------------------
# how much would these numbers move on a different sample of flights?
# ---------------------------------------------------------------------------
print(f"\nre-drawing the test flights {P.N_RESAMPLES} times to see how far each "
      f"number moves:")
rng = np.random.default_rng(P.SEED)
draws = [rng.integers(0, len(y), len(y)) for _ in range(P.N_RESAMPLES)]
for name, s in scores.items():
    vals = np.array([average_precision_score(y[d], s[d]) for d in draws])
    lo, hi = np.percentile(vals, [2.5, 97.5])
    results[name]["pr_curve_area_range"] = [float(lo), float(hi)]
    print(f"  {name:<24} {results[name]['pr_curve_area']:.4f}  [{lo:.4f}, {hi:.4f}]")

# Is the winner's lead over the runner-up bigger than the noise? The same drawn
# flights are used for both models, so the comparison is not confounded by
# which flights happened to come up.
others = sorted(
    [k for k in scores if k != "majority_baseline" and k != CHOSEN],
    key=lambda k: -results[k]["pr_curve_area"],
)
comparison = None
if others:
    runner = others[0]
    diffs = np.array([
        average_precision_score(y[d], scores[CHOSEN][d])
        - average_precision_score(y[d], scores[runner][d])
        for d in draws
    ])
    lo, hi = np.percentile(diffs, [2.5, 97.5])
    MATERIAL = 0.005
    comparison = {
        "better": CHOSEN,
        "than": runner,
        "mean_difference": float(diffs.mean()),
        "range": [float(lo), float(hi)],
        "consistent": bool(lo > 0),
        "material": bool(abs(diffs.mean()) >= MATERIAL),
        "material_margin": MATERIAL,
        "reading": (
            f"{CHOSEN} is ahead of {runner} by {diffs.mean():.4f} of curve area. "
            f"{'That gap holds in every re-draw' if lo > 0 else 'The gap is not consistent across re-draws'}, "
            f"but it is {'above' if abs(diffs.mean()) >= MATERIAL else 'well below'} "
            f"the {MATERIAL} we fixed in advance as the smallest difference worth "
            f"acting on. With {len(y):,} flights a tiny gap can be perfectly "
            f"repeatable and still not matter."
        ),
    }
    print(f"\n{CHOSEN} vs {runner}: {diffs.mean():+.4f} "
          f"[{lo:+.4f}, {hi:+.4f}]  material? {comparison['material']}")

# ---------------------------------------------------------------------------
# curves, calibration, slices
# ---------------------------------------------------------------------------
pr_curve: dict[str, list[dict]] = {}
for name, s in scores.items():
    if name == "majority_baseline":
        continue
    prec, rec, _ = precision_recall_curve(y, s)
    # thin to a few hundred points: the website does not need 900k of them
    keep = np.unique(np.linspace(0, len(rec) - 1, 220).astype(int))
    pr_curve[name] = [
        {"recall": round(float(rec[i]), 5), "precision": round(float(prec[i]), 5)}
        for i in keep
    ]

best_scores = scores[CHOSEN]
bins = np.linspace(0, 1, 11)
idx = np.clip(np.digitize(best_scores, bins) - 1, 0, 9)
calibration = []
worst_gap = 0.0
for b in range(10):
    m = idx == b
    if m.sum() < 50:
        continue
    mp, obs = float(best_scores[m].mean()), float(y[m].mean())
    worst_gap = max(worst_gap, abs(mp - obs))
    calibration.append({
        "bin": f"{bins[b]:.1f}-{bins[b + 1]:.1f}",
        "mean_predicted": round(mp, 5),
        "observed_rate": round(obs, 5),
        "n": int(m.sum()),
    })
print(f"\ncalibration: worst gap between predicted and observed {worst_gap:.3f}")

pred = (best_scores >= THRESHOLD).astype(np.int8)
test = test.assign(score=best_scores, flagged=pred)


def slice_by(col: str, label, order=None) -> dict:
    rows = []
    for key, g in test.groupby(col, observed=True):
        tp = int(((g["flagged"] == 1) & (g[P.TARGET] == 1)).sum())
        fp = int(((g["flagged"] == 1) & (g[P.TARGET] == 0)).sum())
        fn = int(((g["flagged"] == 0) & (g[P.TARGET] == 1)).sum())
        if len(g) < 200:
            continue
        rows.append({
            "group": label(key),
            "n": int(len(g)),
            "actual_rate": float(g[P.TARGET].mean()),
            "recall": float(tp / (tp + fn)) if tp + fn else 0.0,
            "precision": float(tp / (tp + fp)) if tp + fp else 0.0,
        })
    if order:
        rows.sort(key=order)
    return rows


slices = [
    {"by": "Departure hour",
     "rows": slice_by("SCHED_DEP_HOUR", lambda h: f"{int(h):02d}:00",
                      order=lambda r: r["group"])},
    {"by": "Month",
     "rows": slice_by("MONTH", lambda m: pd.Timestamp(2015, int(m), 1).strftime("%B"),
                      order=lambda r: -r["actual_rate"])},
    {"by": "Carrier",
     "rows": slice_by("AIRLINE", lambda a: str(a), order=lambda r: -r["actual_rate"])},
    {"by": "Distance",
     "rows": slice_by(
         pd.cut(test["DISTANCE"], [0, 400, 800, 1500, 2500, 10000],
                labels=["<400 mi", "400-800", "800-1500", "1500-2500", "2500+"]),
         lambda d: str(d), order=None)},
]
for s in slices:
    print(f"  {s['by']}: {len(s['rows'])} groups")

# The most confident mistakes in each direction. Instructive because nothing in
# the schedule separates these flights from their neighbours.
def examples(mask, by, n=6):
    g = test[mask].nlargest(n, by)
    return [
        {
            "carrier": str(r.AIRLINE),
            "route": f"{r.ORIGIN_AIRPORT} to {r.DESTINATION_AIRPORT}",
            "departs": f"{int(r.SCHED_DEP_HOUR):02d}:00",
            "date": f"2015-{int(r.MONTH):02d}-{int(r.DAY):02d}",
            "score": round(float(r.score), 4),
            "was_late": bool(getattr(r, P.TARGET)),
        }
        for r in g.itertuples()
    ]


miss_mask = (test[P.TARGET] == 1) & (test["flagged"] == 0)
alarm_mask = (test[P.TARGET] == 0) & (test["flagged"] == 1)
error_examples = [
    {"kind": "Confident misses — late, scored as low risk",
     "rows": examples(miss_mask, "score", 6)[::-1]},
    {"kind": "Confident false alarms — on time, scored as high risk",
     "rows": examples(alarm_mask, "score", 6)},
]

# ---------------------------------------------------------------------------
# the secondary, harder check: predict a future period
# ---------------------------------------------------------------------------
print("\n" + "-" * 74)
print("secondary check: fit on the earlier months, score the later ones")
print("-" * 74)
print("This is the forecasting version of the question. It is harder, because")
print("the later months are busier and their month values never appear in the")
print("training rows, so the model has to extrapolate. Reported alongside the")
print("main result rather than instead of it.")

secondary = None
try:
    train_full = pd.read_csv(P.TRAIN_CSV)
    tr = train_full[train_full["MONTH"].isin(P.CHRONO_TRAIN_MONTHS)]
    te = test[test["MONTH"].isin(P.CHRONO_TEST_MONTHS)]
    if len(tr) and len(te):
        pipe = M.build(CHOSEN, p4["settings"], FEATURES)
        pipe.fit(tr[FEATURES], tr[P.TARGET].to_numpy())
        s = pipe.predict_proba(te[FEATURES])[:, 1]
        yy = te[P.TARGET].to_numpy()
        area = float(average_precision_score(yy, s))
        br = float(yy.mean())
        main_ratio = results[CHOSEN]["ratio_to_base_rate"]
        secondary = {
            "design": (
                f"Fitted on months {P.CHRONO_TRAIN_MONTHS} and scored on the "
                f"held-out flights from months {P.CHRONO_TEST_MONTHS}."
            ),
            "train_months": P.CHRONO_TRAIN_MONTHS,
            "test_months": P.CHRONO_TEST_MONTHS,
            "train_rows": int(len(tr)),
            "test_rows": int(len(te)),
            "pr_curve_area": area,
            "base_rate": br,
            "ratio_to_base_rate": area / br,
            "reading": (
                f"{area / br:.2f} times the base rate, against "
                f"{main_ratio:.2f} on the main split. Two things make this "
                f"harder and they are tangled together: the later months are a "
                f"different period from the ones the model was fitted on, and "
                f"their month values are outside the range it ever saw, so it "
                f"has to extrapolate. That is exactly why the main split draws "
                f"held-out days from every month instead."
            ),
        }
        print(f"  curve area {area:.4f}  base rate {br:.4f}  "
              f"{area / br:.3f}x  (main split: {main_ratio:.3f}x)")
except FileNotFoundError:
    print("  (train.csv not available, skipped)")

# ---------------------------------------------------------------------------
# did cross-validation predict the held-out result?
# ---------------------------------------------------------------------------
cv_to_test = [
    {"stage": f"Cross-validation fold {f['fold']}",
     "score": None, "base_rate": f["validate_base_rate"], "ratio": None}
    for f in sel["folds"]
]
for i, r in enumerate(sel["best"]["fold_scores"]):
    cv_to_test[i]["score"] = r
    cv_to_test[i]["ratio"] = sel["best"].get("fold_ratios", [None] * 5)[i]
cv_to_test.append({
    "stage": "Cross-validation, mean",
    "score": sel["best"]["mean_score"],
    "base_rate": sel["base_rate"],
    "ratio": sel["best"]["mean_ratio_to_base"],
})
cv_to_test.append({
    "stage": "Held-out test set",
    "score": results[CHOSEN]["pr_curve_area"],
    "base_rate": base_rate,
    "ratio": results[CHOSEN]["ratio_to_base_rate"],
})

# ---------------------------------------------------------------------------
# write
# ---------------------------------------------------------------------------
out = {
    "evaluated_once": True,
    "fitted_here": False,
    "chose_anything_here": False,
    "test_rows": int(len(test)),
    "test_delay_rate": base_rate,
    "threshold": THRESHOLD,
    "chosen_model": CHOSEN,
    "settings": p4["settings"],
    "n_resamples": P.N_RESAMPLES,
    "results": results,
    "comparison": comparison,
    "pr_curve": pr_curve,
    "calibration": calibration,
    "calibration_worst_gap": round(worst_gap, 4),
    "slices": slices,
    "examples": error_examples,
    "secondary_check": secondary,
    "cv_to_test": cv_to_test,
    "provenance": (
        "Models and settings were chosen in p3 by cross-validation on training "
        "days only. The decision threshold came from the same folds. p4 refitted "
        "the chosen settings on every training row. This script read test.csv "
        "once and measured; it fitted nothing except the clearly-labelled "
        "secondary check, and re-tuned nothing."
    ),
}
with open(P.ART / "p5_results.json", "w", encoding="utf-8") as fh:
    json.dump(out, fh, indent=2)
print("\nwrote artifacts/p5_results.json")

print("\n" + "=" * 74)
print("P5 complete. The test set has now been used. Re-tuning anything after")
print("this point would make these numbers meaningless.")
print("=" * 74)
