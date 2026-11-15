"""
Step 06 - Rolling-origin cross-validation (robustness check).

WHY THIS EXISTS
---------------
Our main design tunes on a single validation month (September), because October
had to be dropped for the airport-code defect. One month is thin evidence for
choosing between models: the ranking could easily be the noise of one unusual
September rather than a real difference.

Ordinary k-fold cross-validation is not the fix. Shuffling flights at random
puts December in the training folds and June in the held-out fold, so the model
learns from the future -- exactly the leakage the chronological split exists to
prevent. The time-aware equivalent is ROLLING-ORIGIN (expanding-window) CV:
each fold trains on everything up to a month and validates on the month after.

  fold 1   train Jan-Apr   -> validate May
  fold 2   train Jan-May   -> validate Jun
  fold 3   train Jan-Jun   -> validate Jul
  fold 4   train Jan-Jul   -> validate Aug
  fold 5   train Jan-Aug   -> validate Sep     (our actual split)

WHAT THIS IS AND IS NOT
-----------------------
This is a ROBUSTNESS CHECK, not a re-selection. The test set has already been
used once, so the published test numbers are fixed. If this check disagreed
with our single-month choice, the honest response is to report the
disagreement -- not to pick a new model and quietly re-score the test set,
which would turn one honest test into a second round of tuning.

The test months (November, December) are never loaded by this script, and an
assertion enforces it.

Metric: PR-AUC expressed as LIFT over each fold's own base rate. Raw PR-AUC is
not comparable across months because it scales with the base rate, and the
monthly delay rate varies a lot.

Outputs: artifacts/rolling_cv.json, artifacts/figures/rolling_cv.png,
         docs/data/rolling_cv.json
Run:     python src/step06_rolling_cv.py
"""

from __future__ import annotations

import json
import time
import warnings

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.pipeline import Pipeline

import config as C
import features as F

warnings.filterwarnings("ignore", category=ConvergenceWarning)

MAX_TRAIN = 600_000   # per fold, seeded; keeps 15 fits tractable on a laptop

FOLDS = [
    ([1, 2, 3, 4], 5),
    ([1, 2, 3, 4, 5], 6),
    ([1, 2, 3, 4, 5, 6], 7),
    ([1, 2, 3, 4, 5, 6, 7], 8),
    ([1, 2, 3, 4, 5, 6, 7, 8], 9),
]

print("=" * 72)
print("STEP 06  Rolling-origin cross-validation (robustness check)")
print("=" * 72)

# ---------------------------------------------------------------------------
# guard: the test months must never be touched
# ---------------------------------------------------------------------------
months_used = sorted({m for tr, va in FOLDS for m in tr} | {va for _, va in FOLDS})
forbidden = set(months_used) & set(C.TEST_MONTHS)
assert not forbidden, f"FATAL: fold definition touches test months {forbidden}"
print(f"\nmonths used by this script: {months_used}")
print(f"test months ({C.TEST_MONTHS}) are never loaded  [asserted]")

# ---------------------------------------------------------------------------
# load and clean, exactly as step 02 does
# ---------------------------------------------------------------------------
dtypes = {
    "MONTH": "int8", "DAY": "int8", "DAY_OF_WEEK": "int8",
    "AIRLINE": "category", "ORIGIN_AIRPORT": "category",
    "DESTINATION_AIRPORT": "category",
    "SCHEDULED_DEPARTURE": "int16", "SCHEDULED_ARRIVAL": "int16",
    "SCHEDULED_TIME": "float32", "DISTANCE": "int16",
    "ARRIVAL_DELAY": "float32", "CANCELLED": "int8", "DIVERTED": "int8",
}
print("\nloading Jan-Sep ...")
df = pd.read_csv(C.FLIGHTS_CSV, usecols=C.RAW_COLUMNS_TO_READ, dtype=dtypes)
df = df[df["MONTH"].isin(months_used)]                 # never 10, 11, 12
df = df[(df["CANCELLED"] == 0) & (df["DIVERTED"] == 0)]
df = df[df["ARRIVAL_DELAY"].notna()]

df[C.TARGET_COLUMN] = (df["ARRIVAL_DELAY"] >= C.DELAY_THRESHOLD_MINUTES).astype("int8")
df["SCHED_DEP_HOUR"] = (df["SCHEDULED_DEPARTURE"] // 100).clip(0, 23).astype("int8")
df["SCHED_ARR_HOUR"] = (df["SCHEDULED_ARRIVAL"] // 100).clip(0, 23).astype("int8")
df["IS_WEEKEND"] = df["DAY_OF_WEEK"].isin([6, 7]).astype("int8")
df = df[C.ALLOWED_FEATURES + [C.TARGET_COLUMN]]
C.assert_no_leakage(df.columns)
assert not set(df["MONTH"].unique()) & set(C.TEST_MONTHS)
print(f"{len(df):,} labelled flights, months {sorted(df['MONTH'].unique())}")


def make_models():
    """The same three methods and chosen settings as the main run."""
    return {
        "logistic_regression": Pipeline([
            ("prep", F.build_linear_preprocessor()),
            ("clf", LogisticRegression(C=1.0, class_weight="balanced",
                                       max_iter=300, solver="lbfgs",
                                       random_state=C.SEED)),
        ]),
        "random_forest": Pipeline([
            ("prep", F.build_tree_preprocessor()),
            ("clf", RandomForestClassifier(n_estimators=60, max_depth=20,
                                           min_samples_leaf=50,
                                           class_weight="balanced_subsample",
                                           n_jobs=-1, random_state=C.SEED)),
        ]),
        "gradient_boosting": Pipeline([
            ("prep", F.build_tree_preprocessor()),
            ("clf", HistGradientBoostingClassifier(
                max_iter=200, learning_rate=0.05, max_leaf_nodes=31,
                categorical_features=F.TREE_CATEGORICAL_INDICES,
                class_weight="balanced", early_stopping=False,
                random_state=C.SEED)),
        ]),
    }


# ---------------------------------------------------------------------------
# run the folds
# ---------------------------------------------------------------------------
rows = []
rng = np.random.default_rng(C.SEED)

for i, (tr_months, va_month) in enumerate(FOLDS, 1):
    tr = df[df["MONTH"].isin(tr_months)]
    va = df[df["MONTH"] == va_month]
    if len(tr) > MAX_TRAIN:
        tr = tr.sample(n=MAX_TRAIN, random_state=C.SEED)

    X_tr, y_tr = tr[C.ALLOWED_FEATURES], tr[C.TARGET_COLUMN]
    X_va, y_va = va[C.ALLOWED_FEATURES], va[C.TARGET_COLUMN]
    base = float(y_va.mean())

    mon = lambda m: pd.Timestamp(2015, m, 1).strftime("%b")
    print(f"\n--- fold {i}: train {mon(tr_months[0])}-{mon(tr_months[-1])} "
          f"({len(X_tr):,}) -> validate {mon(va_month)} ({len(X_va):,}), "
          f"base rate {base:.4f} ---")

    for name, pipe in make_models().items():
        t0 = time.time()
        pipe.fit(X_tr, y_tr)
        s = pipe.predict_proba(X_va)[:, 1]
        pr = float(average_precision_score(y_va, s))
        roc = float(roc_auc_score(y_va, s))
        rows.append({
            "fold": i,
            "train_months": tr_months,
            "val_month": va_month,
            "model": name,
            "n_train": int(len(X_tr)),
            "n_val": int(len(X_va)),
            "base_rate": base,
            "pr_auc": pr,
            "lift": round(pr / base, 4),
            "roc_auc": roc,
            "fit_seconds": round(time.time() - t0, 1),
        })
        print(f"    {name:22s} PR-AUC {pr:.4f}  lift {pr/base:.3f}x  "
              f"ROC-AUC {roc:.4f}  ({time.time()-t0:.0f}s)")

# ---------------------------------------------------------------------------
# summarise
# ---------------------------------------------------------------------------
res = pd.DataFrame(rows)

print("\n" + "=" * 72)
print("LIFT BY FOLD  (PR-AUC / that month's base rate)")
print("=" * 72)
piv = res.pivot(index="val_month", columns="model", values="lift")
piv.index = [pd.Timestamp(2015, m, 1).strftime("%b") for m in piv.index]
print(piv.to_string(float_format=lambda x: f"{x:.3f}"))

print("\nmean +/- std across folds:")
summary = {}
for name, g in res.groupby("model"):
    mean, std = g["lift"].mean(), g["lift"].std()
    summary[name] = {
        "mean_lift": float(mean),
        "std_lift": float(std),
        "min_lift": float(g["lift"].min()),
        "max_lift": float(g["lift"].max()),
        "mean_pr_auc": float(g["pr_auc"].mean()),
        "mean_roc_auc": float(g["roc_auc"].mean()),
        "folds_won": 0,
    }
    print(f"  {name:22s} {mean:.3f} +/- {std:.3f}   "
          f"(min {g['lift'].min():.3f}, max {g['lift'].max():.3f})")

# how often does each model win a fold?
for f, g in res.groupby("fold"):
    summary[g.loc[g["lift"].idxmax(), "model"]]["folds_won"] += 1
print("\nfolds won (by lift):")
for name, s in summary.items():
    print(f"  {name:22s} {s['folds_won']} of {len(FOLDS)}")

ranked = sorted(summary.items(), key=lambda kv: -kv[1]["mean_lift"])
cv_best = ranked[0][0]

with open(C.ARTIFACTS_DIR / "validation.json", encoding="utf-8") as fh:
    single_choice = json.load(fh)["chosen_model"]

agrees = cv_best == single_choice
gap = ranked[0][1]["mean_lift"] - ranked[1][1]["mean_lift"]
within_noise = gap < max(ranked[0][1]["std_lift"], ranked[1][1]["std_lift"])

print("\n" + "=" * 72)
print(f"single-month choice (step 03) : {single_choice}")
print(f"rolling-CV best mean lift     : {cv_best}")
print(f"agree?                        : {agrees}")
print(f"gap to runner-up              : {gap:.3f} lift "
      f"({'inside' if within_noise else 'outside'} fold-to-fold noise)")
print("=" * 72)

verdict = (
    f"Rolling-origin CV over {len(FOLDS)} folds agrees with the single-month "
    f"choice ({single_choice})."
    if agrees else
    f"Rolling-origin CV favours {cv_best}, while the single September month "
    f"chose {single_choice}. We report the disagreement rather than re-pick: "
    f"the test set has been used once and re-scoring a newly chosen model "
    f"would invalidate it."
)
if within_noise:
    verdict += (
        " The gap to the runner-up is smaller than the fold-to-fold spread, so "
        "the fair reading is that the models are not meaningfully different "
        "from one another -- which is exactly what the test set also showed."
    )
print("\n" + verdict)

out = {
    "purpose": "robustness check on model selection; not used to re-select",
    "why_not_kfold": (
        "Random k-fold would place later flights in training and earlier "
        "flights in the held-out fold, learning from the future. Rolling-origin "
        "CV preserves time order: each fold trains on all months before the "
        "month it validates on."
    ),
    "test_months_touched": False,
    "max_train_per_fold": MAX_TRAIN,
    "seed": C.SEED,
    "metric": "PR-AUC as lift over each fold's own base rate",
    "folds": rows,
    "summary": summary,
    "single_month_choice": single_choice,
    "rolling_cv_best": cv_best,
    "agrees_with_single_month": bool(agrees),
    "gap_to_runner_up": float(gap),
    "gap_within_fold_noise": bool(within_noise),
    "verdict": verdict,
}
for path in (C.ARTIFACTS_DIR / "rolling_cv.json", C.DOCS_DATA_DIR / "rolling_cv.json"):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2)
    print(f"wrote {path.relative_to(C.REPO_ROOT)}")

# ---------------------------------------------------------------------------
# figure
# ---------------------------------------------------------------------------
colors = {"logistic_regression": "#2a78d6", "random_forest": "#eb6834",
          "gradient_boosting": "#1baf7a"}
fig, ax = plt.subplots(figsize=(7.5, 4))
for name, g in res.groupby("model"):
    g = g.sort_values("val_month")
    ax.plot([pd.Timestamp(2015, m, 1).strftime("%b") for m in g["val_month"]],
            g["lift"], "o-", lw=2, markersize=7, color=colors[name],
            label=name.replace("_", " "))
ax.axhline(1.0, ls="--", color="#86857f", lw=1.2, label="baseline (no skill)")
ax.set_ylabel("PR-AUC lift over base rate")
ax.set_xlabel("Validation month (trained on everything before it)")
ax.set_title("Rolling-origin cross-validation — months Jan-Sep only")
ax.legend(frameon=False, fontsize=8.5)
ax.spines[["top", "right"]].set_visible(False)
fig.savefig(C.FIGURES_DIR / "rolling_cv.png", dpi=150, bbox_inches="tight")
fig.savefig(C.DOCS_DIR / "figures" / "rolling_cv.png", dpi=150, bbox_inches="tight")
plt.close(fig)
print("wrote artifacts/figures/rolling_cv.png")

print("\n" + "=" * 72)
print("STEP 06 complete -- test set still untouched by this script")
print("=" * 72)
