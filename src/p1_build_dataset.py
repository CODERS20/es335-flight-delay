"""
P1 - Build one clean dataset.

WHAT THIS DOES
--------------
Reads the raw flights.csv, removes the rows we cannot label, derives the
schedule features, measures which features are redundant, drops those, and
writes ONE csv that every later step reads.

    raw flights.csv  ->  data/flights_clean.csv

Nothing downstream ever touches the raw file again, so there is exactly one
place where cleaning decisions live.

THE TWO RULES THAT MATTER
-------------------------
1. Only schedule-time columns are allowed. A flight's actual departure time,
   taxi time, air time and the airline's own delay-cause breakdown are all
   recorded during or after the flight. Using them would mean predicting the
   arrival delay from the departure delay, which is both trivial and useless at
   the moment you would actually want a prediction. `FORBIDDEN` lists them and
   `assert_no_leakage` raises if one ever reaches a model.

2. Redundancy is measured, not assumed. Two features that carry the same
   information make a model harder to read without making it better, so we
   check correlations and exact functional duplicates, print the evidence, and
   drop on that basis.

Run:  python src/p1_build_dataset.py
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd

import pconfig as P

print("=" * 74)
print("P1  Build one clean dataset")
print("=" * 74)

# ---------------------------------------------------------------------------
# 1. read only the columns we are allowed to read
# ---------------------------------------------------------------------------
DTYPES = {
    "MONTH": "int8", "DAY": "int8", "DAY_OF_WEEK": "int8",
    "AIRLINE": "category",
    "ORIGIN_AIRPORT": "category", "DESTINATION_AIRPORT": "category",
    "SCHEDULED_DEPARTURE": "int16", "SCHEDULED_ARRIVAL": "int16",
    "SCHEDULED_TIME": "float32", "DISTANCE": "int16",
    "ARRIVAL_DELAY": "float32",
    "CANCELLED": "int8", "DIVERTED": "int8",
}

print(f"\nreading {P.FLIGHTS_CSV.name} ...")
df = pd.read_csv(P.FLIGHTS_CSV, usecols=list(DTYPES), dtype=DTYPES)
n_raw = len(df)
print(f"  {n_raw:,} rows, {df.memory_usage(deep=True).sum() / 1e6:.0f} MB in memory")

log: list[dict] = []


def record(step: str, removed: int, reason: str) -> None:
    log.append({"step": step, "rows_removed": int(removed),
                "rows_left": int(len(df)), "reason": reason})
    print(f"  {step:<34} -{removed:>9,}   {len(df):>9,} left")


# ---------------------------------------------------------------------------
# 2. remove rows we cannot label
# ---------------------------------------------------------------------------
print("\nremoving rows that cannot be labelled:")

before = len(df)
df = df[df["CANCELLED"] == 0]
record("cancelled flights", before - len(df),
       "a cancelled flight never arrives, so it has no arrival delay to predict")

before = len(df)
df = df[df["DIVERTED"] == 0]
record("diverted flights", before - len(df),
       "a diverted flight has no arrival at its scheduled destination")

before = len(df)
df = df[df["ARRIVAL_DELAY"].notna()]
record("missing arrival delay", before - len(df),
       "no label")

# ---------------------------------------------------------------------------
# 3. the October defect
# ---------------------------------------------------------------------------
# October 2015 stores airport codes as numeric DOT ids while every other month
# uses IATA letter codes, and airports.csv has no DOT column to translate them.
# Keeping the month would add hundreds of airport categories that appear in no
# other month. Verified here rather than taken on trust.
print("\nchecking airport code formats by month:")
fmt = {}
for m, g in df.groupby("MONTH", observed=True):
    codes = g["ORIGIN_AIRPORT"].astype(str)
    numeric_share = float(codes.str.fullmatch(r"\d+").mean())
    fmt[int(m)] = {"rows": int(len(g)), "pct_numeric_codes": round(100 * numeric_share, 1)}
    flag = "  <-- numeric DOT ids" if numeric_share > 0.5 else ""
    print(f"  month {m:>2}  {len(g):>9,} rows  {100 * numeric_share:>5.1f}% numeric{flag}")

bad_months = [m for m, v in fmt.items() if v["pct_numeric_codes"] > 50]
before = len(df)
df = df[~df["MONTH"].isin(bad_months)]
record(f"month(s) {bad_months} excluded", before - len(df),
       "airport codes are numeric DOT ids that airports.csv cannot translate")

# ---------------------------------------------------------------------------
# 4. the label, and the derived schedule features
# ---------------------------------------------------------------------------
print("\nbuilding the label and the derived features:")
df[P.TARGET] = (df["ARRIVAL_DELAY"] >= P.DELAY_MINUTES).astype("int8")
print(f"  {P.TARGET} = ARRIVAL_DELAY >= {P.DELAY_MINUTES}  "
      f"-> delay rate {df[P.TARGET].mean():.4f}")

# hhmm -> hour. Pure arithmetic on a number printed on the ticket.
df["SCHED_DEP_HOUR"] = (df["SCHEDULED_DEPARTURE"] // 100).clip(0, 23).astype("int8")
df["SCHED_ARR_HOUR"] = (df["SCHEDULED_ARRIVAL"] // 100).clip(0, 23).astype("int8")
df["IS_WEEKEND"] = df["DAY_OF_WEEK"].isin([6, 7]).astype("int8")
print("  SCHED_DEP_HOUR, SCHED_ARR_HOUR, IS_WEEKEND derived from the schedule")

# Missing scheduled duration is filled from the TRAINING rows only, so no
# information from the held-out days reaches the fill value. p2 makes the same
# seeded choice of days, so the two scripts always agree about which rows those
# are.
days_by_month = {
    int(m): sorted(int(d) for d in g["DAY"].unique())
    for m, g in df.groupby("MONTH", observed=True)
}
test_days = P.test_day_map(days_by_month)
is_test = pd.Series(
    [day in test_days.get(month, set())
     for month, day in zip(df["MONTH"].to_numpy(), df["DAY"].to_numpy())],
    index=df.index,
)
train_mask = ~is_test
median_sched = float(df.loc[train_mask, "SCHEDULED_TIME"].median())
n_missing = int(df["SCHEDULED_TIME"].isna().sum())
df["SCHEDULED_TIME"] = df["SCHEDULED_TIME"].fillna(median_sched).astype("float32")
print(f"  SCHEDULED_TIME: {n_missing} missing, filled with the training median "
      f"({median_sched:.0f} min)")

# ---------------------------------------------------------------------------
# 5. duplicates
# ---------------------------------------------------------------------------
# A flight leg repeats daily by design, so identical feature rows are expected
# and are genuinely different flights. We report the count and keep them: the
# only thing that would be wrong is to silently de-duplicate real flights.
dup = int(df.duplicated(subset=P.CANDIDATE_FEATURES).sum())
print(f"\nrows sharing an identical feature vector: {dup:,} "
      f"({100 * dup / len(df):.1f}%) -- kept, they are different flights on "
      f"different dates")

# ---------------------------------------------------------------------------
# 6. redundancy: measure, then drop
# ---------------------------------------------------------------------------
print("\n" + "-" * 74)
print("REDUNDANCY CHECK  (training rows only)")
print("-" * 74)

num = [c for c in P.CANDIDATE_FEATURES if c not in P.CATEGORICAL]
train_num = df.loc[train_mask, num].astype("float64")
corr = train_num.corr()

print("\npairwise correlation, strongest first:")
pairs = []
for i, a in enumerate(num):
    for b in num[i + 1:]:
        pairs.append((abs(corr.loc[a, b]), a, b, corr.loc[a, b]))
pairs.sort(reverse=True)
for abs_r, a, b, r in pairs[:8]:
    mark = "  <-- redundant" if abs_r >= P.CORR_DROP_THRESHOLD else ""
    print(f"  {a:>16s}  {b:<16s} r = {r:+.3f}{mark}")

# An exact functional duplicate is stronger evidence than a correlation: if one
# column is determined by another, it carries no information of its own.
weekend_from_dow = bool(
    (df["IS_WEEKEND"] == df["DAY_OF_WEEK"].isin([6, 7]).astype("int8")).all()
)
print(f"\nIS_WEEKEND is exactly determined by DAY_OF_WEEK: {weekend_from_dow}")

dropped: dict[str, str] = {}
if weekend_from_dow:
    dropped["IS_WEEKEND"] = (
        "exactly determined by DAY_OF_WEEK, so it adds no information a model "
        "cannot already read off that column"
    )
for abs_r, a, b, r in pairs:
    if abs_r >= P.CORR_DROP_THRESHOLD and a not in dropped and b not in dropped:
        # keep the one that is fixed by the route and easier to interpret
        keep, drop = (a, b) if a in P.PREFER_KEEP else (b, a)
        dropped[drop] = (
            f"correlated {r:+.3f} with {keep}; the two carry the same "
            f"information, and {keep} is the more directly interpretable of them"
        )

FEATURES = [c for c in P.CANDIDATE_FEATURES if c not in dropped]
print("\ndropped:")
for k, v in dropped.items():
    print(f"  {k:<16s} {v}")
print(f"\nfinal feature set ({len(FEATURES)}):")
for f in FEATURES:
    kind = "categorical" if f in P.CATEGORICAL else "numeric"
    print(f"  {f:<22s} {kind}")

P.assert_no_leakage(FEATURES)
print("\nleakage check passed: no forbidden column is in the feature set")

# ---------------------------------------------------------------------------
# 7. write the one clean csv
# ---------------------------------------------------------------------------
out = df[FEATURES + [P.TARGET, "MONTH"]].copy() if "MONTH" not in FEATURES \
    else df[FEATURES + [P.TARGET]].copy()
# MONTH is needed by p2 to split by calendar even if it is not a feature.
if "MONTH" not in out.columns:
    out["MONTH"] = df["MONTH"]

P.DATA_DIR.mkdir(parents=True, exist_ok=True)
out.to_csv(P.CLEAN_CSV, index=False)
size_mb = P.CLEAN_CSV.stat().st_size / 1e6
print(f"\nwrote {P.CLEAN_CSV.relative_to(P.REPO_ROOT)}  "
      f"({len(out):,} rows x {len(out.columns)} cols, {size_mb:.0f} MB)")

report = {
    "rows_raw": n_raw,
    "rows_clean": int(len(out)),
    "cleaning_log": log,
    "airport_code_format_by_month": fmt,
    "months_excluded": bad_months,
    "target": {"column": P.TARGET, "rule": f"ARRIVAL_DELAY >= {P.DELAY_MINUTES}",
               "delay_rate_overall": float(out[P.TARGET].mean())},
    "delay_rate_by_month": {
        int(m): float(g[P.TARGET].mean()) for m, g in out.groupby("MONTH", observed=True)
    },
    "rows_by_month": {
        int(m): int(len(g)) for m, g in out.groupby("MONTH", observed=True)
    },
    "scheduled_time_median_train": median_sched,
    "scheduled_time_missing": n_missing,
    "identical_feature_rows": dup,
    "correlations": {f"{a}|{b}": float(r) for _, a, b, r in pairs},
    "dropped_features": dropped,
    "final_features": FEATURES,
    "categorical_features": [f for f in FEATURES if f in P.CATEGORICAL],
    "numeric_features": [f for f in FEATURES if f not in P.CATEGORICAL],
    "forbidden_features": P.FORBIDDEN,
    "csv_size_mb": round(size_mb, 1),
}
with open(P.ART / "p1_dataset.json", "w", encoding="utf-8") as fh:
    json.dump(report, fh, indent=2)
print(f"wrote artifacts/p1_dataset.json")

print("\n" + "=" * 74)
print("P1 complete. Every later step reads only the clean csv.")
print("=" * 74)
