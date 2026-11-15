"""
Step 07 - Probability calibration, fitted on validation only.

THE PROBLEM
-----------
Step 05 showed our scores are badly calibrated: flights scored 0.45 are delayed
about 18% of the time, not 45%. The cause is class weighting, which
deliberately over-weights the minority class to lift recall and in doing so
inflates every predicted probability. The website reports a number to a user,
and a number that is wrong by a factor of two and a half is worse than no
number.

THE CONSTRAINT
--------------
The test months have already been scored, once. Fitting a calibrator and then
re-scoring the test set would turn that single honest test into a second round
of tuning, and would invalidate every published test number. So this script
never touches the test set.

THE DESIGN
----------
Isotonic regression maps raw score -> calibrated probability. It is monotonic,
so it CANNOT change the ranking of flights: PR-AUC, ROC-AUC and the whole
precision/recall trade-off are mathematically unchanged. It fixes only the
level, which is exactly the defect.

To measure honestly, we split the validation month in half by date:

    fit    September 1-15   -> learn the mapping
    assess September 16-30  -> measure it on days the mapping never saw

Fitting and scoring on the same rows would flatter the result. Only after
measuring do we refit on all of September for the version the website ships.

Outputs: artifacts/calibration_fit.json, docs/data/calibration.json,
         artifacts/figures/calibration_fix.png
Run:     python src/step07_calibrate.py
"""

from __future__ import annotations

import json

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

import config as C
import features as F

print("=" * 72)
print("STEP 07  Probability calibration (validation only)")
print("=" * 72)

X_va, y_va = F.load_split("val")
assert set(X_va["MONTH"].unique()) <= set(C.VAL_MONTHS_EFFECTIVE), "not validation!"
print(f"\nvalidation: {len(X_va):,} flights, month(s) {sorted(X_va['MONTH'].unique())}")
print("the test set is never loaded by this script")

# The website's predictor runs the logistic regression, so that is what we
# calibrate. (The same procedure would apply to any of the models.)
lr = joblib.load(C.ARTIFACTS_DIR / "models" / "logistic_regression.joblib")
scores = lr.predict_proba(X_va)[:, 1]
y = y_va.to_numpy()

# ---------------------------------------------------------------------------
# honest split of the validation month
# ---------------------------------------------------------------------------
day = X_va["DAY"].to_numpy()
fit_mask = day <= 15
ass_mask = ~fit_mask
print(f"\nfit on Sep 1-15   : {fit_mask.sum():,} flights")
print(f"assess on Sep 16-30: {ass_mask.sum():,} flights (mapping never sees these)")


def calib_report(y_true, p, n_bins=10):
    bins = np.linspace(0, 1, n_bins + 1)
    idx = np.clip(np.digitize(p, bins) - 1, 0, n_bins - 1)
    rows, gaps = [], []
    for b in range(n_bins):
        sel = idx == b
        if sel.sum() < 50:
            continue
        mp, obs = float(p[sel].mean()), float(y_true[sel].mean())
        rows.append({"bin": f"{bins[b]:.1f}-{bins[b+1]:.1f}",
                     "mean_predicted": mp, "observed_rate": obs,
                     "n": int(sel.sum())})
        gaps.append(abs(mp - obs) * sel.sum())
    ece = float(sum(gaps) / len(y_true))   # expected calibration error
    return rows, ece


iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
iso.fit(scores[fit_mask], y[fit_mask])

raw_ass = scores[ass_mask]
cal_ass = iso.predict(raw_ass)
y_ass = y[ass_mask]

raw_rows, raw_ece = calib_report(y_ass, raw_ass)
cal_rows, cal_ece = calib_report(y_ass, cal_ass)

raw_brier = float(brier_score_loss(y_ass, raw_ass))
cal_brier = float(brier_score_loss(y_ass, cal_ass))
raw_pr = float(average_precision_score(y_ass, raw_ass))
cal_pr = float(average_precision_score(y_ass, cal_ass))
raw_roc = float(roc_auc_score(y_ass, raw_ass))
cal_roc = float(roc_auc_score(y_ass, cal_ass))

print("\n" + "-" * 72)
print("MEASURED ON HELD-OUT HALF OF VALIDATION (Sep 16-30)")
print("-" * 72)
print(f"{'':28s} {'raw':>12s} {'calibrated':>12s}")
print(f"{'Brier score (lower better)':28s} {raw_brier:>12.4f} {cal_brier:>12.4f}")
print(f"{'Expected calib. error':28s} {raw_ece:>12.4f} {cal_ece:>12.4f}")
print(f"{'PR-AUC (must not change)':28s} {raw_pr:>12.4f} {cal_pr:>12.4f}")
print(f"{'ROC-AUC (must not change)':28s} {raw_roc:>12.4f} {cal_roc:>12.4f}")

print("\nworst bin gap:")
print(f"  raw        {max(abs(r['mean_predicted']-r['observed_rate']) for r in raw_rows):.4f}")
print(f"  calibrated {max(abs(r['mean_predicted']-r['observed_rate']) for r in cal_rows):.4f}")

# Ranking must be preserved -- isotonic is monotonic. Verify rather than assert
# it in prose: ties introduced by the step function can nudge AUC slightly.
rank_ok = abs(raw_roc - cal_roc) < 0.005
print(f"\nranking preserved (|ROC-AUC change| < 0.005): {rank_ok}")

# ---------------------------------------------------------------------------
# refit on the whole validation month for the shipped mapping
# ---------------------------------------------------------------------------
final = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
final.fit(scores, y)

# Export as a compact step function the browser can evaluate.
xs = np.asarray(final.X_thresholds_, dtype=float)
ys = np.asarray(final.y_thresholds_, dtype=float)
if len(xs) > 400:  # keep the payload small; the curve is smooth
    keep = np.unique(np.linspace(0, len(xs) - 1, 400).astype(int))
    xs, ys = xs[keep], ys[keep]

print(f"\nshipped mapping: {len(xs)} knots, "
      f"score {xs.min():.3f}-{xs.max():.3f} -> probability {ys.min():.3f}-{ys.max():.3f}")

examples = []
for s in [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]:
    examples.append({"raw_score": s, "calibrated": float(final.predict([s])[0])})
    print(f"  raw {s:.2f} -> calibrated {examples[-1]['calibrated']:.4f}")

out = {
    "method": "isotonic regression",
    "fitted_on": "validation month only (September 2015)",
    "applies_to": "logistic_regression (the model the website scores in-browser)",
    "test_set_touched": False,
    "why": (
        "Class weighting inflates predicted probabilities. Isotonic regression "
        "is monotonic, so it corrects the level without reordering any flight: "
        "PR-AUC, ROC-AUC and the precision/recall trade-off are unchanged."
    ),
    "honest_measurement": {
        "fit_days": "September 1-15",
        "assess_days": "September 16-30",
        "n_fit": int(fit_mask.sum()),
        "n_assess": int(ass_mask.sum()),
        "raw": {"brier": raw_brier, "ece": raw_ece, "pr_auc": raw_pr, "roc_auc": raw_roc,
                "bins": raw_rows},
        "calibrated": {"brier": cal_brier, "ece": cal_ece, "pr_auc": cal_pr,
                       "roc_auc": cal_roc, "bins": cal_rows},
        "brier_improvement": round(raw_brier - cal_brier, 4),
        "ece_improvement": round(raw_ece - cal_ece, 4),
        "ranking_preserved": bool(rank_ok),
    },
    "mapping": {"x": [round(v, 6) for v in xs.tolist()],
                "y": [round(v, 6) for v in ys.tolist()]},
    "examples": examples,
    "caveat": (
        "The mapping is fitted on September, a month with a 13.0% delay rate. "
        "The test months run at 17.9%, so on a busier period this calibration "
        "would under-predict. We do not apply it to the test set: those numbers "
        "were measured once with the uncalibrated model and stay as published."
    ),
}
for p in (C.ARTIFACTS_DIR / "calibration_fit.json", C.DOCS_DATA_DIR / "calibration.json"):
    with open(p, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2)
    print(f"wrote {p.relative_to(C.REPO_ROOT)}")

# ---------------------------------------------------------------------------
# figure
# ---------------------------------------------------------------------------
fig, ax = plt.subplots(figsize=(5.6, 5.4))
ax.plot([0, 1], [0, 1], "--", color="#86857f", lw=1.2, label="perfect calibration")
ax.plot([r["mean_predicted"] for r in raw_rows],
        [r["observed_rate"] for r in raw_rows],
        "o-", color="#eb6834", lw=2, markersize=7,
        label=f"raw (Brier {raw_brier:.3f})")
ax.plot([r["mean_predicted"] for r in cal_rows],
        [r["observed_rate"] for r in cal_rows],
        "o-", color="#1baf7a", lw=2, markersize=7,
        label=f"calibrated (Brier {cal_brier:.3f})")
ax.set_xlabel("Mean predicted probability")
ax.set_ylabel("Observed delay rate")
ax.set_title("Calibration, measured on held-out days of September")
ax.legend(frameon=False, fontsize=9)
ax.set_xlim(0, 1); ax.set_ylim(0, 1)
ax.spines[["top", "right"]].set_visible(False)
fig.savefig(C.FIGURES_DIR / "calibration_fix.png", dpi=150, bbox_inches="tight")
fig.savefig(C.DOCS_DIR / "figures" / "calibration_fix.png", dpi=150, bbox_inches="tight")
plt.close(fig)
print("wrote artifacts/figures/calibration_fix.png")

print("\n" + "=" * 72)
print("STEP 07 complete -- test set untouched")
print("=" * 72)
