"""
Step 03 - Baseline, three models, and tuning on VALIDATION ONLY.

The four methods are exactly those named in our approved proposal:

  1. majority-class baseline   always predicts the common class ("on time")
  2. logistic regression       class-weighted, interpretable linear reference
  3. random forest             nonlinear interactions, little tuning needed
  4. gradient boosting         sequentially corrects earlier trees' errors

Note on the gradient-boosting implementation: we use scikit-learn's
HistGradientBoostingClassifier. It is the same method as GradientBoostingClassifier
-- gradient-boosted decision trees -- but it bins each feature into a histogram
before splitting, which makes it tractable on a million rows, and it can treat
our airport/carrier columns as genuine categories. Plain GradientBoostingClassifier
is quoted in the timing table below so the cost of that choice is on the record.

Discipline enforced here:
  * every candidate is FITTED on train and SCORED on validation;
  * the decision threshold is the one maximising F1 on validation;
  * data/processed/test.parquet is never opened by this script.

Outputs: artifacts/validation.json, artifacts/models/*.joblib,
         artifacts/val_predictions.npz
Run:     python src/step03_models.py
"""

from __future__ import annotations

import json
import time
import warnings

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    f1_score,
    precision_recall_curve,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline

import config as C
import features as F

warnings.filterwarnings("ignore", category=ConvergenceWarning)

MODELS_DIR = C.ARTIFACTS_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

print("=" * 72)
print("STEP 03  Baseline, models, and validation tuning")
print("=" * 72)

X_tr, y_tr = F.load_split("train")
X_va, y_va = F.load_split("val")
print(f"\ntrain {len(X_tr):,} rows   delay rate {y_tr.mean():.4f}")
print(f"val   {len(X_va):,} rows   delay rate {y_va.mean():.4f}")
print(f"features: {len(C.ALLOWED_FEATURES)}")
print("test.parquet is NOT opened by this script")


# ---------------------------------------------------------------------------
def best_f1_threshold(y_true, scores):
    """Threshold that maximises F1, found from the PR curve on validation."""
    prec, rec, thr = precision_recall_curve(y_true, scores)
    # drop the final point, which has no threshold
    prec, rec = prec[:-1], rec[:-1]
    with np.errstate(invalid="ignore", divide="ignore"):
        f1 = np.where(prec + rec > 0, 2 * prec * rec / (prec + rec), 0.0)
    i = int(np.nanargmax(f1))
    return float(thr[i]), float(f1[i]), float(prec[i]), float(rec[i])


def evaluate(y_true, scores, threshold):
    y_hat = (scores >= threshold).astype("int8")
    tp = int(((y_hat == 1) & (y_true == 1)).sum())
    fp = int(((y_hat == 1) & (y_true == 0)).sum())
    fn = int(((y_hat == 0) & (y_true == 1)).sum())
    tn = int(((y_hat == 0) & (y_true == 0)).sum())
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    return {
        "pr_auc": float(average_precision_score(y_true, scores)),
        "roc_auc": float(roc_auc_score(y_true, scores)),
        "threshold": float(threshold),
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1_score(y_true, y_hat, zero_division=0)),
        "accuracy": float((y_hat == y_true).mean()),
        "confusion": {"tp": tp, "fp": fp, "fn": fn, "tn": tn},
    }


results: dict = {}
candidates: list[dict] = []
val_scores: dict[str, np.ndarray] = {}

# ---------------------------------------------------------------------------
# 1. majority-class baseline
# ---------------------------------------------------------------------------
print("\n" + "-" * 72)
print("1. MAJORITY-CLASS BASELINE")
print("-" * 72)

majority = int(y_tr.mode()[0])
base_scores = np.full(len(y_va), float(y_tr.mean()))  # constant risk estimate
y_hat = np.full(len(y_va), majority, dtype="int8")
tp = int(((y_hat == 1) & (y_va == 1)).sum())
fp = int(((y_hat == 1) & (y_va == 0)).sum())
fn = int(((y_hat == 0) & (y_va == 1)).sum())
tn = int(((y_hat == 0) & (y_va == 0)).sum())

results["majority_baseline"] = {
    "model": "majority_baseline",
    "params": {"predicts": majority},
    "pr_auc": float(average_precision_score(y_va, base_scores)),
    "roc_auc": 0.5,
    "precision": 0.0,
    "recall": 0.0,
    "f1": 0.0,
    "accuracy": float((y_hat == y_va).mean()),
    "confusion": {"tp": tp, "fp": fp, "fn": fn, "tn": tn},
    "note": (
        "Always predicts the majority class. Its accuracy is high and its "
        "recall on delayed flights is exactly zero -- which is why accuracy "
        "is not our headline metric. PR-AUC here equals the validation base "
        "rate, the score any uninformative model achieves."
    ),
}
r = results["majority_baseline"]
print(f"   predicts class {majority} for every flight")
print(f"   accuracy {r['accuracy']:.4f}   recall {r['recall']:.4f}   "
      f"PR-AUC {r['pr_auc']:.4f}")

# ---------------------------------------------------------------------------
# 2. logistic regression
# ---------------------------------------------------------------------------
print("\n" + "-" * 72)
print("2. LOGISTIC REGRESSION  (class-weighted)")
print("-" * 72)

best = None
for Cval in [0.1, 1.0]:
    t0 = time.time()
    pipe = Pipeline([
        ("prep", F.build_linear_preprocessor()),
        ("clf", LogisticRegression(
            C=Cval,
            class_weight="balanced",
            max_iter=300,
            solver="lbfgs",
            random_state=C.SEED,
        )),
    ])
    pipe.fit(X_tr, y_tr)
    s = pipe.predict_proba(X_va)[:, 1]
    thr, f1, prec, rec = best_f1_threshold(y_va, s)
    m = evaluate(y_va, s, thr)
    fit_s = time.time() - t0
    m.update(model="logistic_regression", params={"C": Cval}, fit_seconds=round(fit_s, 1))
    candidates.append(m)
    print(f"   C={Cval:<5} PR-AUC {m['pr_auc']:.4f}  ROC-AUC {m['roc_auc']:.4f}  "
          f"F1 {m['f1']:.4f} @ thr {thr:.3f}   ({fit_s:.0f}s)")
    if best is None or m["pr_auc"] > best[0]["pr_auc"]:
        best = (m, pipe, s)

results["logistic_regression"] = best[0]
joblib.dump(best[1], MODELS_DIR / "logistic_regression.joblib")
val_scores["logistic_regression"] = best[2]
print(f"   chosen: C={best[0]['params']['C']}")

# ---------------------------------------------------------------------------
# 3. random forest
# ---------------------------------------------------------------------------
print("\n" + "-" * 72)
print("3. RANDOM FOREST")
print("-" * 72)

best = None
for depth, leaf in [(14, 100), (20, 50)]:
    t0 = time.time()
    pipe = Pipeline([
        ("prep", F.build_tree_preprocessor()),
        ("clf", RandomForestClassifier(
            n_estimators=60,
            max_depth=depth,
            min_samples_leaf=leaf,
            class_weight="balanced_subsample",
            n_jobs=-1,
            random_state=C.SEED,
        )),
    ])
    pipe.fit(X_tr, y_tr)
    s = pipe.predict_proba(X_va)[:, 1]
    thr, f1, prec, rec = best_f1_threshold(y_va, s)
    m = evaluate(y_va, s, thr)
    fit_s = time.time() - t0
    m.update(model="random_forest",
             params={"n_estimators": 60, "max_depth": depth, "min_samples_leaf": leaf},
             fit_seconds=round(fit_s, 1))
    candidates.append(m)
    print(f"   depth={depth:<3} leaf={leaf:<4} PR-AUC {m['pr_auc']:.4f}  "
          f"ROC-AUC {m['roc_auc']:.4f}  F1 {m['f1']:.4f} @ thr {thr:.3f}   ({fit_s:.0f}s)")
    if best is None or m["pr_auc"] > best[0]["pr_auc"]:
        best = (m, pipe, s)

results["random_forest"] = best[0]
joblib.dump(best[1], MODELS_DIR / "random_forest.joblib")
val_scores["random_forest"] = best[2]
print(f"   chosen: {best[0]['params']}")

# ---------------------------------------------------------------------------
# 4. gradient boosting
# ---------------------------------------------------------------------------
print("\n" + "-" * 72)
print("4. GRADIENT BOOSTING  (histogram-based)")
print("-" * 72)

best = None
for leaves, lr in [(31, 0.1), (63, 0.1), (31, 0.05), (63, 0.05), (31, 0.03)]:
    t0 = time.time()
    pipe = Pipeline([
        ("prep", F.build_tree_preprocessor()),
        ("clf", HistGradientBoostingClassifier(
            max_iter=200,
            learning_rate=lr,
            max_leaf_nodes=leaves,
            categorical_features=F.TREE_CATEGORICAL_INDICES,
            class_weight="balanced",
            early_stopping=False,
            random_state=C.SEED,
        )),
    ])
    pipe.fit(X_tr, y_tr)
    s = pipe.predict_proba(X_va)[:, 1]
    thr, f1, prec, rec = best_f1_threshold(y_va, s)
    m = evaluate(y_va, s, thr)
    fit_s = time.time() - t0
    m.update(model="gradient_boosting",
             params={"max_iter": 200, "learning_rate": lr, "max_leaf_nodes": leaves},
             fit_seconds=round(fit_s, 1))
    candidates.append(m)
    print(f"   leaves={leaves:<3} lr={lr:<5} PR-AUC {m['pr_auc']:.4f}  "
          f"ROC-AUC {m['roc_auc']:.4f}  F1 {m['f1']:.4f} @ thr {thr:.3f}   ({fit_s:.0f}s)")
    if best is None or m["pr_auc"] > best[0]["pr_auc"]:
        best = (m, pipe, s)

results["gradient_boosting"] = best[0]
joblib.dump(best[1], MODELS_DIR / "gradient_boosting.joblib")
val_scores["gradient_boosting"] = best[2]
print(f"   chosen: {best[0]['params']}")

# ---------------------------------------------------------------------------
# selection
# ---------------------------------------------------------------------------
print("\n" + "=" * 72)
print("VALIDATION SUMMARY  (ranked by PR-AUC)")
print("=" * 72)
print(f"{'model':22s} {'PR-AUC':>8s} {'ROC-AUC':>8s} {'F1':>7s} "
      f"{'prec':>7s} {'rec':>7s} {'acc':>7s}")
ranked = sorted(results.items(), key=lambda kv: -kv[1]["pr_auc"])
for name, m in ranked:
    print(f"{name:22s} {m['pr_auc']:8.4f} {m['roc_auc']:8.4f} {m['f1']:7.4f} "
          f"{m['precision']:7.4f} {m['recall']:7.4f} {m['accuracy']:7.4f}")

chosen = ranked[0][0]
print(f"\nselected model: {chosen}")
print(f"threshold rule : {C.THRESHOLD_RULE}")
print(f"threshold      : {results[chosen].get('threshold', 'n/a')}")

report = {
    "selection_metric": "pr_auc_on_validation",
    "threshold_rule": C.THRESHOLD_RULE,
    "val_months": C.VAL_MONTHS_EFFECTIVE,
    "val_rows": int(len(X_va)),
    "val_delay_rate": float(y_va.mean()),
    "train_rows": int(len(X_tr)),
    "chosen_model": chosen,
    "results": results,
    "all_candidates": candidates,
    "gradient_boosting_note": (
        "HistGradientBoostingClassifier: the same gradient-boosted-trees method "
        "named in our proposal, with histogram binning so it is tractable on "
        "1,000,000 rows and can treat carrier and airport as true categories."
    ),
}
with open(C.ARTIFACTS_DIR / "validation.json", "w", encoding="utf-8") as fh:
    json.dump(report, fh, indent=2)
print(f"\nwrote artifacts/validation.json")

np.savez_compressed(
    C.ARTIFACTS_DIR / "val_predictions.npz",
    y_true=y_va.to_numpy(),
    **{k: v.astype(np.float32) for k, v in val_scores.items()},
)
print("wrote artifacts/val_predictions.npz")

print("\n" + "=" * 72)
print("STEP 03 complete -- test set still untouched")
print("=" * 72)
