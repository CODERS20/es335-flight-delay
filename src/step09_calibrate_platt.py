"""
Step 09 - Platt scaling vs isotonic regression, for both models, on validation.

WHY THIS EXISTS
---------------
Step 07 fixed calibration for the logistic regression with isotonic regression.
Two questions were left open:

  1. Isotonic fitted 170 knots on a single month. A two-parameter method may
     generalise better from that much data, and produces a smooth mapping
     instead of a step function.
  2. Our headline model is gradient boosting, and it had no calibrator at all.

So this script fits BOTH methods for BOTH models, compares them on days no
calibrator ever saw, and picks per model on validation evidence alone.

THE DEFECTS BEING CORRECTED
---------------------------
Diagnosis from the test diagnostics (read, not re-measured):

  * a PRIOR SHIFT. class_weight="balanced" up-weights the minority class by
    (1-p)/p, which multiplies the fitted odds by the same factor. One number
    too high, everywhere.
  * OVER-DISPERSION. After undoing that shift analytically, residuals still run
    negative at the bottom of the range and positive at the top: the scores are
    also too spread out.

A single intercept cannot fix both. Platt scaling has one parameter for each:

    p = sigmoid(a * logit(s) + b)

where b absorbs the prior shift and a rescales the spread. Isotonic can fit any
monotone shape, so it can also fix both -- at the cost of many more parameters.
Which generalises better from one month is an empirical question, and this
script answers it rather than assuming.

THE PROTOCOL (identical to step 07, so the comparison is fair)
--------------------------------------------------------------
    fit    September 1-15   -> learn the mapping
    assess September 16-30  -> measure it on days the mapping never saw

Then, for the mapping we ship, refit on all of September. The test months are
never loaded: the published November-December numbers were measured once,
against a model chosen before they were seen, and re-scoring them with a
calibrator would turn that single honest test into a second round of tuning.

SELECTION RULE, FIXED BEFORE LOOKING
------------------------------------
Per model, pick the method with the lowest ECE on the assessment half; Brier
breaks ties; and the winner must preserve ranking (|ROC-AUC change| < 0.005) or
it is rejected outright, because ranking is what the project's headline metrics
measure.

Outputs: artifacts/calibration_platt.json, docs/data/calibration_v2.json,
         artifacts/figures/calibration_methods.png
Run:     python src/step09_calibrate_platt.py
"""

from __future__ import annotations

import json

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

import config as C
import features as F

MODELS = ["logistic_regression", "gradient_boosting"]
N_BINS = 10
MIN_BIN = 50          # same as step 07, so ECE numbers are comparable
RANK_TOLERANCE = 0.005
EPS = 1e-6

print("=" * 72)
print("STEP 09  Platt vs isotonic calibration, both models (validation only)")
print("=" * 72)
print("\nselection rule fixed in advance: lowest ECE on the held-out half of")
print("September, Brier as tie-break, and the winner must preserve ranking")
print(f"(|ROC-AUC change| < {RANK_TOLERANCE}).")

# ---------------------------------------------------------------------------
# data: validation only, and prove it
# ---------------------------------------------------------------------------
X_va, y_va = F.load_split("val")
assert set(X_va["MONTH"].unique()) <= set(C.VAL_MONTHS_EFFECTIVE), "not validation!"
assert not set(X_va["MONTH"].unique()) & set(C.TEST_MONTHS), "test month present!"
y = y_va.to_numpy()
day = X_va["DAY"].to_numpy()
fit_mask = day <= 15
ass_mask = ~fit_mask

print(f"\nvalidation : {len(X_va):,} flights, month(s) {sorted(X_va['MONTH'].unique())}")
print(f"base rate  : {y.mean():.4f}")
print(f"fit        : September 1-15,  {fit_mask.sum():,} flights")
print(f"assess     : September 16-30, {ass_mask.sum():,} flights (never seen by any mapping)")
print("the test set is never loaded by this script")


# ---------------------------------------------------------------------------
# metrics
# ---------------------------------------------------------------------------
def reliability(y_true, p, n_bins=N_BINS):
    """Reliability bins plus ECE, with step 07's binning so numbers compare."""
    edges = np.linspace(0, 1, n_bins + 1)
    idx = np.clip(np.digitize(p, edges) - 1, 0, n_bins - 1)
    rows, weighted = [], 0.0
    for b in range(n_bins):
        sel = idx == b
        if sel.sum() < MIN_BIN:
            continue
        mp, obs = float(p[sel].mean()), float(y_true[sel].mean())
        rows.append({
            "bin": f"{edges[b]:.1f}-{edges[b+1]:.1f}",
            "mean_predicted": round(mp, 6),
            "observed_rate": round(obs, 6),
            "gap": round(mp - obs, 6),
            "n": int(sel.sum()),
        })
        weighted += abs(mp - obs) * sel.sum()
    ece = float(weighted / len(y_true))
    worst = max((abs(r["gap"]) for r in rows), default=float("nan"))
    return rows, ece, float(worst)


def logit(p):
    p = np.clip(p, EPS, 1 - EPS)
    return np.log(p / (1 - p))


def calibration_slope_intercept(y_true, p):
    """Regress the outcome on the predicted log-odds.

    A perfectly calibrated model gives slope 1, intercept 0. Slope < 1 means the
    predictions are too spread out (over-confident); a negative intercept means
    they run systematically high.
    """
    lr = LogisticRegression(C=1e12, solver="lbfgs", max_iter=1000)
    lr.fit(logit(p).reshape(-1, 1), y_true)
    return float(lr.coef_[0][0]), float(lr.intercept_[0])


def assess(y_true, p):
    rows, ece, worst = reliability(y_true, p)
    slope, intercept = calibration_slope_intercept(y_true, p)
    return {
        "brier": float(brier_score_loss(y_true, p)),
        "ece": ece,
        "max_abs_gap": worst,
        "pr_auc": float(average_precision_score(y_true, p)),
        "roc_auc": float(roc_auc_score(y_true, p)),
        "calibration_slope": slope,
        "calibration_intercept": intercept,
        "mean_prediction": float(p.mean()),
        "sd_prediction": float(p.std()),
        "share_above_half": float((p >= 0.5).mean()),
        "bins": rows,
    }


# ---------------------------------------------------------------------------
# the three mappings
# ---------------------------------------------------------------------------
def fit_isotonic(s, t):
    iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    iso.fit(s, t)
    return iso


def fit_platt(s, t):
    """Platt scaling: a logistic regression on the predicted log-odds.

    Plain maximum likelihood, not Platt's original target smoothing: with
    200k+ rows per half the smoothing correction is negligible, and leaving it
    out keeps the mapping exactly reproducible from (a, b).
    """
    lr = LogisticRegression(C=1e12, solver="lbfgs", max_iter=1000)
    lr.fit(logit(s).reshape(-1, 1), t)
    return float(lr.coef_[0][0]), float(lr.intercept_[0])


def apply_platt(s, a, b):
    z = a * logit(s) + b
    return 1.0 / (1.0 + np.exp(-z))


# Diagnostic only (section D of the plan): undo the class weighting
# analytically. The factor comes from the TRAINING delay rate alone -- nothing
# is fitted, and nothing from the test set enters it.
with open(C.ARTIFACTS_DIR / "splits.json", encoding="utf-8") as fh:
    splits = json.load(fh)
p_train = float(splits["train_delay_rate_subsample"])
WEIGHT_RATIO = (1 - p_train) / p_train
print(f"\ntraining delay rate {p_train:.4f} -> class-weight ratio {WEIGHT_RATIO:.3f}")
print("(used as a DIAGNOSTIC baseline for the fitted methods, not as the fix)")


def apply_prior_shift(s, ratio=WEIGHT_RATIO):
    o = np.clip(s, EPS, 1 - EPS)
    o = o / (1 - o) / ratio
    return o / (1 + o)


# ---------------------------------------------------------------------------
# per model
# ---------------------------------------------------------------------------
report = {}

for name in MODELS:
    print("\n" + "=" * 72)
    print(f"{name.upper().replace('_', ' ')}")
    print("=" * 72)

    pipe = joblib.load(C.ARTIFACTS_DIR / "models" / f"{name}.joblib")
    s = pipe.predict_proba(X_va)[:, 1]

    s_fit, y_fit = s[fit_mask], y[fit_mask]
    s_ass, y_ass = s[ass_mask], y[ass_mask]

    iso = fit_isotonic(s_fit, y_fit)
    a, b = fit_platt(s_fit, y_fit)
    print(f"\nPlatt parameters fitted on Sep 1-15: a = {a:.4f}, b = {b:.4f}")
    print(f"  a < 1 means the raw scores are too spread out; "
          f"b < 0 means they run high.")

    candidates = {
        "raw": s_ass,
        "isotonic": iso.predict(s_ass),
        "platt": apply_platt(s_ass, a, b),
        "prior_shift_diagnostic": apply_prior_shift(s_ass),
    }
    results = {k: assess(y_ass, v) for k, v in candidates.items()}

    print("\nmeasured on September 16-30 (no mapping has seen these days):")
    print(f"{'method':<24}{'Brier':>9}{'ECE':>9}{'worst gap':>11}"
          f"{'slope':>8}{'intercept':>11}{'PR-AUC':>9}{'ROC-AUC':>9}")
    for k, r in results.items():
        print(f"{k:<24}{r['brier']:>9.4f}{r['ece']:>9.4f}{r['max_abs_gap']:>11.4f}"
              f"{r['calibration_slope']:>8.3f}{r['calibration_intercept']:>11.3f}"
              f"{r['pr_auc']:>9.4f}{r['roc_auc']:>9.4f}")

    # ---- selection, by the rule fixed above -------------------------------
    raw_roc = results["raw"]["roc_auc"]
    eligible, rejected = {}, {}
    for k in ("isotonic", "platt"):
        if abs(results[k]["roc_auc"] - raw_roc) < RANK_TOLERANCE:
            eligible[k] = results[k]
        else:
            rejected[k] = round(results[k]["roc_auc"] - raw_roc, 5)
    chosen = min(eligible, key=lambda k: (round(eligible[k]["ece"], 6), eligible[k]["brier"]))
    print(f"\nranking preserved by : {', '.join(eligible) or 'none'}")
    if rejected:
        print(f"rejected (ranking)   : {rejected}")
    print(f"CHOSEN for {name}: {chosen}")

    # is the win consistent across bins, or driven by one band?
    iso_bins = {r["bin"]: r["gap"] for r in results["isotonic"]["bins"]}
    platt_bins = {r["bin"]: r["gap"] for r in results["platt"]["bins"]}
    shared = sorted(set(iso_bins) & set(platt_bins))
    platt_better = [bn for bn in shared if abs(platt_bins[bn]) < abs(iso_bins[bn])]
    print(f"bins where Platt is closer: {len(platt_better)}/{len(shared)}"
          + (f"  ({', '.join(platt_better)})" if platt_better else ""))

    # ---- refit the shipped mapping on the whole validation month ----------
    if chosen == "platt":
        a_f, b_f = fit_platt(s, y)
        mapping = {"method": "platt", "a": a_f, "b": b_f}
        print(f"shipped mapping refitted on all of September: a = {a_f:.4f}, b = {b_f:.4f}")
        examples = [
            {"raw_score": round(v, 2),
             "calibrated": float(apply_platt(np.array([v]), a_f, b_f)[0])}
            for v in (0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8)
        ]
    else:
        iso_f = fit_isotonic(s, y)
        xs = np.asarray(iso_f.X_thresholds_, dtype=float)
        ys = np.asarray(iso_f.y_thresholds_, dtype=float)
        if len(xs) > 400:
            keep = np.unique(np.linspace(0, len(xs) - 1, 400).astype(int))
            xs, ys = xs[keep], ys[keep]
        mapping = {"method": "isotonic",
                   "x": [round(v, 6) for v in xs.tolist()],
                   "y": [round(v, 6) for v in ys.tolist()]}
        print(f"shipped mapping refitted on all of September: {len(xs)} knots")
        examples = [
            {"raw_score": round(v, 2), "calibrated": float(iso_f.predict([v])[0])}
            for v in (0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8)
        ]
    for e in examples:
        print(f"  raw {e['raw_score']:.2f} -> calibrated {e['calibrated']:.4f}")

    report[name] = {
        "raw_score_source": f"artifacts/models/{name}.joblib, scored on validation",
        "platt_fit_on_first_half": {"a": a, "b": b},
        "assessment": results,
        "chosen_method": chosen,
        "chosen_because": (
            f"lowest ECE on September 16-30 among methods that preserve ranking "
            f"(ECE {results[chosen]['ece']:.4f} vs "
            f"{results['isotonic' if chosen == 'platt' else 'platt']['ece']:.4f} "
            f"for the alternative, against {results['raw']['ece']:.4f} raw)"
        ),
        "bins_where_platt_closer": f"{len(platt_better)}/{len(shared)}",
        "shipped_mapping": mapping,
        "examples": examples,
    }

# ---------------------------------------------------------------------------
# figure: reliability curves, both models, all methods
# ---------------------------------------------------------------------------
STYLE = {
    "raw": ("#eb6834", "raw"),
    "isotonic": ("#1baf7a", "isotonic"),
    "platt": ("#2a78d6", "Platt"),
    "prior_shift_diagnostic": ("#86857f", "prior shift (diagnostic)"),
}
fig, axes = plt.subplots(1, 2, figsize=(10.6, 5.1), sharey=True)
for ax, name in zip(axes, MODELS):
    ax.plot([0, 1], [0, 1], "--", color="#86857f", lw=1.1, label="perfect")
    for meth, (colour, label) in STYLE.items():
        bins = report[name]["assessment"][meth]["bins"]
        ax.plot([r["mean_predicted"] for r in bins],
                [r["observed_rate"] for r in bins],
                "o-", color=colour, lw=1.9, markersize=6,
                label=f"{label} (Brier {report[name]['assessment'][meth]['brier']:.3f})")
    ax.set_title(name.replace("_", " "), fontsize=11)
    ax.set_xlabel("Mean predicted probability")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.legend(frameon=False, fontsize=8.5, loc="upper left")
    ax.spines[["top", "right"]].set_visible(False)
axes[0].set_ylabel("Observed delay rate")
fig.suptitle("Calibration methods, measured on held-out days of September", fontsize=12)
fig.tight_layout()
fig.savefig(C.FIGURES_DIR / "calibration_methods.png", dpi=150, bbox_inches="tight")
fig.savefig(C.DOCS_DIR / "figures" / "calibration_methods.png", dpi=150, bbox_inches="tight")
plt.close(fig)
print("\nwrote artifacts/figures/calibration_methods.png")

# ---------------------------------------------------------------------------
# write out
# ---------------------------------------------------------------------------
out = {
    "purpose": (
        "Compare Platt scaling against isotonic regression for both models, on "
        "validation only, and export one calibrator per model."
    ),
    "test_set_touched": False,
    "protocol": {
        "fit_days": "September 1-15",
        "assess_days": "September 16-30",
        "n_fit": int(fit_mask.sum()),
        "n_assess": int(ass_mask.sum()),
        "refit_for_deployment_on": "all of September",
        "selection_rule_fixed_in_advance": (
            "lowest ECE on the assessment half, Brier as tie-break, and "
            f"|ROC-AUC change| < {RANK_TOLERANCE} required"
        ),
        "binning": f"{N_BINS} equal-width bins, bins with fewer than {MIN_BIN} flights dropped",
    },
    "class_weight_diagnostic": {
        "training_delay_rate": p_train,
        "weight_ratio": WEIGHT_RATIO,
        "correction": "divide the predicted odds by the weight ratio",
        "assumptions": (
            "It assumes three things. (1) The only effect of class weighting is "
            "to multiply the fitted odds by (1-p)/p -- exactly true for a "
            "logistic model with a free intercept, approximate for boosted "
            "trees. (2) The model is otherwise correctly specified, so a single "
            "intercept shift is enough; our residuals show it is not, because "
            "the scores are also over-dispersed. (3) The period being scored "
            "has the same base rate as training, which fails here: training "
            f"runs at {p_train:.4f} and September at {float(y.mean()):.4f}. "
            "So we report it as a diagnostic that confirms the CAUSE of the "
            "miscalibration, and let the fitted methods supply the correction."
        ),
        "fitted_on_test_bins": False,
    },
    "independence_caveat": (
        "The September assessment is not a fully independent end-to-end "
        "evaluation. Model choice and hyperparameters were selected on this same "
        "validation month in step 03, so the scores being calibrated here were "
        "already tuned against September. Splitting the month by date keeps the "
        "CALIBRATOR honest -- it never sees the days it is judged on -- but it "
        "cannot undo the earlier model selection. A fully independent figure "
        "would need a further untouched period, and we are not willing to spend "
        "the test set on it."
    ),
    "published_test_metrics_unchanged": (
        "The November-December results in artifacts/test_results.json stand "
        "exactly as originally recorded. No calibrator is applied to them, and "
        "no claim is made that test Brier, test ECE or test probabilities have "
        "improved. Calibration is monotone, so it could not change test PR-AUC, "
        "ROC-AUC, precision, recall or F1 in any case."
    ),
    "supersedes": (
        "Extends artifacts/calibration_fit.json (step 07, isotonic, logistic "
        "regression only). That artifact is kept unchanged so the earlier "
        "experiment stays reproducible."
    ),
    "models": report,
}

for p in (C.ARTIFACTS_DIR / "calibration_platt.json",
          C.DOCS_DATA_DIR / "calibration_v2.json"):
    with open(p, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2)
    print(f"wrote {p.relative_to(C.REPO_ROOT)}")

print("\n" + "=" * 72)
print("SUMMARY")
print("=" * 72)
for name in MODELS:
    r = report[name]
    a = r["assessment"]
    ch = r["chosen_method"]
    print(f"{name:<22} chosen: {ch:<9} "
          f"ECE {a['raw']['ece']:.4f} -> {a[ch]['ece']:.4f}   "
          f"Brier {a['raw']['brier']:.4f} -> {a[ch]['brier']:.4f}")
print("\nSTEP 09 complete -- test set untouched, published test metrics unchanged")
print("=" * 72)
