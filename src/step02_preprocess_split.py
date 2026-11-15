"""
Step 02 - Cleaning, feature construction and the chronological split.

Decisions made here, each with its reason:

1. EXCLUDE cancelled and diverted flights. They have no recorded arrival delay,
   so they cannot be labelled. Every claim narrows to "flights that operated".

2. EXCLUDE October 2015. Step 01 proved that October stores airport codes as
   numeric DOT ids while every other month uses IATA letter codes, and that
   airports.csv carries no DOT id column, so 0 of 306 numeric codes can be
   mapped. Keeping October would inject 306 airport categories into validation
   that the model never saw in training -- it would corrupt the very set we use
   to tune. Validation therefore becomes September only. This is a documented
   deviation from the proposal, forced by a data-quality defect.

3. Derived features are arithmetic on published schedule fields only
   (hhmm -> hour, weekend flag). Nothing is learned from the data here, so
   these cannot leak.

4. SCHEDULED_TIME has 6 missing values. They are imputed with the TRAINING
   median, computed on training rows alone and then applied to all three
   splits.

5. A fixed, seeded subsample of the training rows is taken so that random
   forest and gradient boosting finish in reasonable time on a laptop. All
   models receive exactly the same training rows, keeping the comparison fair.
   Validation and test are always used in full.

Outputs: data/processed/{train,val,test}.parquet, artifacts/splits.json
Run:     python src/step02_preprocess_split.py
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd

import config as C

TRAIN_SUBSAMPLE = 1_000_000  # see decision 5

print("=" * 72)
print("STEP 02  Preprocessing and chronological split")
print("=" * 72)

dtypes = {
    "MONTH": "int8", "DAY": "int8", "DAY_OF_WEEK": "int8",
    "AIRLINE": "category", "ORIGIN_AIRPORT": "category",
    "DESTINATION_AIRPORT": "category",
    "SCHEDULED_DEPARTURE": "int16", "SCHEDULED_ARRIVAL": "int16",
    "SCHEDULED_TIME": "float32", "DISTANCE": "int16",
    "ARRIVAL_DELAY": "float32", "CANCELLED": "int8", "DIVERTED": "int8",
}

print("\n[1] loading raw columns ...")
df = pd.read_csv(C.FLIGHTS_CSV, usecols=C.RAW_COLUMNS_TO_READ, dtype=dtypes)
n_raw = len(df)
print(f"    {n_raw:,} rows")

report: dict = {"n_rows_raw": int(n_raw)}

# ---------------------------------------------------------------------------
# exclusions
# ---------------------------------------------------------------------------
print("\n[2] exclusions")
step = []

mask = pd.Series(True, index=df.index)

cancelled = df["CANCELLED"] == 1
mask &= ~cancelled
step.append(("cancelled flights removed", int(cancelled.sum())))

diverted = df["DIVERTED"] == 1
mask &= ~diverted
step.append(("diverted flights removed", int((diverted & ~cancelled).sum())))

df = df[mask]

no_label = df["ARRIVAL_DELAY"].isna()
step.append(("remaining rows with no arrival delay", int(no_label.sum())))
df = df[~no_label]

october = df["MONTH"] == 10
step.append(("October removed (unmappable numeric airport codes)",
             int(october.sum())))
df = df[~october]

for name, n in step:
    print(f"    {name:52s} {n:>9,}")
report["exclusions"] = [{"reason": n, "rows": c} for n, c in step]
report["n_rows_after_exclusions"] = int(len(df))
print(f"    {'rows remaining':52s} {len(df):>9,}")

# ---------------------------------------------------------------------------
# target
# ---------------------------------------------------------------------------
print("\n[3] target")
df[C.TARGET_COLUMN] = (
    df["ARRIVAL_DELAY"] >= C.DELAY_THRESHOLD_MINUTES
).astype("int8")
print(f"    IS_DELAYED = ARRIVAL_DELAY >= {C.DELAY_THRESHOLD_MINUTES} min")
print(f"    overall delay rate: {df[C.TARGET_COLUMN].mean():.4f}")

# ---------------------------------------------------------------------------
# derived features (pure arithmetic on scheduled fields -- cannot leak)
# ---------------------------------------------------------------------------
print("\n[4] derived features")
df["SCHED_DEP_HOUR"] = (df["SCHEDULED_DEPARTURE"] // 100).clip(0, 23).astype("int8")
df["SCHED_ARR_HOUR"] = (df["SCHEDULED_ARRIVAL"] // 100).clip(0, 23).astype("int8")
df["IS_WEEKEND"] = df["DAY_OF_WEEK"].isin([6, 7]).astype("int8")
print("    SCHED_DEP_HOUR, SCHED_ARR_HOUR  (hhmm // 100)")
print("    IS_WEEKEND                      (DAY_OF_WEEK in {6,7})")

# ---------------------------------------------------------------------------
# split by calendar
# ---------------------------------------------------------------------------
print("\n[5] chronological split")
train_full = df[df["MONTH"].isin(C.TRAIN_MONTHS)]
val = df[df["MONTH"].isin(C.VAL_MONTHS_EFFECTIVE)]
test = df[df["MONTH"].isin(C.TEST_MONTHS)]

assert set(train_full["MONTH"]) & set(val["MONTH"]) == set()
assert set(train_full["MONTH"]) & set(test["MONTH"]) == set()
assert set(val["MONTH"]) & set(test["MONTH"]) == set()
print("    no month appears in two splits  [checked]")

# ---------------------------------------------------------------------------
# training-only imputation
# ---------------------------------------------------------------------------
print("\n[6] imputation fitted on TRAIN only")
sched_median = float(train_full["SCHEDULED_TIME"].median())
n_imputed = {
    "train": int(train_full["SCHEDULED_TIME"].isna().sum()),
    "val": int(val["SCHEDULED_TIME"].isna().sum()),
    "test": int(test["SCHEDULED_TIME"].isna().sum()),
}
for part in (train_full, val, test):
    part.loc[:, "SCHEDULED_TIME"] = part["SCHEDULED_TIME"].fillna(sched_median)
print(f"    SCHEDULED_TIME median from train = {sched_median:.0f} min")
print(f"    values imputed: {n_imputed}")
report["train_scheduled_time_median"] = sched_median
report["n_imputed_scheduled_time"] = n_imputed

# ---------------------------------------------------------------------------
# seeded training subsample
# ---------------------------------------------------------------------------
print("\n[7] training subsample")
if len(train_full) > TRAIN_SUBSAMPLE:
    train = train_full.sample(n=TRAIN_SUBSAMPLE, random_state=C.SEED)
    print(f"    {len(train_full):,} -> {len(train):,} rows "
          f"(seed {C.SEED}; all models share these rows)")
else:
    train = train_full
report["n_train_available"] = int(len(train_full))
report["n_train_used"] = int(len(train))
report["train_subsample_seed"] = C.SEED
report["train_delay_rate_full"] = float(train_full[C.TARGET_COLUMN].mean())
report["train_delay_rate_subsample"] = float(train[C.TARGET_COLUMN].mean())
print(f"    delay rate: full {report['train_delay_rate_full']:.4f} "
      f"vs subsample {report['train_delay_rate_subsample']:.4f}")

# ---------------------------------------------------------------------------
# keep only allow-listed columns + target
# ---------------------------------------------------------------------------
keep = C.ALLOWED_FEATURES + [C.TARGET_COLUMN]
train, val, test = train[keep], val[keep], test[keep]

C.assert_no_leakage(train.columns)
C.assert_no_leakage(val.columns)
C.assert_no_leakage(test.columns)
print("\n[8] leakage check on all three splits  [passed]")

# ---------------------------------------------------------------------------
# save
# ---------------------------------------------------------------------------
print("\n[9] saving splits")
C.PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
for name, part in [("train", train), ("val", val), ("test", test)]:
    out = C.PROCESSED_DIR / f"{name}.parquet"
    part.to_parquet(out, index=False)
    # The test delay rate is withheld here on purpose: the test period stays
    # uninspected until step 05. Only its row count is printed.
    rate = ("withheld" if name == "test"
            else f"{part[C.TARGET_COLUMN].mean():.4f}")
    print(f"    {name:5s} {len(part):>9,} rows  delay rate {rate:>8s}  -> {out.name}")

report["splits"] = {
    "train": {"months": C.TRAIN_MONTHS, "n": int(len(train)),
              "delay_rate": float(train[C.TARGET_COLUMN].mean())},
    "val": {"months": C.VAL_MONTHS_EFFECTIVE, "n": int(len(val)),
            "delay_rate": float(val[C.TARGET_COLUMN].mean())},
    "test": {"months": C.TEST_MONTHS, "n": int(len(test)),
             "delay_rate": "withheld until final evaluation"},
}
report["october_excluded"] = True
report["october_reason"] = (
    "October 2015 encodes airport codes as numeric DOT ids; airports.csv has no "
    "DOT id column, so 0 of 306 codes are mappable. Including October would add "
    "306 unseen airport categories to validation."
)
report["n_features"] = len(C.ALLOWED_FEATURES)
report["features"] = C.ALLOWED_FEATURES

with open(C.ARTIFACTS_DIR / "splits.json", "w", encoding="utf-8") as fh:
    json.dump(report, fh, indent=2)
print(f"    wrote artifacts/splits.json")

print("\n" + "=" * 72)
print("STEP 02 complete  (test delay rate intentionally not printed)")
print("=" * 72)
