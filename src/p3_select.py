"""
P3 - Cross-validation, model selection and tuning.

    data/train.csv  ->  artifacts/p3_selection.json

This is the only script that chooses anything, and it never reads test.csv.

THE PROCEDURE
-------------
For every candidate (model, settings) pair:

    5-fold cross-validation, GROUPED BY CALENDAR DAY
    score = area under the precision-recall curve, averaged over the folds

Grouping the folds by date matters for the same reason the train/test split
holds whole days: if one day's flights were spread across folds, a model could
learn that day's disruption in four folds and be rewarded for it in the fifth.

The winner is the pair with the best mean score. The decision threshold is then
chosen from the pooled out-of-fold predictions, so it is fixed before any test
flight is read.

WHY THE GRID IS DELIBERATELY SMALL
----------------------------------
An earlier version of this project searched 62 settings and the best one beat
the setting already chosen by 0.0021 of curve area -- nothing. On this problem
the settings are not the constraint, the features are. So the grid here spans
the choices that actually change behaviour (regularisation strength, tree depth,
learning rate, and whether the rare class is weighted up) and stops there,
instead of spending an hour of compute to rediscover the same conclusion.

Run:  python src/p3_select.py
"""

from __future__ import annotations

import itertools
import json
import time
import warnings

import numpy as np
import pandas as pd
from sklearn.exceptions import ConvergenceWarning
from sklearn.metrics import average_precision_score, precision_recall_curve, roc_auc_score
from sklearn.model_selection import GroupKFold

import pconfig as P
import pmodels as M

warnings.filterwarnings("ignore", category=ConvergenceWarning)

print("=" * 74)
print("P3  Cross-validation, model selection and tuning")
print("=" * 74)

# ---------------------------------------------------------------------------
# data
# ---------------------------------------------------------------------------
print(f"\nreading {P.TRAIN_CSV.name} ...")
train_all = pd.read_csv(P.TRAIN_CSV)
rows_available = len(train_all)
print(f"  {rows_available:,} rows")

train = train_all
if rows_available > P.CV_SAMPLE_ROWS:
    train = train_all.sample(n=P.CV_SAMPLE_ROWS, random_state=P.SEED)
    print(f"  sampled {len(train):,} rows for selection (seed {P.SEED}).")
    print(f"  Selection only has to RANK the candidates, and the ranking is "
          f"stable well below the full set;")
    print(f"  the chosen settings are refitted on all {rows_available:,} rows in p4.")
del train_all

with open(P.ART / "p1_dataset.json", encoding="utf-8") as fh:
    FEATURES = json.load(fh)["final_features"]
P.assert_no_leakage(FEATURES)

X = train[FEATURES]
y = train[P.TARGET].to_numpy()
groups = M.day_groups(train)
months = train["MONTH"].to_numpy()
base_rate = float(y.mean())
print(f"  {len(FEATURES)} features, delay rate {base_rate:.4f}, "
      f"{len(np.unique(groups))} distinct days")

# ---------------------------------------------------------------------------
# the folds
# ---------------------------------------------------------------------------
cv = GroupKFold(n_splits=P.CV_SPLITS)
folds = list(cv.split(X, y, groups))

print(f"\n{P.CV_SPLITS}-fold cross-validation, grouped by {P.CV_GROUP}:")
fold_meta = []
for i, (tr, va) in enumerate(folds, 1):
    va_days = np.unique(groups[va])
    va_months = sorted(set(int(m) for m in months[va]))
    fold_meta.append({
        "fold": i,
        "fit_rows": int(len(tr)),
        "validate_rows": int(len(va)),
        "fit_days": int(len(np.unique(groups[tr]))),
        "validate_days": int(len(va_days)),
        "validate_base_rate": float(y[va].mean()),
        "validate_months": va_months,
        "validate_day_list": [int(d) for d in va_days],
    })
    print(f"  fold {i}: fit {len(tr):>7,} rows / {len(np.unique(groups[tr])):>3} days   "
          f"validate {len(va):>7,} rows / {len(va_days):>3} days   "
          f"base rate {y[va].mean():.4f}")

# ---------------------------------------------------------------------------
# the candidates
# ---------------------------------------------------------------------------
GRID: list[tuple[str, dict]] = []

# Regularisation strength, and whether to weight the rare class up. Weighting
# raises recall and pushes every predicted probability up with it, so it is
# worth measuring rather than assuming.
for c, w in itertools.product([0.1, 1.0], [None, "balanced"]):
    GRID.append(("logistic_regression", {"C": c, "class_weight": w}))

# Depth is the setting that matters for a forest: too shallow and it cannot
# express interactions, too deep and each tree memorises its sample.
for d in [12, 20]:
    GRID.append(("random_forest", {"n_estimators": 60, "max_depth": d,
                                   "min_samples_leaf": 50,
                                   "class_weight": "balanced_subsample"}))
GRID.append(("random_forest", {"n_estimators": 60, "max_depth": 20,
                               "min_samples_leaf": 50, "class_weight": None}))

# Learning rate against tree size is the real trade-off in boosting; max_iter
# stays fixed so the comparison is about shape rather than budget.
for lr, leaves in itertools.product([0.05, 0.1], [31, 63]):
    GRID.append(("gradient_boosting", {"learning_rate": lr, "max_leaf_nodes": leaves,
                                       "max_iter": 200, "l2": 1.0,
                                       "class_weight": None}))
GRID.append(("gradient_boosting", {"learning_rate": 0.05, "max_leaf_nodes": 31,
                                   "max_iter": 200, "l2": 1.0,
                                   "class_weight": "balanced"}))

print(f"\n{len(GRID)} candidate settings x {P.CV_SPLITS} folds = "
      f"{len(GRID) * P.CV_SPLITS} fits\n")

# ---------------------------------------------------------------------------
# the baseline, scored the same way
# ---------------------------------------------------------------------------
print("-" * 74)
print("majority baseline (always predicts 'on time')")
print("-" * 74)
base_folds = [float(average_precision_score(y[va], np.zeros(len(va)))) for _, va in folds]
print(f"  mean curve area {np.mean(base_folds):.4f} -- equal to the base rate, by")
print(f"  construction. Accuracy would be {1 - base_rate:.4f} while catching no")
print(f"  delayed flight at all, which is why accuracy is not the headline here.")

results = [{
    "model": "majority_baseline",
    "settings": {},
    "fold_scores": [round(v, 6) for v in base_folds],
    "fold_ratios": [1.0] * len(base_folds),
    "mean_score": float(np.mean(base_folds)),
    "std_score": float(np.std(base_folds, ddof=1)),
    "mean_ratio_to_base": 1.0,
    "fit_seconds": 0.0,
}]

# ---------------------------------------------------------------------------
# cross-validate every candidate
# ---------------------------------------------------------------------------
oof_store: dict[str, np.ndarray] = {}
print("\n" + "-" * 74)
print(f"{'#':>3} {'model':<20} {'settings':<44} {'curve area':>11} {'time':>6}")
print("-" * 74)

for n, (model, settings) in enumerate(GRID, 1):
    t0 = time.time()
    fold_scores, fold_ratios, fold_times = [], [], []
    oof = np.full(len(y), np.nan)
    for tr, va in folds:
        tf = time.time()
        pipe = M.build(model, settings, FEATURES)
        pipe.fit(X.iloc[tr], y[tr])
        s = pipe.predict_proba(X.iloc[va])[:, 1]
        oof[va] = s
        area = float(average_precision_score(y[va], s))
        fold_scores.append(area)
        fold_ratios.append(area / float(y[va].mean()))
        fold_times.append(round(time.time() - tf, 1))
    took = time.time() - t0
    key = f"{model}|{json.dumps(settings, sort_keys=True)}"
    oof_store[key] = oof
    rec = {
        "model": model,
        "settings": settings,
        "fold_scores": [round(v, 6) for v in fold_scores],
        "fold_ratios": [round(v, 4) for v in fold_ratios],
        "fold_seconds": fold_times,
        "mean_score": float(np.mean(fold_scores)),
        "std_score": float(np.std(fold_scores, ddof=1)),
        "mean_ratio_to_base": float(np.mean(fold_ratios)),
        "oof_roc_area": float(roc_auc_score(y, oof)),
        "fit_seconds": round(took, 1),
    }
    results.append(rec)
    label = ", ".join(f"{k}={v}" for k, v in settings.items())
    print(f"{n:>3} {model:<20} {label[:44]:<44} {rec['mean_score']:>11.4f} "
          f"{took:>5.0f}s")

# ---------------------------------------------------------------------------
# the winner
# ---------------------------------------------------------------------------
ranked = sorted([r for r in results if r["model"] != "majority_baseline"],
                key=lambda r: -r["mean_score"])
best = ranked[0]
best_key = f"{best['model']}|{json.dumps(best['settings'], sort_keys=True)}"

print("\n" + "=" * 74)
print("RANKING  (mean area under the precision-recall curve)")
print("=" * 74)
for r in ranked:
    label = ", ".join(f"{k}={v}" for k, v in r["settings"].items())
    print(f"  {r['mean_score']:.4f} +/- {r['std_score']:.4f}  "
          f"{r['mean_ratio_to_base']:.3f}x base   {r['model']:<20} {label[:40]}")

print(f"\nbaseline: {np.mean(base_folds):.4f}")
spread = ranked[0]["mean_score"] - ranked[-1]["mean_score"]
print(f"spread between best and worst candidate: {spread:.4f} of curve area")
print(f"gap from the best candidate to the baseline: "
      f"{ranked[0]['mean_score'] - np.mean(base_folds):.4f}")
print(f"-> the choice of model and settings moves the score "
      f"{spread / max(ranked[0]['mean_score'] - np.mean(base_folds), 1e-9):.0%} as "
      f"much as having a model at all does")

# ---------------------------------------------------------------------------
# the decision threshold, from the out-of-fold predictions
# ---------------------------------------------------------------------------
oof = oof_store[best_key]
prec, rec, thr = precision_recall_curve(y, oof)
prec, rec = prec[:-1], rec[:-1]
with np.errstate(invalid="ignore", divide="ignore"):
    balance = np.where(prec + rec > 0, 2 * prec * rec / (prec + rec), 0.0)
i = int(np.nanargmax(balance))
threshold = float(thr[i])

print("\n" + "-" * 74)
print("decision threshold, chosen on the out-of-fold predictions")
print("-" * 74)
print(f"  threshold {threshold:.4f}   precision {prec[i]:.4f}   "
      f"recall {rec[i]:.4f}   balance {balance[i]:.4f}")

# How the winner behaved in each fold at that threshold: the per-iteration
# detail the website shows.
winner_folds = []
for (tr, va), meta in zip(folds, fold_meta):
    at = M.confusion_at(y[va], oof[va], threshold)
    winner_folds.append({
        "fold": meta["fold"],
        "validate_rows": meta["validate_rows"],
        "validate_days": meta["validate_days"],
        "validate_months": meta["validate_months"],
        "base_rate": meta["validate_base_rate"],
        "curve_area": best["fold_scores"][meta["fold"] - 1],
        "ratio_to_base": best["fold_ratios"][meta["fold"] - 1],
        "seconds": best["fold_seconds"][meta["fold"] - 1],
        **at,
    })

print("\nthe winner, fold by fold, at that threshold:")
print(f"  {'fold':>4} {'rows':>9} {'base':>7} {'area':>8} {'x base':>7} "
      f"{'prec':>6} {'recall':>7} {'bal':>6}")
for w in winner_folds:
    print(f"  {w['fold']:>4} {w['validate_rows']:>9,} {w['base_rate']:>7.4f} "
          f"{w['curve_area']:>8.4f} {w['ratio_to_base']:>7.3f} "
          f"{w['precision']:>6.3f} {w['recall']:>7.3f} {w['balance']:>6.3f}")

sweep = []
for t in np.round(np.arange(0.02, 0.99, 0.01), 2):
    at = M.confusion_at(y, oof, float(t))
    c = at["confusion"]
    sweep.append({
        "t": float(t), **c,
        "precision": round(at["precision"], 5),
        "recall": round(at["recall"], 5),
        "balance": round(at["balance"], 5),
        "accuracy": round(at["accuracy"], 5),
    })

# A reliability check on the out-of-fold predictions: do the probabilities mean
# what they say, before we ever look at test?
bins = np.linspace(0, 1, 11)
idx = np.clip(np.digitize(oof, bins) - 1, 0, 9)
oof_calibration = []
for b in range(10):
    m = idx == b
    if m.sum() < 50:
        continue
    oof_calibration.append({
        "bin": f"{bins[b]:.1f}-{bins[b + 1]:.1f}",
        "mean_predicted": round(float(oof[m].mean()), 5),
        "observed_rate": round(float(y[m].mean()), 5),
        "n": int(m.sum()),
    })

# ---------------------------------------------------------------------------
# write
# ---------------------------------------------------------------------------
out = {
    "procedure": (
        f"{P.CV_SPLITS}-fold cross-validation grouped by {P.CV_GROUP}, over "
        f"{len(GRID)} candidate settings ({len(GRID) * P.CV_SPLITS} fits). Scored "
        f"by the area under the precision-recall curve. test.csv was not read."
    ),
    "why_grouped": (
        "If one day's flights were spread across folds, a model could learn that "
        "day's disruption in four folds and be rewarded for it in the fifth. "
        "Grouping by date removes that route."
    ),
    "why_small_grid": (
        "An earlier version of this project searched 62 settings; the best beat "
        "the setting already in use by 0.0021 of curve area. The settings are not "
        "the constraint on this problem, the features are, so the grid spans the "
        "choices that change behaviour and stops there."
    ),
    "test_read": False,
    "rows_used": int(len(train)),
    "rows_available": int(rows_available),
    "features": FEATURES,
    "base_rate": base_rate,
    "n_candidates": len(GRID),
    "n_fits": len(GRID) * P.CV_SPLITS,
    "folds": fold_meta,
    "results": results,
    "best": best,
    "spread_between_candidates": float(spread),
    "gap_to_baseline": float(ranked[0]["mean_score"] - np.mean(base_folds)),
    "winner_by_fold": winner_folds,
    "threshold": {
        "value": threshold,
        "rule": P.THRESHOLD_RULE,
        "precision": float(prec[i]),
        "recall": float(rec[i]),
        "balance": float(balance[i]),
        "chosen_on": (
            "the pooled out-of-fold predictions: every flight scored by a model "
            "that was not fitted on its day"
        ),
    },
    "threshold_sweep": sweep,
    "oof_calibration": oof_calibration,
}
with open(P.ART / "p3_selection.json", "w", encoding="utf-8") as fh:
    json.dump(out, fh, indent=2)
np.save(P.ART / "p3_oof_best.npy", oof)
print("\nwrote artifacts/p3_selection.json")

print("\n" + "=" * 74)
print(f"P3 complete. Winner: {best['model']} {best['settings']}")
print("Nothing was read from test.csv.")
print("=" * 74)
