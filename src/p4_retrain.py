"""
P4 - Retrain the selected model on all of the training data.

    data/train.csv + artifacts/p3_selection.json  ->  artifacts/models/final.joblib
                                                      artifacts/p4_model.json

WHY RETRAIN AT ALL
------------------
Cross-validation had to hold a fifth of the training days back on every fold,
so no candidate was ever fitted on more than 80% of the data. The settings are
now chosen, and keeping data back no longer buys anything: the final model is
fitted on every training row, with the settings frozen exactly as selected.

Nothing is re-tuned here. If this script changed a setting, the cross-validated
estimate would no longer describe the model being shipped.

TWO EXTRA THINGS THIS STEP PRODUCES
-----------------------------------
1. Feature importance, measured honestly. Shuffling a column and re-scoring on
   data the model was fitted on would flatter every feature, so we fit a second
   copy on 80% of the training days and measure on the remaining 20%. The test
   set is not involved.

2. The browser model. The website scores flights with no server, so one model
   has to be exportable as plain arithmetic: the logistic regression's
   coefficients. Its predictions are checked against scikit-learn's before
   export.

Run:  python src/p4_retrain.py
"""

from __future__ import annotations

import json
import time

import joblib
import numpy as np
import pandas as pd
from sklearn.inspection import permutation_importance
from sklearn.metrics import average_precision_score
from sklearn.model_selection import GroupShuffleSplit

import pconfig as P
import pmodels as M

print("=" * 74)
print("P4  Retrain the selected model on all of the training data")
print("=" * 74)

P.MODELS_DIR.mkdir(parents=True, exist_ok=True)

with open(P.ART / "p3_selection.json", encoding="utf-8") as fh:
    sel = json.load(fh)
FEATURES: list[str] = sel["features"]
CHOSEN = sel["best"]["model"]
SETTINGS = sel["best"]["settings"]
THRESHOLD = sel["threshold"]["value"]

print(f"\nchosen by cross-validation : {CHOSEN}")
print(f"settings                   : {SETTINGS}")
print(f"threshold                  : {THRESHOLD:.4f}")
print(f"cross-validated curve area : {sel['best']['mean_score']:.4f}")

print(f"\nreading {P.TRAIN_CSV.name} ...")
train = pd.read_csv(P.TRAIN_CSV)
print(f"  {len(train):,} rows")

P.assert_no_leakage(FEATURES)
X = train[FEATURES]
y = train[P.TARGET].to_numpy()
groups = M.day_groups(train)

# A random forest of deep trees on four million rows needs more memory than a
# laptop has, so that one model is capped. Everything else sees every row.
rows_used = len(train)
if CHOSEN == "random_forest" and len(train) > P.FINAL_SAMPLE_ROWS:
    idx = np.random.default_rng(P.SEED).choice(len(train), P.FINAL_SAMPLE_ROWS, replace=False)
    X, y, groups = X.iloc[idx], y[idx], groups[idx]
    rows_used = len(idx)
    print(f"  capped at {rows_used:,} rows: a deep forest on {len(train):,} rows "
          f"does not fit in memory here")

# ---------------------------------------------------------------------------
# the final fit
# ---------------------------------------------------------------------------
print(f"\nfitting {CHOSEN} on {rows_used:,} rows ...")
t0 = time.time()
final = M.build(CHOSEN, SETTINGS, FEATURES)
final.fit(X, y)
fit_seconds = time.time() - t0
print(f"  done in {fit_seconds:.0f}s")
joblib.dump(final, P.MODELS_DIR / "final.joblib")
print(f"  saved artifacts/models/final.joblib")

# ---------------------------------------------------------------------------
# the best of each family, for the comparison table
# ---------------------------------------------------------------------------
# p5 reports every method side by side. For that comparison to mean anything,
# each one has to be trained the way the winner was: same rows, same features,
# best settings for that family as cross-validation found them. Fitting them
# here keeps p5 free of any fitting at all.
print("\nalso fitting the best of each other family, for the comparison table:")
family_best: dict[str, dict] = {}
for r in sel["results"]:
    m = r["model"]
    if m == "majority_baseline":
        continue
    if m not in family_best or r["mean_score"] > family_best[m]["mean_score"]:
        family_best[m] = r

fitted: dict[str, dict] = {}
for m, r in family_best.items():
    if m == CHOSEN and r["settings"] == SETTINGS:
        joblib.dump(final, P.MODELS_DIR / f"{m}.joblib")
        fitted[m] = {"settings": SETTINGS, "rows": int(rows_used),
                     "cv_score": r["mean_score"], "is_winner": True}
        print(f"  {m:<22} already fitted above")
        continue
    Xm, ym = X, y
    note = ""
    if m == "random_forest" and len(Xm) > P.FINAL_SAMPLE_ROWS:
        ridx = np.random.default_rng(P.SEED).choice(len(Xm), P.FINAL_SAMPLE_ROWS, replace=False)
        Xm, ym = Xm.iloc[ridx], ym[ridx]
        note = f" (capped at {len(ridx):,} rows for memory)"
    t1 = time.time()
    pipe_m = M.build(m, r["settings"], FEATURES)
    pipe_m.fit(Xm, ym)
    joblib.dump(pipe_m, P.MODELS_DIR / f"{m}.joblib")
    fitted[m] = {"settings": r["settings"], "rows": int(len(Xm)),
                 "cv_score": r["mean_score"], "is_winner": False}
    print(f"  {m:<22} {time.time() - t1:>5.0f}s{note}")

# ---------------------------------------------------------------------------
# feature importance, measured on held-back days
# ---------------------------------------------------------------------------
print("\nfeature importance (shuffle one column, re-score on held-back days):")
gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=P.SEED)
tr_idx, ho_idx = next(gss.split(X, y, groups))
probe = M.build(CHOSEN, SETTINGS, FEATURES)
probe.fit(X.iloc[tr_idx], y[tr_idx])

# A sample keeps the repeated scoring affordable; it is large enough that the
# ranking does not move between repeats.
n_probe = min(60_000, len(ho_idx))
probe_idx = np.random.default_rng(P.SEED).choice(ho_idx, n_probe, replace=False)
Xp, yp = X.iloc[probe_idx], y[probe_idx]

base_score = float(average_precision_score(yp, probe.predict_proba(Xp)[:, 1]))
imp = permutation_importance(
    probe, Xp, yp, scoring="average_precision", n_repeats=3,
    random_state=P.SEED, n_jobs=1,
)
importance = sorted(
    [
        {"feature": f, "drop_in_score": float(m), "std": float(s)}
        for f, m, s in zip(FEATURES, imp.importances_mean, imp.importances_std)
    ],
    key=lambda r: -r["drop_in_score"],
)
print(f"  measured on {n_probe:,} held-back flights, curve area {base_score:.4f}")
for r in importance:
    bar = "#" * max(1, int(round(r["drop_in_score"] / max(importance[0]['drop_in_score'], 1e-9) * 28)))
    print(f"    {r['feature']:<22} -{r['drop_in_score']:.4f}  {bar}")

# ---------------------------------------------------------------------------
# the browser model
# ---------------------------------------------------------------------------
print("\nexporting a model the website can run with no server:")
if CHOSEN == "logistic_regression":
    browser_pipe = final
    browser_note = (
        "The model on this page is the selected model itself: a logistic "
        "regression is a weighted sum of its inputs, so its coefficients can be "
        "evaluated exactly in a browser."
    )
else:
    lr_settings = {"C": 1.0, "class_weight": SETTINGS.get("class_weight", None)}
    browser_pipe = M.build("logistic_regression", lr_settings, FEATURES)
    browser_pipe.fit(X, y)
    browser_note = (
        "The selected model is an ensemble of hundreds of trees, which cannot be "
        "evaluated exactly in a page. The predictor therefore runs a logistic "
        "regression fitted on the same rows with the same features: a weighted "
        "sum of its inputs, so the browser can reproduce it to the last decimal."
    )
    print(f"  the winner is {CHOSEN}, so a logistic regression was fitted for the page")

prep = browser_pipe.named_steps["prep"]
clf = browser_pipe.named_steps["clf"]
names = list(prep.get_feature_names_out())
coefs = clf.coef_[0]
assert len(names) == len(coefs), f"{len(names)} names vs {len(coefs)} coefficients"

cats, _, hours, plain = M.split_features(FEATURES)
export: dict = {
    "kind": "logistic_regression",
    "intercept": float(clf.intercept_[0]),
    "categorical": {c: {} for c in cats},
    "cyclic_hours": {h: {"sin": 0.0, "cos": 0.0} for h in hours},
    "numeric": {},
    "infrequent_level": "infrequent_sklearn",
}

scaler = prep.named_transformers_["num"]
for n, w in zip(names, coefs):
    if n.startswith("cat__"):
        col, level = n[len("cat__"):].split("_", 1)
        # one-hot names are "cat__COLUMN_LEVEL"; the column is the longest
        # allow-listed prefix, since airport codes contain no underscore but
        # column names do.
        for c in cats:
            if n[len("cat__"):].startswith(c + "_"):
                col, level = c, n[len("cat__") + len(c) + 1:]
                break
        export["categorical"][col][level] = float(w)
    elif n.startswith("hour__"):
        base = n[len("hour__"):]
        if base.endswith("_sin"):
            export["cyclic_hours"][base[:-4]]["sin"] = float(w)
        elif base.endswith("_cos"):
            export["cyclic_hours"][base[:-4]]["cos"] = float(w)
    elif n.startswith("num__"):
        col = n[len("num__"):]
        i = plain.index(col)
        export["numeric"][col] = {
            "coef": float(w),
            "mean": float(scaler.mean_[i]),
            "scale": float(scaler.scale_[i]),
        }

n_coef = (sum(len(v) for v in export["categorical"].values())
          + 2 * len(export["cyclic_hours"]) + len(export["numeric"]))
print(f"  {n_coef} coefficients exported "
      f"({sum(len(v) for v in export['categorical'].values())} categorical, "
      f"{2 * len(export['cyclic_hours'])} hour terms, {len(export['numeric'])} numeric)")


def score_exported(row: dict) -> float:
    """The same arithmetic the website does, so the check is of the real export."""
    z = export["intercept"]
    for c in cats:
        table = export["categorical"][c]
        level = str(row[c])
        if level in table:
            z += table[level]
        elif export["infrequent_level"] in table:
            z += table[export["infrequent_level"]]
    for h, cc in export["cyclic_hours"].items():
        rad = 2.0 * np.pi * float(row[h]) / 24.0
        z += cc["sin"] * np.sin(rad) + cc["cos"] * np.cos(rad)
    for col, nc in export["numeric"].items():
        z += nc["coef"] * (float(row[col]) - nc["mean"]) / nc["scale"]
    return float(1.0 / (1.0 + np.exp(-z)))


check = X.sample(n=min(400, len(X)), random_state=P.SEED)
mine = np.array([score_exported(r) for r in check.to_dict("records")])
theirs = browser_pipe.predict_proba(check)[:, 1]
err = float(np.abs(mine - theirs).max())
print(f"  largest disagreement with scikit-learn over {len(check)} flights: {err:.3e}")
if err > 1e-9:
    raise SystemExit(
        f"FAIL: the exported coefficients disagree with scikit-learn by {err:.3e}. "
        f"The website must not ship predictions the repository cannot reproduce."
    )
export["verified_max_abs_error"] = err
export["note"] = browser_note

# ---------------------------------------------------------------------------
# write
# ---------------------------------------------------------------------------
out = {
    "chosen_model": CHOSEN,
    "settings": SETTINGS,
    "chosen_by": "5-fold cross-validation grouped by calendar day, in p3",
    "retuned_here": False,
    "trained_on_rows": int(rows_used),
    "trained_on_days": int(len(np.unique(groups))),
    "train_rows_available": int(len(train)),
    "fit_seconds": round(fit_seconds, 1),
    "features": FEATURES,
    "threshold": THRESHOLD,
    "importance": importance,
    "importance_note": (
        f"Measured by shuffling one column at a time and re-scoring on "
        f"{n_probe:,} flights from days the probe model was not fitted on. "
        f"Shuffling and re-scoring on the fitting rows would flatter every "
        f"feature. The test set is not involved."
    ),
    "importance_baseline_score": base_score,
    "browser_model": export,
    "family_models": fitted,
}
with open(P.ART / "p4_model.json", "w", encoding="utf-8") as fh:
    json.dump(out, fh, indent=2)
print("\nwrote artifacts/p4_model.json")

print("\n" + "=" * 74)
print("P4 complete. Nothing was tuned here, and test.csv was not opened.")
print("=" * 74)
