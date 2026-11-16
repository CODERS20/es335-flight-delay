"""
Step 04 - Export for the website, plus validation diagnostics.

Two jobs:

1. Export the fitted logistic-regression model as JSON so the website can score
   a flight in the browser. GitHub Pages serves static files only, with no
   Python available, but logistic regression is a weighted sum passed through a
   sigmoid -- about fifteen lines of JavaScript. The exported numbers are the
   model's own fitted coefficients, so the page reproduces its predictions
   exactly rather than approximating them.

   We verify this: the JavaScript arithmetic is re-implemented here in NumPy
   and checked against scikit-learn's own predict_proba on real rows. If the
   two disagree by more than 1e-6, this script fails.

2. Permutation importance for the selected model, measured on validation, so
   the website can say which schedule fields actually carry signal.

Outputs: docs/data/model.json, docs/data/options.json,
         artifacts/importance.json, artifacts/figures/importance.png
Run:     python src/step04_export_model.py
"""

from __future__ import annotations

import json

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.inspection import permutation_importance
from sklearn.metrics import average_precision_score

import config as C
import features as F

MODELS_DIR = C.ARTIFACTS_DIR / "models"
C.DOCS_DATA_DIR.mkdir(parents=True, exist_ok=True)

print("=" * 72)
print("STEP 04  Model export and validation diagnostics")
print("=" * 72)

with open(C.ARTIFACTS_DIR / "validation.json", encoding="utf-8") as fh:
    val_report = json.load(fh)
chosen = val_report["chosen_model"]
print(f"\nselected model from step 03: {chosen}")

X_va, y_va = F.load_split("val")

# ---------------------------------------------------------------------------
# 1. export the logistic regression for in-browser scoring
# ---------------------------------------------------------------------------
print("\n[1] exporting logistic regression to JSON")

lr = joblib.load(MODELS_DIR / "logistic_regression.joblib")
prep = lr.named_steps["prep"]
clf = lr.named_steps["clf"]
coef = clf.coef_.ravel()
intercept = float(clf.intercept_[0])

ohe = prep.named_transformers_["cat"]
scaler = prep.named_transformers_["num"]

# Column blocks, in the exact order ColumnTransformer concatenates them.
cat_names = list(ohe.get_feature_names_out(C.CATEGORICAL_FEATURES))
n_cat = len(cat_names)
n_hour = 2 * len(F.CYCLIC_HOURS)      # all sines, then all cosines
n_num = len(F.PLAIN_NUMERIC)
assert n_cat + n_hour + n_num == coef.size, (
    f"coefficient count {coef.size} != {n_cat}+{n_hour}+{n_num}"
)
print(f"    blocks: {n_cat} one-hot + {n_hour} cyclic + {n_num} numeric "
      f"= {coef.size} coefficients")

# --- categorical coefficients, grouped by source column
cat_coefs: dict[str, dict[str, float]] = {c: {} for c in C.CATEGORICAL_FEATURES}
for i, name in enumerate(cat_names):
    col = next(c for c in C.CATEGORICAL_FEATURES if name.startswith(c + "_"))
    level = name[len(col) + 1:]
    cat_coefs[col][level] = float(coef[i])

# --- cyclic hour coefficients
hour_coefs: dict[str, dict[str, float]] = {}
for j, col in enumerate(F.CYCLIC_HOURS):
    hour_coefs[col] = {
        "sin": float(coef[n_cat + j]),
        "cos": float(coef[n_cat + len(F.CYCLIC_HOURS) + j]),
    }

# --- numeric coefficients with their standardisation constants
num_coefs: dict[str, dict[str, float]] = {}
for k, col in enumerate(F.PLAIN_NUMERIC):
    num_coefs[col] = {
        "coef": float(coef[n_cat + n_hour + k]),
        "mean": float(scaler.mean_[k]),
        "scale": float(scaler.scale_[k]),
    }

model_json = {
    "model": "logistic_regression",
    "params": val_report["results"]["logistic_regression"]["params"],
    "intercept": intercept,
    "categorical": cat_coefs,
    "cyclic_hours": hour_coefs,
    "numeric": num_coefs,
    "infrequent_level": "infrequent_sklearn",
    "threshold": val_report["results"]["logistic_regression"]["threshold"],
    "val_pr_auc": val_report["results"]["logistic_regression"]["pr_auc"],
    "how_to_score": (
        "z = intercept + categorical[col][level] for each of the three "
        "categorical columns + sin/cos terms for the two clock hours + "
        "coef * (x - mean) / scale for each numeric; p = 1 / (1 + exp(-z)). "
        "A level absent from categorical[col] falls back to the "
        "'infrequent_sklearn' entry, or contributes 0 if there is none."
    ),
}

# ---------------------------------------------------------------------------
# verify the exported arithmetic reproduces scikit-learn exactly
# ---------------------------------------------------------------------------
print("\n[2] verifying the exported model against scikit-learn")


def score_like_javascript(row: pd.Series) -> float:
    """Re-implementation of what app.js will do, used only as a check."""
    z = model_json["intercept"]
    for col in C.CATEGORICAL_FEATURES:
        table = model_json["categorical"][col]
        level = str(row[col])
        if level in table:
            z += table[level]
        elif model_json["infrequent_level"] in table:
            z += table[model_json["infrequent_level"]]
    for col, cc in model_json["cyclic_hours"].items():
        rad = 2.0 * np.pi * float(row[col]) / 24.0
        z += cc["sin"] * np.sin(rad) + cc["cos"] * np.cos(rad)
    for col, nc in model_json["numeric"].items():
        z += nc["coef"] * (float(row[col]) - nc["mean"]) / nc["scale"]
    return 1.0 / (1.0 + np.exp(-z))


check = X_va.sample(n=500, random_state=C.SEED)
mine = np.array([score_like_javascript(r) for _, r in check.iterrows()])
theirs = lr.predict_proba(check)[:, 1]
max_err = float(np.max(np.abs(mine - theirs)))
print(f"    max |exported - sklearn| over 500 validation rows: {max_err:.2e}")
if max_err > 1e-6:
    raise SystemExit(
        f"FATAL: exported model disagrees with scikit-learn by {max_err:.2e}. "
        "The website would show predictions the repository cannot reproduce."
    )
print("    exported model reproduces scikit-learn exactly  [passed]")
model_json["verified_max_abs_error_vs_sklearn"] = max_err

with open(C.DOCS_DATA_DIR / "model.json", "w", encoding="utf-8") as fh:
    json.dump(model_json, fh, indent=2)
print("    wrote docs/data/model.json")

# ---------------------------------------------------------------------------
# 3. dropdown options for the predictor
# ---------------------------------------------------------------------------
print("\n[3] building dropdown options")
X_tr, y_tr = F.load_split("train")
airlines = pd.read_csv(C.AIRLINES_CSV)
name_of = dict(zip(airlines.iloc[:, 0], airlines.iloc[:, 1]))
airports = pd.read_csv(C.AIRPORTS_CSV)
apt_city = dict(zip(airports["IATA_CODE"], airports["CITY"]))

air_counts = X_tr["AIRLINE"].value_counts()
# Offer airports with enough training flights that the model has really seen them.
org_counts = X_tr["ORIGIN_AIRPORT"].value_counts()
org_offer = org_counts[org_counts >= 2000]

options = {
    "airlines": [
        {"code": str(a), "name": name_of.get(a, str(a)), "n_train": int(n)}
        for a, n in air_counts.items()
    ],
    "airports": [
        {"code": str(a), "city": str(apt_city.get(a, "")), "n_train": int(n)}
        for a, n in org_offer.items()
    ],
    "note": (
        f"Airports listed are those with at least 2,000 training flights "
        f"({len(org_offer)} of {len(org_counts)}), so the predictor only "
        f"offers routes the model has substantial evidence about."
    ),
    "defaults": {
        "scheduled_time_median": float(X_tr["SCHEDULED_TIME"].median()),
        "distance_median": float(X_tr["DISTANCE"].median()),
    },
}
# Real routes, with the distance and scheduled duration each actually has in
# the training data. Without this the predictor would accept nonsense -- a
# 200-mile flight scheduled for five hours -- and report a confident number for
# a flight that cannot exist. The user picks a real route; the schedule fields
# follow from it.
offered = set(org_offer.index)
route_src = X_tr[
    X_tr["ORIGIN_AIRPORT"].isin(offered) & X_tr["DESTINATION_AIRPORT"].isin(offered)
]
routes = (
    route_src.groupby(["ORIGIN_AIRPORT", "DESTINATION_AIRPORT"], observed=True)
    .agg(n=("DISTANCE", "size"),
         distance=("DISTANCE", "median"),
         sched=("SCHEDULED_TIME", "median"))
    .reset_index()
)
routes = routes[routes["n"] >= 50]
route_map: dict[str, dict[str, list]] = {}
for r in routes.itertuples(index=False):
    route_map.setdefault(str(r.ORIGIN_AIRPORT), {})[str(r.DESTINATION_AIRPORT)] = [
        int(r.distance), int(r.sched),
    ]
options["routes"] = route_map
options["routes_note"] = (
    f"{len(routes):,} origin-destination pairs with at least 50 training "
    f"flights. Distance and scheduled duration are the training medians for "
    f"that route, so the predictor is never asked about an impossible flight."
)

with open(C.DOCS_DATA_DIR / "options.json", "w", encoding="utf-8") as fh:
    json.dump(options, fh, indent=2)
print(f"    {len(options['airlines'])} carriers, {len(options['airports'])} airports, "
      f"{len(routes):,} routes")
print("    wrote docs/data/options.json")

# ---------------------------------------------------------------------------
# 4. permutation importance for the selected model, on validation
# ---------------------------------------------------------------------------
print(f"\n[4] permutation importance for {chosen} (validation subsample)")
model = joblib.load(MODELS_DIR / f"{chosen}.joblib")

N_PERM_ROWS, N_PERM_REPEATS = 40_000, 3
sub = X_va.sample(n=N_PERM_ROWS, random_state=C.SEED)
sub_y = y_va.loc[sub.index]
base = average_precision_score(sub_y, model.predict_proba(sub)[:, 1])
print(f"    baseline curve area on the subsample: {base:.4f}")

imp = permutation_importance(
    model, sub, sub_y,
    scoring="average_precision",
    n_repeats=N_PERM_REPEATS,
    random_state=C.SEED,
    n_jobs=1,
)
order = np.argsort(imp.importances_mean)[::-1]
importance = [
    {
        "feature": C.ALLOWED_FEATURES[i],
        "drop_in_pr_auc": float(imp.importances_mean[i]),
        "std": float(imp.importances_std[i]),
    }
    for i in order
]
for row in importance:
    print(f"    {row['feature']:22s} {row['drop_in_pr_auc']:+.4f} "
          f"+/- {row['std']:.4f}")

imp_json = {
    "model": chosen,
    "measured_on": f"validation subsample ({N_PERM_ROWS:,} rows)",
    "metric": "area under the precision-recall curve (scikit-learn average_precision)",
    "baseline_pr_auc": float(base),
    "n_repeats": N_PERM_REPEATS,
    "importance": importance,
    "interpretation": (
        "Each value is how much the precision-recall curve area falls when that single column is "
        "randomly shuffled, breaking its relationship with the target while "
        "leaving every other column intact. Larger means more load-bearing."
    ),
}
with open(C.ARTIFACTS_DIR / "importance.json", "w", encoding="utf-8") as fh:
    json.dump(imp_json, fh, indent=2)
print("    wrote artifacts/importance.json")

fig, ax = plt.subplots(figsize=(7, 4))
names = [r["feature"] for r in importance][::-1]
vals = [r["drop_in_pr_auc"] for r in importance][::-1]
errs = [r["std"] for r in importance][::-1]
ax.barh(names, vals, xerr=errs, color="#2b5fd9", edgecolor="none",
        error_kw=dict(ecolor="#8b8b99", lw=1))
ax.set_xlabel("Drop in precision-recall curve area when shuffled")
ax.set_title(f"Feature ablation by shuffling -- {chosen} (validation)")
ax.spines[["top", "right"]].set_visible(False)
fig.savefig(C.FIGURES_DIR / "importance.png", dpi=150, bbox_inches="tight")
plt.close(fig)
print("    wrote artifacts/figures/importance.png")

print("\n" + "=" * 72)
print("STEP 04 complete -- test set still untouched")
print("=" * 72)
