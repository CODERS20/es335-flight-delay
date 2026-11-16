"""
Step 08 - Wide search over model settings (validation + repeated held-out only).

WHY, AND WHAT THIS CAN AND CANNOT CHANGE
----------------------------------------
Step 03 tuned over a deliberately small grid. The fair question is whether a
wider search would have found something materially better. This script answers
it -- without touching the test set, which has been scored once and cannot be
reopened. Re-scoring November-December against a newly tuned model would mean
the final numbers had been tuned against, which is the one thing the evaluation
design exists to prevent.

So this script can tell us:
  * how much headroom hyperparameter tuning ever had on this problem;
  * whether our step-03 choice was a reasonable one or a lucky one.

It cannot, and does not, produce a new headline test number.

THE DECISION RULE, FIXED BEFORE LOOKING
---------------------------------------
A configuration counts as MATERIALLY better only if it beats the step-03
configuration by at least MATERIAL_MARGIN mean lift across the rolling-origin
folds -- not on the single September month, which is exactly the thin evidence
that misled us once already. Anything smaller is noise we decline to chase.

Stage 1  wide grid, train -> September            (fast, many configs)
Stage 2  top few configs re-run across 4 rolling folds (slower, honest)

Outputs: artifacts/grid_search.json, docs/data/grid_search.json,
         artifacts/figures/grid_search.png
Run:     python src/step08_grid_search.py
"""

from __future__ import annotations

import itertools
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

MATERIAL_MARGIN = 0.005     # mean CV lift; fixed before any result is seen
CV_FOLDS = [([1, 2, 3, 4, 5], 6), ([1, 2, 3, 4, 5, 6], 7),
            ([1, 2, 3, 4, 5, 6, 7], 8), ([1, 2, 3, 4, 5, 6, 7, 8], 9)]
CV_MAX_TRAIN = 500_000
TOP_K = 3                   # configs per model carried into stage 2

print("=" * 72)
print("STEP 08  Wide grid search (validation + rolling CV; test untouched)")
print("=" * 72)
print(f"\ndecision rule fixed in advance: a config must beat the step-03 choice")
print(f"by >= {MATERIAL_MARGIN} in the mean ratio to the base rate to count.")

X_tr, y_tr = F.load_split("train")
X_va, y_va = F.load_split("val")
base_va = float(y_va.mean())
print(f"\ntrain {len(X_tr):,}   validation {len(X_va):,} (base rate {base_va:.4f})")

with open(C.ARTIFACTS_DIR / "validation.json", encoding="utf-8") as fh:
    step03 = json.load(fh)
incumbent = {k: v.get("params") for k, v in step03["results"].items() if v.get("params")}
print(f"step-03 incumbent: {step03['chosen_model']} {incumbent.get(step03['chosen_model'])}")


# ---------------------------------------------------------------------------
# the grid
# ---------------------------------------------------------------------------
def lr_grid():
    for Cv, w in itertools.product([0.01, 0.1, 1.0, 10.0], ["balanced", None]):
        yield {"C": Cv, "class_weight": w}


def rf_grid():
    for n, d, leaf in itertools.product([60, 120], [14, 20, 28], [20, 50, 100]):
        yield {"n_estimators": n, "max_depth": d, "min_samples_leaf": leaf}


def gb_grid():
    for lr_, leaves, it, l2 in itertools.product(
        [0.03, 0.05, 0.1], [31, 63, 127], [200, 400], [0.0, 1.0]
    ):
        yield {"learning_rate": lr_, "max_leaf_nodes": leaves,
               "max_iter": it, "l2_regularization": l2}


def build(model: str, p: dict) -> Pipeline:
    if model == "logistic_regression":
        return Pipeline([
            ("prep", F.build_linear_preprocessor()),
            ("clf", LogisticRegression(C=p["C"], class_weight=p.get("class_weight", "balanced"),
                                       max_iter=300, solver="lbfgs",
                                       random_state=C.SEED)),
        ])
    if model == "random_forest":
        return Pipeline([
            ("prep", F.build_tree_preprocessor()),
            ("clf", RandomForestClassifier(
                n_estimators=p["n_estimators"], max_depth=p["max_depth"],
                min_samples_leaf=p.get("min_samples_leaf", 50),
                class_weight="balanced_subsample", n_jobs=-1,
                random_state=C.SEED)),
        ])
    return Pipeline([
        ("prep", F.build_tree_preprocessor()),
        ("clf", HistGradientBoostingClassifier(
            learning_rate=p["learning_rate"], max_leaf_nodes=p["max_leaf_nodes"],
            max_iter=p["max_iter"], l2_regularization=p.get("l2_regularization", 0.0),
            categorical_features=F.TREE_CATEGORICAL_INDICES,
            class_weight="balanced", early_stopping=False,
            random_state=C.SEED)),
    ])


GRIDS = {
    "logistic_regression": list(lr_grid()),
    "random_forest": list(rf_grid()),
    "gradient_boosting": list(gb_grid()),
}
total = sum(len(g) for g in GRIDS.values())
print(f"\nstage 1: {total} configurations "
      f"({', '.join(f'{k.split(chr(95))[0]} {len(v)}' for k, v in GRIDS.items())})")

# ---------------------------------------------------------------------------
# stage 1
# ---------------------------------------------------------------------------
STAGE1_CACHE = C.ARTIFACTS_DIR / "grid_search_stage1.json"

stage1 = []
t_start = time.time()
done = 0

# Stage 1 is ~85 minutes of fitting. If a previous run completed it over this
# exact grid, reuse those numbers instead of recomputing them: every fit is
# seeded, so a re-run reproduces them exactly.
if STAGE1_CACHE.exists():
    with open(STAGE1_CACHE, encoding="utf-8") as fh:
        cached = json.load(fh)
    want = [(m, q) for m, g in GRIDS.items() for q in g]
    have = [(r["model"], r["params"]) for r in cached]
    if have == want:
        stage1 = cached
        print(f"\nstage 1: reusing {len(stage1)} cached results from "
              f"{STAGE1_CACHE.name} (identical grid, identical seed)")
    else:
        print("\nstage 1 cache does not match the current grid -- recomputing")

for model, grid in ({} if stage1 else GRIDS).items():
    print(f"\n--- {model} ({len(grid)} configs) ---")
    for p in grid:
        t0 = time.time()
        pipe = build(model, p)
        pipe.fit(X_tr, y_tr)
        s = pipe.predict_proba(X_va)[:, 1]
        pr = float(average_precision_score(y_va, s))
        rec = {"model": model, "params": p, "pr_auc": pr,
               "lift": round(pr / base_va, 4),
               "roc_auc": float(roc_auc_score(y_va, s)),
               "fit_seconds": round(time.time() - t0, 1)}
        stage1.append(rec)
        done += 1
        print(f"  [{done:>2}/{total}] {str(p):62s} PR-AUC {pr:.4f}  "
              f"lift {pr/base_va:.3f}x  ({rec['fit_seconds']:.0f}s)")

if done:
    with open(STAGE1_CACHE, "w", encoding="utf-8") as fh:
        json.dump(stage1, fh, indent=2)
    print(f"\nstage 1 complete in {(time.time()-t_start)/60:.1f} min -- cached")

df1 = pd.DataFrame(stage1)
print("\nbest per model on September:")
for model, g in df1.groupby("model"):
    b = g.loc[g["pr_auc"].idxmax()]
    print(f"  {model:22s} {b['pr_auc']:.4f}  {b['params']}")

# ---------------------------------------------------------------------------
# stage 2 -- rolling CV on the shortlist
# ---------------------------------------------------------------------------
shortlist = []
for model, g in df1.groupby("model"):
    for _, r in g.nlargest(TOP_K, "pr_auc").iterrows():
        shortlist.append({"model": model, "params": r["params"],
                          "sep_pr_auc": r["pr_auc"]})
# always carry the incumbent through, even if the wide grid ranks it lower
for model, p in incumbent.items():
    if model in GRIDS and not any(
        s["model"] == model and s["params"] == p for s in shortlist
    ):
        shortlist.append({"model": model, "params": p, "sep_pr_auc": None,
                          "incumbent": True})

print(f"\nstage 2: {len(shortlist)} configs x {len(CV_FOLDS)} rolling folds")

dtypes = {"MONTH": "int8", "DAY": "int8", "DAY_OF_WEEK": "int8",
          "AIRLINE": "category", "ORIGIN_AIRPORT": "category",
          "DESTINATION_AIRPORT": "category", "SCHEDULED_DEPARTURE": "int16",
          "SCHEDULED_ARRIVAL": "int16", "SCHEDULED_TIME": "float32",
          "DISTANCE": "int16", "ARRIVAL_DELAY": "float32",
          "CANCELLED": "int8", "DIVERTED": "int8"}
months_needed = sorted({m for tr, va in CV_FOLDS for m in tr} | {va for _, va in CV_FOLDS})
assert not set(months_needed) & set(C.TEST_MONTHS), "fold touches test months"

print(f"loading months {months_needed} (test months never loaded) ...")
df = pd.read_csv(C.FLIGHTS_CSV, usecols=C.RAW_COLUMNS_TO_READ, dtype=dtypes)
df = df[df["MONTH"].isin(months_needed)]
df = df[(df["CANCELLED"] == 0) & (df["DIVERTED"] == 0) & df["ARRIVAL_DELAY"].notna()]
df[C.TARGET_COLUMN] = (df["ARRIVAL_DELAY"] >= C.DELAY_THRESHOLD_MINUTES).astype("int8")
df["SCHED_DEP_HOUR"] = (df["SCHEDULED_DEPARTURE"] // 100).clip(0, 23).astype("int8")
df["SCHED_ARR_HOUR"] = (df["SCHEDULED_ARRIVAL"] // 100).clip(0, 23).astype("int8")
df["IS_WEEKEND"] = df["DAY_OF_WEEK"].isin([6, 7]).astype("int8")
df = df[C.ALLOWED_FEATURES + [C.TARGET_COLUMN]]
C.assert_no_leakage(df.columns)

folds_cache = []
for tr_months, va_month in CV_FOLDS:
    tr = df[df["MONTH"].isin(tr_months)]
    if len(tr) > CV_MAX_TRAIN:
        tr = tr.sample(n=CV_MAX_TRAIN, random_state=C.SEED)
    va = df[df["MONTH"] == va_month]
    folds_cache.append((tr[C.ALLOWED_FEATURES], tr[C.TARGET_COLUMN],
                        va[C.ALLOWED_FEATURES], va[C.TARGET_COLUMN],
                        va_month, float(va[C.TARGET_COLUMN].mean())))

stage2 = []
for i, cfg in enumerate(shortlist, 1):
    lifts = []
    t0 = time.time()
    for Xt, yt, Xv, yv, vm, base in folds_cache:
        pipe = build(cfg["model"], cfg["params"])
        pipe.fit(Xt, yt)
        pr = float(average_precision_score(yv, pipe.predict_proba(Xv)[:, 1]))
        lifts.append(pr / base)
    rec = {**cfg, "cv_lifts": [round(x, 4) for x in lifts],
           "cv_mean_lift": float(np.mean(lifts)),
           "cv_std_lift": float(np.std(lifts, ddof=1)),
           "seconds": round(time.time() - t0, 1)}
    stage2.append(rec)
    tag = "  <- step-03 choice" if cfg.get("incumbent") else ""
    print(f"  [{i:>2}/{len(shortlist)}] {cfg['model']:20s} "
          f"mean lift {rec['cv_mean_lift']:.4f} +/- {rec['cv_std_lift']:.4f}"
          f"{tag}  ({rec['seconds']:.0f}s)")

# ---------------------------------------------------------------------------
# verdict
# ---------------------------------------------------------------------------
stage2.sort(key=lambda r: -r["cv_mean_lift"])
best = stage2[0]

inc = next(
    (r for r in stage2
     if r["model"] == step03["chosen_model"]
     and r["params"] == incumbent[step03["chosen_model"]]),
    None,
)

print("\n" + "=" * 72)
print("RANKING BY MEAN ROLLING-CV LIFT")
print("=" * 72)
for r in stage2:
    mark = " <- step-03 choice" if r is inc else ""
    print(f"  {r['cv_mean_lift']:.4f} +/- {r['cv_std_lift']:.4f}  "
          f"{r['model']:20s} {str(r['params'])[:58]}{mark}")

gain = best["cv_mean_lift"] - (inc["cv_mean_lift"] if inc else float("nan"))
material = bool(gain >= MATERIAL_MARGIN)

print("\n" + "=" * 72)
print(f"best found        : {best['model']} {best['params']}")
print(f"                    mean CV lift {best['cv_mean_lift']:.4f}")
if inc:
    print(f"step-03 incumbent : {inc['model']} {inc['params']}")
    print(f"                    mean CV lift {inc['cv_mean_lift']:.4f}")
    print(f"gain              : {gain:+.4f} lift")
    print(f"material (>= {MATERIAL_MARGIN})? {material}")
print("=" * 72)

if material:
    verdict = (
        f"A wider grid found a materially better configuration "
        f"({best['model']} {best['params']}, +{gain:.4f} in the mean ratio to "
        f"the base rate). "
        f"We report this, but we do NOT re-score the test set with it: the "
        f"published test numbers were measured once against a model chosen "
        f"before they were seen, and re-tuning now would make them a tuned-on "
        f"estimate. The honest reading is that our reported test figures are a "
        f"slight under-estimate of what this model family can do."
    )
else:
    verdict = (
        f"A search {len(stage1)} sets of settings wide found nothing meaningfully "
        f"better than the step-03 choice (best gain {gain:+.4f} in the mean ratio "
        f"to the base rate, against a {MATERIAL_MARGIN} margin fixed in advance). "
        f"The model settings are not the binding constraint on this problem: the "
        f"features are. Our original configuration stands, and the published "
        f"test numbers stand with it."
    )
print("\n" + verdict)

out = {
    "purpose": "measure how much the choice of model settings could buy; test set untouched",
    "test_months_touched": False,
    "material_margin_fixed_in_advance": MATERIAL_MARGIN,
    "n_configs_stage1": len(stage1),
    "n_configs_stage2": len(stage2),
    "cv_folds": [{"train_months": t, "val_month": v} for t, v in CV_FOLDS],
    "stage1": stage1,
    "stage2": stage2,
    "best": best,
    "incumbent": inc,
    "gain_over_incumbent": float(gain) if inc else None,
    "materially_better": material,
    "verdict": verdict,
}
for p in (C.ARTIFACTS_DIR / "grid_search.json", C.DOCS_DATA_DIR / "grid_search.json"):
    with open(p, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2, default=str)
    print(f"wrote {p.relative_to(C.REPO_ROOT)}")

# ---------------------------------------------------------------------------
# figure: spread of every configuration tried
# ---------------------------------------------------------------------------
colors = {"logistic_regression": "#2a78d6", "random_forest": "#eb6834",
          "gradient_boosting": "#1baf7a"}
fig, ax = plt.subplots(figsize=(7.5, 4))
for i, (model, g) in enumerate(df1.groupby("model")):
    jitter = np.random.default_rng(C.SEED).normal(0, 0.055, len(g))
    ax.scatter(np.full(len(g), i) + jitter, g["lift"], s=26, alpha=0.75,
               color=colors[model], edgecolor="none", label=model.replace("_", " "))
ax.axhline(1.0, ls="--", color="#86857f", lw=1.2)
ax.text(2.42, 1.005, "no skill", fontsize=8, color="#86857f")
ax.set_xticks(range(3))
ax.set_xticklabels([m.replace("_", "\n") for m in sorted(df1["model"].unique())],
                   fontsize=9)
ax.set_ylabel("Curve area on September, as a ratio to the base rate")
ax.set_title(f"All {len(stage1)} settings tried — the choice of settings moves very little")
ax.spines[["top", "right"]].set_visible(False)
fig.savefig(C.FIGURES_DIR / "grid_search.png", dpi=150, bbox_inches="tight")
fig.savefig(C.DOCS_DIR / "figures" / "grid_search.png", dpi=150, bbox_inches="tight")
plt.close(fig)
print("wrote artifacts/figures/grid_search.png")

print("\n" + "=" * 72)
print("STEP 08 complete -- test set untouched")
print("=" * 72)
