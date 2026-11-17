"""
P2 - Split the clean dataset into train and test.

    data/flights_clean.csv  ->  data/train.csv  +  data/test.csv

HOW THE SPLIT WORKS, AND WHY
----------------------------
We hold out 20% of flights as WHOLE CALENDAR DAYS, drawn from every month.

Three things that would each be wrong, and what we do instead:

  * Splitting single flights at random. A bad weather day would then have some
    of its flights in training and the rest in test, so a model could learn
    that specific day's disruption from the training half and get the test half
    almost free. Holding out the whole day removes that route.

  * Training on the earlier months and testing on the later ones only. The
    model would then have to extrapolate: month values 11 and 12 appear nowhere
    in training, so a tree can only place those flights in a branch it never
    populated, and a linear model extends a straight line past the edge of its
    data. We run that version too, as a secondary check, because it answers the
    forecasting question -- but it is not the main split.

  * Choosing the days by hand, or after seeing a result. The choice is a seeded
    draw defined once in pconfig, so p1 and p2 and every re-run agree.

The test file is written once and then left alone until p5.

Run:  python src/p2_split.py
"""

from __future__ import annotations

import json

import pandas as pd

import pconfig as P

print("=" * 74)
print("P2  Train / test split")
print("=" * 74)

print(f"\nreading {P.CLEAN_CSV.name} ...")
df = pd.read_csv(P.CLEAN_CSV)
print(f"  {len(df):,} rows, {len(df.columns)} columns")

# ---------------------------------------------------------------------------
# which days are held out
# ---------------------------------------------------------------------------
days_by_month = {
    int(m): sorted(int(d) for d in g["DAY"].unique())
    for m, g in df.groupby("MONTH", observed=True)
}
test_days = P.test_day_map(days_by_month)

print(f"\nholding out whole days, {P.TEST_FRACTION:.0%} of the calendar in each month:")
for m in sorted(test_days):
    held = sorted(test_days[m])
    print(f"  month {m:>2}: {len(held):>2} of {len(days_by_month[m]):>2} days -> "
          f"{', '.join(str(d) for d in held)}")

# A flight is a test flight if and only if its own date was drawn.
key = df["MONTH"].astype(int) * 100 + df["DAY"].astype(int)
test_keys = {m * 100 + d for m, days in test_days.items() for d in days}
is_test = key.isin(test_keys)

train = df.loc[~is_test].copy()
test = df.loc[is_test].copy()

# ---------------------------------------------------------------------------
# checks that the split is what we claim it is
# ---------------------------------------------------------------------------
print("\nchecks:")

overlap = set(key[~is_test]) & set(key[is_test])
assert not overlap, f"a day appears on both sides: {sorted(overlap)[:5]}"
print(f"  no calendar day appears on both sides                 OK")

assert len(train) + len(test) == len(df), "rows lost in the split"
print(f"  every row is on exactly one side                      OK")

for col in ("MONTH", "DAY", "DAY_OF_WEEK"):
    missing = set(train[col].unique()) ^ set(test[col].unique())
    print(f"  {col:<12s} values present on both sides: "
          f"{'OK' if not missing else sorted(missing)}")

# Nothing has to be extrapolated, which was the whole point of this design.
for col in P.CATEGORICAL:
    unseen = set(test[col].unique()) - set(train[col].unique())
    print(f"  {col:<20s} categories in test but not train: {len(unseen)}")

print(f"\n  train delay rate {train[P.TARGET].mean():.4f}   "
      f"test delay rate {test[P.TARGET].mean():.4f}   "
      f"(they should be close)")

print("\nper month, train vs test delay rate:")
print(f"  {'month':>6} {'train n':>10} {'test n':>9} {'train rate':>11} {'test rate':>10}")
per_month = []
for m in sorted(days_by_month):
    tr = train[train["MONTH"] == m]
    te = test[test["MONTH"] == m]
    per_month.append({
        "month": int(m),
        "train_rows": int(len(tr)), "test_rows": int(len(te)),
        "train_delay_rate": float(tr[P.TARGET].mean()),
        "test_delay_rate": float(te[P.TARGET].mean()),
    })
    print(f"  {m:>6} {len(tr):>10,} {len(te):>9,} "
          f"{tr[P.TARGET].mean():>11.4f} {te[P.TARGET].mean():>10.4f}")

# ---------------------------------------------------------------------------
# write
# ---------------------------------------------------------------------------
train.to_csv(P.TRAIN_CSV, index=False)
test.to_csv(P.TEST_CSV, index=False)
print(f"\nwrote {P.TRAIN_CSV.relative_to(P.REPO_ROOT)}  ({len(train):,} rows, "
      f"{P.TRAIN_CSV.stat().st_size / 1e6:.0f} MB)")
print(f"wrote {P.TEST_CSV.relative_to(P.REPO_ROOT)}   ({len(test):,} rows, "
      f"{P.TEST_CSV.stat().st_size / 1e6:.0f} MB)")

report = {
    "design": (
        f"{P.TEST_FRACTION:.0%} of flights held out as whole calendar days, drawn "
        f"from every month with seed {P.SEED}"
    ),
    "why_whole_days": (
        "If one day's flights were split across training and test, a model "
        "could learn that day's disruption from the training half and score the "
        "test half almost for free."
    ),
    "why_every_month": (
        "Training on the earlier months and testing on the later ones would "
        "force the model to extrapolate: month values 11 and 12 would appear "
        "nowhere in training. Drawing days from every month means every MONTH, "
        "DAY and DAY_OF_WEEK value, and every carrier and airport, is present "
        "on both sides."
    ),
    "seed": P.SEED,
    "test_days_by_month": {str(m): sorted(d) for m, d in test_days.items()},
    "days_by_month": {str(m): len(d) for m, d in days_by_month.items()},
    "train_rows": int(len(train)),
    "test_rows": int(len(test)),
    "train_delay_rate": float(train[P.TARGET].mean()),
    "test_delay_rate": float(test[P.TARGET].mean()),
    "per_month": per_month,
    "unseen_categories_in_test": {
        c: int(len(set(test[c].unique()) - set(train[c].unique()))) for c in P.CATEGORICAL
    },
    "secondary_check": {
        "train_months": P.CHRONO_TRAIN_MONTHS,
        "test_months": P.CHRONO_TEST_MONTHS,
        "purpose": (
            "A harder, forecasting version of the same question, reported "
            "alongside the main result: fit on the earlier months and score the "
            "two later ones, where the base rate is higher and the month values "
            "are unseen."
        ),
    },
}
with open(P.ART / "p2_split.json", "w", encoding="utf-8") as fh:
    json.dump(report, fh, indent=2)
print("wrote artifacts/p2_split.json")

print("\n" + "=" * 74)
print("P2 complete. test.csv is not opened again until p5.")
print("=" * 74)
