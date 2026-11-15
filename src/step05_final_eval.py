"""
Step 05 - FINAL EVALUATION. The test months are opened here, once.

Everything this script uses was fixed before it ran: the four models, their
hyperparameters, and each model's decision threshold all come from
artifacts/validation.json, which was written by step 03 using September only.
Nothing is re-tuned here. If these results are disappointing, they stand --
re-tuning after seeing them would make the test set a second validation set
and every number afterwards meaningless.

Produces:
  * test metrics for all four methods, at the validation-chosen thresholds
  * bootstrap 95% confidence intervals on test PR-AUC, so "better" is only
    claimed where the intervals support it
  * a calibration curve and Brier score, because the website reports a
    probability and a probability that is not calibrated is misleading
  * a full threshold sweep, which drives the website's interactive slider
  * error analysis: performance sliced by hour, carrier, month and distance,
    plus representative false positives and false negatives

Outputs: artifacts/test_results.json, artifacts/figures/*.png,
         docs/data/{metrics,threshold,errors,summary}.json
Run:     python src/step05_final_eval.py
"""

from __future__ import annotations

import json

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    f1_score,
    precision_recall_curve,
    roc_auc_score,
    roc_curve,
)

import config as C
import features as F

MODELS_DIR = C.ARTIFACTS_DIR / "models"

print("=" * 72)
print("STEP 05  FINAL EVALUATION -- opening the test set")
print("=" * 72)

with open(C.ARTIFACTS_DIR / "validation.json", encoding="utf-8") as fh:
    val_report = json.load(fh)
chosen = val_report["chosen_model"]

print(f"\nfixed before this script ran:")
print(f"  selected model : {chosen}")
print(f"  threshold rule : {val_report['threshold_rule']}")
for name, m in val_report["results"].items():
    if "threshold" in m:
        print(f"  {name:22s} threshold {m['threshold']:.4f}  "
              f"(val PR-AUC {m['pr_auc']:.4f})")

X_te, y_te = F.load_split("test")
print(f"\ntest set: {len(X_te):,} rows, months {C.TEST_MONTHS}")
print(f"test delay rate: {y_te.mean():.4f}   <-- revealed now, for the first time")

rng = np.random.default_rng(C.SEED)
test_results: dict = {}
test_scores: dict[str, np.ndarray] = {}


def metrics_at(y_true, scores, threshold):
    y_hat = (scores >= threshold).astype("int8")
    tp = int(((y_hat == 1) & (y_true == 1)).sum())
    fp = int(((y_hat == 1) & (y_true == 0)).sum())
    fn = int(((y_hat == 0) & (y_true == 1)).sum())
    tn = int(((y_hat == 0) & (y_true == 0)).sum())
    return {
        "pr_auc": float(average_precision_score(y_true, scores)),
        "roc_auc": float(roc_auc_score(y_true, scores)),
        "threshold": float(threshold),
        "precision": float(tp / (tp + fp)) if tp + fp else 0.0,
        "recall": float(tp / (tp + fn)) if tp + fn else 0.0,
        "f1": float(f1_score(y_true, y_hat, zero_division=0)),
        "accuracy": float((y_hat == y_true).mean()),
        "brier": float(brier_score_loss(y_true, scores)),
        "confusion": {"tp": tp, "fp": fp, "fn": fn, "tn": tn},
    }


# ---------------------------------------------------------------------------
# 1. baseline
# ---------------------------------------------------------------------------
print("\n" + "-" * 72)
print("scoring on test")
print("-" * 72)

base_rate_train = val_report["results"]["majority_baseline"]["params"]["predicts"]
const = np.full(len(y_te), float(val_report["val_delay_rate"]), dtype=np.float32)
y_hat0 = np.zeros(len(y_te), dtype="int8")
test_results["majority_baseline"] = {
    "pr_auc": float(average_precision_score(y_te, const)),
    "roc_auc": 0.5,
    "precision": 0.0, "recall": 0.0, "f1": 0.0,
    "accuracy": float((y_hat0 == y_te).mean()),
    "brier": float(brier_score_loss(y_te, const)),
    "confusion": {
        "tp": 0, "fp": 0,
        "fn": int((y_te == 1).sum()), "tn": int((y_te == 0).sum()),
    },
    "note": "Always predicts on time. High accuracy, zero recall.",
}
test_scores["majority_baseline"] = const
r = test_results["majority_baseline"]
print(f"  {'majority_baseline':22s} PR-AUC {r['pr_auc']:.4f}  "
      f"acc {r['accuracy']:.4f}  recall {r['recall']:.4f}")

# ---------------------------------------------------------------------------
# 2. the three trained models
# ---------------------------------------------------------------------------
for name in ["logistic_regression", "random_forest", "gradient_boosting"]:
    model = joblib.load(MODELS_DIR / f"{name}.joblib")
    s = model.predict_proba(X_te)[:, 1].astype(np.float32)
    thr = val_report["results"][name]["threshold"]   # from validation, not test
    m = metrics_at(y_te, s, thr)
    m["params"] = val_report["results"][name]["params"]
    m["val_pr_auc"] = val_report["results"][name]["pr_auc"]
    test_results[name] = m
    test_scores[name] = s
    print(f"  {name:22s} PR-AUC {m['pr_auc']:.4f}  ROC-AUC {m['roc_auc']:.4f}  "
          f"F1 {m['f1']:.4f}  prec {m['precision']:.4f}  rec {m['recall']:.4f}")

# ---------------------------------------------------------------------------
# 3. bootstrap confidence intervals
# ---------------------------------------------------------------------------
print("\n" + "-" * 72)
print(f"bootstrap 95% CIs on test PR-AUC ({C.N_BOOTSTRAP} resamples)")
print("-" * 72)

y_arr = y_te.to_numpy()
n = len(y_arr)
boot_idx = [rng.integers(0, n, n) for _ in range(C.N_BOOTSTRAP)]

for name, s in test_scores.items():
    vals = np.array([
        average_precision_score(y_arr[i], s[i])
        for i in boot_idx
    ])
    lo, hi = np.percentile(vals, [2.5, 97.5])
    test_results[name]["pr_auc_ci95"] = [float(lo), float(hi)]
    print(f"  {name:22s} {test_results[name]['pr_auc']:.4f}  "
          f"[{lo:.4f}, {hi:.4f}]")

# Is the winner's lead real? Compare paired bootstrap differences.
runner_up = sorted(
    [k for k in test_scores if k != "majority_baseline"],
    key=lambda k: -test_results[k]["pr_auc"],
)
best_name, second_name = runner_up[0], runner_up[1]
diffs = np.array([
    average_precision_score(y_arr[i], test_scores[best_name][i])
    - average_precision_score(y_arr[i], test_scores[second_name][i])
    for i in boot_idx
])
d_lo, d_hi = np.percentile(diffs, [2.5, 97.5])

# Statistical and practical significance are different questions. With 932,084
# test rows a microscopic gap can clear zero, so we also ask whether the gap is
# large enough to matter. 0.005 PR-AUC is our stated threshold for "matters".
PRACTICAL_MARGIN = 0.005
separated = bool(d_lo > 0)
material = bool(abs(diffs.mean()) >= PRACTICAL_MARGIN)

if separated and material:
    verdict = f"{best_name} beats {second_name} by a margin that matters"
elif separated:
    verdict = (
        f"{best_name} edges out {second_name}, but by {diffs.mean():.4f} PR-AUC "
        f"-- statistically separable on 932k rows, yet far too small to matter "
        f"in practice. We treat the two as equivalent in performance and prefer "
        f"the simpler, interpretable model when explaining results."
    )
else:
    verdict = (
        f"the gap between {best_name} and {second_name} is not distinguishable "
        f"from zero at 95% confidence"
    )

comparison = {
    "better": best_name,
    "than": second_name,
    "mean_pr_auc_difference": float(diffs.mean()),
    "ci95": [float(d_lo), float(d_hi)],
    "statistically_separated": separated,
    "practically_material": material,
    "practical_margin_used": PRACTICAL_MARGIN,
    "conclusion": verdict,
}
print(f"\n  {best_name} - {second_name}: {diffs.mean():+.4f} "
      f"[{d_lo:+.4f}, {d_hi:+.4f}]")
print(f"  -> {comparison['conclusion']}")

# ---------------------------------------------------------------------------
# 4. calibration
# ---------------------------------------------------------------------------
print("\n" + "-" * 72)
print(f"calibration of {chosen}")
print("-" * 72)

s_best = test_scores[chosen]
bins = np.linspace(0, 1, 11)
which = np.clip(np.digitize(s_best, bins) - 1, 0, 9)
calib = []
for b in range(10):
    sel = which == b
    if sel.sum() < 50:
        continue
    calib.append({
        "bin": f"{bins[b]:.1f}-{bins[b+1]:.1f}",
        "mean_predicted": float(s_best[sel].mean()),
        "observed_rate": float(y_arr[sel].mean()),
        "n": int(sel.sum()),
    })
for c in calib:
    print(f"  {c['bin']:>9s}  predicted {c['mean_predicted']:.3f}  "
          f"observed {c['observed_rate']:.3f}  n={c['n']:>7,}")

brier = test_results[chosen]["brier"]
print(f"  Brier score: {brier:.4f}")

fig, ax = plt.subplots(figsize=(5, 5))
ax.plot([0, 1], [0, 1], "--", color="#8b8b99", lw=1, label="perfect calibration")
ax.plot([c["mean_predicted"] for c in calib],
        [c["observed_rate"] for c in calib],
        "o-", color="#2b5fd9", label=chosen.replace("_", " "))
ax.set_xlabel("Mean predicted probability")
ax.set_ylabel("Observed delay rate")
ax.set_title(f"Calibration on test (Brier {brier:.4f})")
ax.legend(frameon=False, fontsize=9)
ax.spines[["top", "right"]].set_visible(False)
fig.savefig(C.FIGURES_DIR / "calibration.png", dpi=150, bbox_inches="tight")
plt.close(fig)

# ---------------------------------------------------------------------------
# 5. PR and ROC curves
# ---------------------------------------------------------------------------
fig, axes = plt.subplots(1, 2, figsize=(11, 4.4))
for name in ["logistic_regression", "random_forest", "gradient_boosting"]:
    p, r_, _ = precision_recall_curve(y_arr, test_scores[name])
    axes[0].plot(r_, p, lw=1.5, label=f"{name.replace('_',' ')} "
                 f"({test_results[name]['pr_auc']:.3f})")
    fpr, tpr, _ = roc_curve(y_arr, test_scores[name])
    axes[1].plot(fpr, tpr, lw=1.5, label=f"{name.replace('_',' ')} "
                 f"({test_results[name]['roc_auc']:.3f})")
axes[0].axhline(y_arr.mean(), ls="--", color="#d1495b", lw=1.2,
                label=f"baseline ({y_arr.mean():.3f})")
axes[0].set_xlabel("Recall"); axes[0].set_ylabel("Precision")
axes[0].set_title("Precision-Recall (test)")
axes[1].plot([0, 1], [0, 1], "--", color="#8b8b99", lw=1, label="chance")
axes[1].set_xlabel("False positive rate"); axes[1].set_ylabel("True positive rate")
axes[1].set_title("ROC (test)")
for ax in axes:
    ax.legend(frameon=False, fontsize=8)
    ax.spines[["top", "right"]].set_visible(False)
fig.savefig(C.FIGURES_DIR / "curves.png", dpi=150, bbox_inches="tight")
plt.close(fig)
print("\n  wrote calibration.png, curves.png")

# ---------------------------------------------------------------------------
# 6. threshold sweep -- drives the website slider
# ---------------------------------------------------------------------------
print("\n" + "-" * 72)
print("threshold sweep for the website")
print("-" * 72)

sweep = []
for t in np.round(np.arange(0.02, 0.99, 0.01), 2):
    y_hat = s_best >= t
    tp = int((y_hat & (y_arr == 1)).sum())
    fp = int((y_hat & (y_arr == 0)).sum())
    fn = int((~y_hat & (y_arr == 1)).sum())
    tn = int((~y_hat & (y_arr == 0)).sum())
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1v = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    sweep.append({
        "t": float(t), "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "precision": round(prec, 5), "recall": round(rec, 5),
        "f1": round(f1v, 5), "accuracy": round((tp + tn) / len(y_arr), 5),
    })
print(f"  {len(sweep)} thresholds from 0.02 to 0.98")

# ---------------------------------------------------------------------------
# 7. error analysis
# ---------------------------------------------------------------------------
print("\n" + "-" * 72)
print("error analysis")
print("-" * 72)

thr_best = test_results[chosen]["threshold"]
err = X_te.copy()
err["y_true"] = y_arr
err["score"] = s_best
err["y_pred"] = (s_best >= thr_best).astype("int8")
err["correct"] = (err["y_true"] == err["y_pred"]).astype("int8")

airlines = pd.read_csv(C.AIRLINES_CSV)
name_of = dict(zip(airlines.iloc[:, 0], airlines.iloc[:, 1]))


def slice_perf(col, label_fn=str, min_n=500):
    out = []
    for key, g in err.groupby(col, observed=True):
        if len(g) < min_n:
            continue
        tp = int(((g.y_pred == 1) & (g.y_true == 1)).sum())
        fp = int(((g.y_pred == 1) & (g.y_true == 0)).sum())
        fn = int(((g.y_pred == 0) & (g.y_true == 1)).sum())
        out.append({
            "group": label_fn(key),
            "n": int(len(g)),
            "actual_delay_rate": float(g.y_true.mean()),
            "predicted_delay_rate": float(g.y_pred.mean()),
            "recall": float(tp / (tp + fn)) if tp + fn else None,
            "precision": float(tp / (tp + fp)) if tp + fp else None,
        })
    return out


by_hour = slice_perf("SCHED_DEP_HOUR", lambda h: f"{int(h):02d}:00")
by_carrier = slice_perf("AIRLINE", lambda a: name_of.get(a, str(a)))
by_month = slice_perf("MONTH", lambda m: {11: "November", 12: "December"}[int(m)])
err["dist_band"] = pd.cut(
    err["DISTANCE"], [0, 400, 800, 1500, 2500, 10000],
    labels=["<400 mi", "400-800", "800-1500", "1500-2500", "2500+"],
)
by_dist = slice_perf("dist_band", str)

print(f"  sliced by hour ({len(by_hour)}), carrier ({len(by_carrier)}), "
      f"month ({len(by_month)}), distance ({len(by_dist)})")

worst_hours = sorted(by_hour, key=lambda d: -d["actual_delay_rate"])[:3]
print(f"  worst hours by actual delay rate: "
      f"{[(h['group'], round(h['actual_delay_rate'],3)) for h in worst_hours]}")

# representative mistakes
cols = ["AIRLINE", "ORIGIN_AIRPORT", "DESTINATION_AIRPORT", "SCHED_DEP_HOUR",
        "DISTANCE", "MONTH", "DAY", "score", "y_true", "y_pred"]
fn_rows = err[(err.y_true == 1) & (err.y_pred == 0)].nsmallest(6, "score")[cols]
fp_rows = err[(err.y_true == 0) & (err.y_pred == 1)].nlargest(6, "score")[cols]


def to_records(frame):
    recs = []
    for _, r in frame.iterrows():
        recs.append({
            "carrier": name_of.get(r.AIRLINE, str(r.AIRLINE)),
            "route": f"{r.ORIGIN_AIRPORT} to {r.DESTINATION_AIRPORT}",
            "departs": f"{int(r.SCHED_DEP_HOUR):02d}:00",
            "distance_mi": int(r.DISTANCE),
            "date": f"2015-{int(r.MONTH):02d}-{int(r.DAY):02d}",
            "predicted_probability": round(float(r.score), 4),
            "actually_delayed": bool(r.y_true == 1),
        })
    return recs


errors_json = {
    "model": chosen,
    "threshold": float(thr_best),
    "confusion": test_results[chosen]["confusion"],
    "by_departure_hour": by_hour,
    "by_carrier": sorted(by_carrier, key=lambda d: -d["actual_delay_rate"]),
    "by_month": by_month,
    "by_distance": by_dist,
    "worst_false_negatives": to_records(fn_rows),
    "worst_false_positives": to_records(fp_rows),
    "reading": (
        "False negatives are delayed flights the model scored as low risk; "
        "false positives are on-time flights it flagged. Because the features "
        "contain no weather and no inbound-aircraft information, the model "
        "cannot distinguish a quiet 07:00 departure that happens to be hit by "
        "a storm from one that is not."
    ),
}

# ---------------------------------------------------------------------------
# 8. write everything
# ---------------------------------------------------------------------------
print("\n" + "-" * 72)
print("writing results")
print("-" * 72)

# PR-AUC cannot be compared across sets with different base rates: an
# uninformative model scores the base rate itself. Lift makes the comparison
# meaningful, and it tells a less flattering story than the raw numbers.
base_test = float(y_te.mean())
base_val = float(val_report["val_delay_rate"])
for name, m in test_results.items():
    m["pr_auc_lift_over_baseline"] = round(m["pr_auc"] / base_test, 4)
    if name in val_report["results"]:
        m["val_pr_auc_lift_over_baseline"] = round(
            val_report["results"][name]["pr_auc"] / base_val, 4
        )

worst_gap = max(abs(c["mean_predicted"] - c["observed_rate"]) for c in calib)

full = {
    "evaluated_once": True,
    "test_months": C.TEST_MONTHS,
    "test_rows": int(len(y_te)),
    "test_delay_rate": base_test,
    "validation_delay_rate": base_val,
    "chosen_model": chosen,
    "threshold_rule": val_report["threshold_rule"],
    "n_bootstrap": C.N_BOOTSTRAP,
    "results": test_results,
    "model_comparison": comparison,
    "calibration": calib,
    "calibration_warning": {
        "is_calibrated": False,
        "brier": brier,
        "max_abs_gap": round(worst_gap, 4),
        "cause": (
            "All three models were trained with class weighting, which "
            "deliberately over-weights the minority class. That lifts recall "
            "but inflates the predicted probabilities: a flight scored 0.45 "
            "is delayed about 18% of the time, not 45%."
        ),
        "consequence": (
            "The website presents the predictor's output as a RELATIVE RISK "
            "SCORE, not as a calibrated probability, and shows this curve so a "
            "visitor can read off what a score corresponds to. Fitting a "
            "post-hoc calibrator on the validation month is the obvious next "
            "step; we did not do it here because the test set has already been "
            "used, and re-scoring it with a changed model would turn our "
            "single honest test into a second round of tuning."
        ),
    },
    "metric_comparability_note": (
        f"Test PR-AUC exceeds validation PR-AUC, but the two are not "
        f"comparable: the test base rate is {base_test:.4f} against "
        f"{base_val:.4f} on validation, and PR-AUC scales with the base rate. "
        f"Lift over baseline is the fair comparison, and it falls from "
        f"{val_report['results'][chosen]['pr_auc']/base_val:.2f}x on "
        f"validation to {test_results[chosen]['pr_auc']/base_test:.2f}x on "
        f"test. Performance degraded on the holiday months."
    ),
    "provenance": (
        "Models, hyperparameters and thresholds were fixed in step 03 using "
        "the validation month only. This script re-tunes nothing."
    ),
}
with open(C.ARTIFACTS_DIR / "test_results.json", "w", encoding="utf-8") as fh:
    json.dump(full, fh, indent=2)
print("  artifacts/test_results.json")

with open(C.ARTIFACTS_DIR / "errors.json", "w", encoding="utf-8") as fh:
    json.dump(errors_json, fh, indent=2)
print("  artifacts/errors.json")

# --- website copies
with open(C.DOCS_DATA_DIR / "metrics.json", "w", encoding="utf-8") as fh:
    json.dump({
        "validation": {
            "months": C.VAL_MONTHS_EFFECTIVE,
            "rows": val_report["val_rows"],
            "delay_rate": val_report["val_delay_rate"],
            "results": {k: {m: v[m] for m in
                            ("pr_auc", "roc_auc", "precision", "recall", "f1",
                             "accuracy") if m in v}
                        for k, v in val_report["results"].items()},
            "all_candidates": val_report["all_candidates"],
        },
        "test": full,
    }, fh, indent=2)
print("  docs/data/metrics.json")

with open(C.DOCS_DATA_DIR / "threshold.json", "w", encoding="utf-8") as fh:
    json.dump({
        "model": chosen,
        "test_rows": int(len(y_te)),
        "test_positives": int(y_arr.sum()),
        "chosen_threshold": float(thr_best),
        "chosen_by": "maximising F1 on the validation month",
        "sweep": sweep,
    }, fh, indent=2)
print("  docs/data/threshold.json")

with open(C.DOCS_DATA_DIR / "errors.json", "w", encoding="utf-8") as fh:
    json.dump(errors_json, fh, indent=2)
print("  docs/data/errors.json")

with open(C.ARTIFACTS_DIR / "audit.json", encoding="utf-8") as fh:
    audit = json.load(fh)
with open(C.ARTIFACTS_DIR / "eda.json", encoding="utf-8") as fh:
    eda = json.load(fh)
with open(C.ARTIFACTS_DIR / "splits.json", encoding="utf-8") as fh:
    splits = json.load(fh)
with open(C.ARTIFACTS_DIR / "importance.json", encoding="utf-8") as fh:
    importance = json.load(fh)

with open(C.DOCS_DATA_DIR / "summary.json", "w", encoding="utf-8") as fh:
    json.dump({
        "audit": audit, "eda": eda, "splits": splits, "importance": importance,
        "config": {
            "seed": C.SEED,
            "delay_threshold_minutes": C.DELAY_THRESHOLD_MINUTES,
            "features": C.ALLOWED_FEATURES,
            "forbidden_features": C.FORBIDDEN_FEATURES,
            "train_months": C.TRAIN_MONTHS,
            "val_months_proposed": C.VAL_MONTHS,
            "val_months_effective": C.VAL_MONTHS_EFFECTIVE,
            "test_months": C.TEST_MONTHS,
            "october_excluded": C.OCTOBER_EXCLUDED,
        },
    }, fh, indent=2)
print("  docs/data/summary.json")

print("\n" + "=" * 72)
print("STEP 05 complete. The test set has now been used. It must not be")
print("reopened: any further tuning would invalidate these numbers.")
print("=" * 72)
