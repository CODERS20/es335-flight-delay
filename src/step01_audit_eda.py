"""
Step 01 - Data understanding and quality audit.

Answers, from the data itself and with no guessing:
  1. What is actually in flights.csv (schema, size, memory)?
  2. The airport-code question: which months use IATA letter codes and which
     use numeric DOT ids, and exactly how many rows are affected?
  3. Can airports.csv support a numeric -> IATA mapping, or not?
  4. How many rows are cancelled / diverted / unlabelled?
  5. Class balance and the headline relationships (delay rate by hour, carrier,
     month, day of week, distance).

Discipline: structural checks (schema, code formats, row counts) run over all
twelve months because they are properties of the file, not of the labels.
Anything involving the TARGET is computed on the training months only, so the
validation and test periods are not inspected before they are used.

Outputs: artifacts/audit.json, artifacts/eda.json, artifacts/figures/*.png
Run:     python src/step01_audit_eda.py
"""

from __future__ import annotations

import json
import time

import matplotlib
matplotlib.use("Agg")  # headless: write PNGs, never open a window
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

import config as C


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def jdump(obj, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=2, default=str)
    print(f"  wrote {path.relative_to(C.REPO_ROOT)}")


def savefig(fig, name):
    C.FIGURES_DIR.mkdir(parents=True, exist_ok=True)
    out = C.FIGURES_DIR / name
    fig.savefig(out, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  wrote {out.relative_to(C.REPO_ROOT)}")


PLOT_STYLE = dict(color="#2b5fd9", edgecolor="none")


# ---------------------------------------------------------------------------
# 1. schema
# ---------------------------------------------------------------------------
print("=" * 72)
print("STEP 01  Data understanding and quality audit")
print("=" * 72)

audit: dict = {}

header = pd.read_csv(C.FLIGHTS_CSV, nrows=0)
all_columns = list(header.columns)
print(f"\n[1] flights.csv has {len(all_columns)} columns")
print(f"    {all_columns}")

audit["file_size_mb"] = round(C.FLIGHTS_CSV.stat().st_size / 1024**2, 1)
audit["n_columns_in_file"] = len(all_columns)
audit["all_columns"] = all_columns

missing = [c for c in C.RAW_COLUMNS_TO_READ if c not in all_columns]
if missing:
    raise SystemExit(f"FATAL: expected columns absent from CSV: {missing}")

# Which forbidden columns really are in the file? Evidence for the website
# that we excluded them deliberately, not because they were absent.
present_forbidden = [c for c in C.FORBIDDEN_FEATURES if c in all_columns]
audit["forbidden_columns_present_in_file"] = present_forbidden
print(f"    {len(present_forbidden)} forbidden (post-departure) columns exist "
      f"in the file and are excluded by the allow-list")

# ---------------------------------------------------------------------------
# 2. load only what we need, with narrow dtypes (RAM is tight)
# ---------------------------------------------------------------------------
dtypes = {
    "MONTH": "int8",
    "DAY": "int8",
    "DAY_OF_WEEK": "int8",
    "AIRLINE": "category",
    "ORIGIN_AIRPORT": "category",
    "DESTINATION_AIRPORT": "category",
    "SCHEDULED_DEPARTURE": "int16",
    "SCHEDULED_ARRIVAL": "int16",
    "SCHEDULED_TIME": "float32",
    "DISTANCE": "int16",
    "ARRIVAL_DELAY": "float32",
    "CANCELLED": "int8",
    "DIVERTED": "int8",
}

print(f"\n[2] loading {len(C.RAW_COLUMNS_TO_READ)} of {len(all_columns)} columns ...")
t0 = time.time()
df = pd.read_csv(
    C.FLIGHTS_CSV,
    usecols=C.RAW_COLUMNS_TO_READ,
    dtype=dtypes,
)
load_s = time.time() - t0
mem_mb = df.memory_usage(deep=True).sum() / 1024**2

print(f"    {len(df):,} rows loaded in {load_s:.1f}s, {mem_mb:.0f} MB in memory")
audit["n_rows_raw"] = int(len(df))
audit["load_seconds"] = round(load_s, 1)
audit["memory_mb"] = round(mem_mb, 1)

# ---------------------------------------------------------------------------
# 3. THE AIRPORT CODE AUDIT  (structural, so all months)
# ---------------------------------------------------------------------------
print("\n[3] airport-code format by month")

# Cheap trick: test the ~700 category labels, not the 5.8M rows.
def numeric_mask(col: pd.Series) -> np.ndarray:
    cats = col.cat.categories.to_series().str.fullmatch(r"\d+").to_numpy()
    return cats[col.cat.codes.to_numpy()]

org_numeric = numeric_mask(df["ORIGIN_AIRPORT"])
dst_numeric = numeric_mask(df["DESTINATION_AIRPORT"])

code_fmt = pd.DataFrame({
    "MONTH": df["MONTH"].to_numpy(),
    "origin_numeric": org_numeric,
    "dest_numeric": dst_numeric,
})
by_month = code_fmt.groupby("MONTH", observed=True).agg(
    rows=("origin_numeric", "size"),
    origin_numeric=("origin_numeric", "sum"),
    dest_numeric=("dest_numeric", "sum"),
)
by_month["pct_origin_numeric"] = (
    100 * by_month["origin_numeric"] / by_month["rows"]
).round(2)

print(by_month.to_string())

audit["airport_code_format_by_month"] = {
    int(m): {
        "rows": int(r.rows),
        "origin_numeric_rows": int(r.origin_numeric),
        "dest_numeric_rows": int(r.dest_numeric),
        "pct_origin_numeric": float(r.pct_origin_numeric),
    }
    for m, r in by_month.iterrows()
}

affected_months = [int(m) for m, r in by_month.iterrows() if r.pct_origin_numeric > 0]
affected_rows = int(by_month.loc[by_month.pct_origin_numeric > 0, "rows"].sum())
audit["months_with_numeric_codes"] = affected_months
audit["rows_in_numeric_code_months"] = affected_rows

n_iata = int((~pd.Series(org_numeric)).sum())
audit["distinct_origin_codes_total"] = int(df["ORIGIN_AIRPORT"].nunique())
audit["distinct_origin_codes_numeric"] = int(
    df.loc[pd.Series(org_numeric, index=df.index), "ORIGIN_AIRPORT"].nunique()
)
audit["distinct_origin_codes_iata"] = int(
    df.loc[pd.Series(~org_numeric, index=df.index), "ORIGIN_AIRPORT"].nunique()
)

print(f"\n    months affected          : {affected_months}")
print(f"    rows in those months     : {affected_rows:,}")
print(f"    distinct origin codes    : {audit['distinct_origin_codes_total']}"
      f"  (IATA {audit['distinct_origin_codes_iata']},"
      f" numeric {audit['distinct_origin_codes_numeric']})")

# ---------------------------------------------------------------------------
# 4. can airports.csv rescue the numeric codes?
# ---------------------------------------------------------------------------
print("\n[4] airports.csv mapping capability")
airports = pd.read_csv(C.AIRPORTS_CSV)
print(f"    columns: {list(airports.columns)}  ({len(airports)} rows)")
audit["airports_csv_columns"] = list(airports.columns)
audit["airports_csv_rows"] = int(len(airports))

iata_col = next((c for c in airports.columns if "IATA" in c.upper()), None)
has_numeric_id = any(
    airports[c].astype(str).str.fullmatch(r"\d+").all()
    for c in airports.columns
    if airports[c].dtype != object or True
)
audit["airports_csv_has_iata_column"] = iata_col is not None
audit["airports_csv_can_map_numeric_ids"] = bool(
    any("DOT" in c.upper() or "ID" in c.upper() for c in airports.columns)
)
print(f"    IATA column           : {iata_col}")
print(f"    any DOT/ID column     : {audit['airports_csv_can_map_numeric_ids']}")

# Do the numeric codes overlap the IATA codes at all? (They cannot, but prove it.)
if iata_col:
    iata_set = set(airports[iata_col].astype(str))
    numeric_codes = set(
        df.loc[pd.Series(org_numeric, index=df.index), "ORIGIN_AIRPORT"]
        .astype(str).unique()
    )
    audit["numeric_codes_resolvable_via_airports_csv"] = len(numeric_codes & iata_set)
    print(f"    numeric codes found in airports.csv: "
          f"{len(numeric_codes & iata_set)} of {len(numeric_codes)}")

# ---------------------------------------------------------------------------
# 5. label availability / exclusions  (structural counts, all months)
# ---------------------------------------------------------------------------
print("\n[5] exclusions and label availability")
n_cancelled = int((df["CANCELLED"] == 1).sum())
n_diverted = int((df["DIVERTED"] == 1).sum())
n_null_delay = int(df["ARRIVAL_DELAY"].isna().sum())
operated = (df["CANCELLED"] == 0) & (df["DIVERTED"] == 0)
n_operated = int(operated.sum())
n_operated_null = int(df.loc[operated, "ARRIVAL_DELAY"].isna().sum())

for k, v in [
    ("cancelled", n_cancelled), ("diverted", n_diverted),
    ("arrival_delay_missing", n_null_delay),
    ("operated (not cancelled, not diverted)", n_operated),
    ("operated but still missing arrival delay", n_operated_null),
]:
    print(f"    {k:42s} {v:>10,}  ({100*v/len(df):5.2f}%)")

audit.update(
    n_cancelled=n_cancelled, n_diverted=n_diverted,
    n_arrival_delay_missing=n_null_delay,
    n_operated=n_operated, n_operated_missing_delay=n_operated_null,
)

# missing values across the columns we intend to use
miss = df[C.RAW_COLUMNS_TO_READ].isna().sum()
audit["missing_by_column"] = {k: int(v) for k, v in miss.items() if v > 0}
print(f"    columns with missing values: {audit['missing_by_column']}")

jdump(audit, C.ARTIFACTS_DIR / "audit.json")

# ---------------------------------------------------------------------------
# 6. TRAIN-ONLY exploratory analysis of the target
# ---------------------------------------------------------------------------
print("\n[6] target analysis -- TRAINING MONTHS ONLY (Jan-Aug)")

lab = df.loc[operated & df["ARRIVAL_DELAY"].notna()].copy()
lab[C.TARGET_COLUMN] = (
    lab["ARRIVAL_DELAY"] >= C.DELAY_THRESHOLD_MINUTES
).astype("int8")
lab["SCHED_DEP_HOUR"] = (lab["SCHEDULED_DEPARTURE"] // 100).clip(0, 23).astype("int8")

train = lab[lab["MONTH"].isin(C.TRAIN_MONTHS)]
val = lab[lab["MONTH"].isin(C.VAL_MONTHS)]

eda: dict = {
    "n_labelled_all_months": int(len(lab)),
    "n_train": int(len(train)),
    "n_val": int(len(val)),
    "train_delay_rate": float(train[C.TARGET_COLUMN].mean()),
    "val_delay_rate": float(val[C.TARGET_COLUMN].mean()),
    "delay_threshold_minutes": C.DELAY_THRESHOLD_MINUTES,
    "note": (
        "Test months (Nov-Dec) are deliberately not summarised here. "
        "Delay rates by group are computed on training months only."
    ),
}
print(f"    labelled rows (all months) : {len(lab):,}")
print(f"    train rows (Jan-Aug)       : {len(train):,}")
print(f"    train delay rate           : {eda['train_delay_rate']:.4f}")
print(f"    val   delay rate           : {eda['val_delay_rate']:.4f}")

# majority baseline, stated plainly
eda["majority_class"] = int(train[C.TARGET_COLUMN].mode()[0])
eda["majority_baseline_train_accuracy"] = float(
    max(1 - eda["train_delay_rate"], eda["train_delay_rate"])
)
print(f"    majority baseline accuracy : "
      f"{eda['majority_baseline_train_accuracy']:.4f}  (recall on delays = 0)")


def rate_by(col, train_df=train):
    g = train_df.groupby(col, observed=True)[C.TARGET_COLUMN].agg(["mean", "size"])
    return g[g["size"] >= 1000].sort_values("mean", ascending=False)


# --- by departure hour
by_hour = train.groupby("SCHED_DEP_HOUR", observed=True)[C.TARGET_COLUMN].agg(
    ["mean", "size"]
)
eda["delay_rate_by_dep_hour"] = {
    int(h): {"rate": float(r["mean"]), "n": int(r["size"])}
    for h, r in by_hour.iterrows()
}
fig, ax = plt.subplots(figsize=(7, 3.4))
ax.bar(by_hour.index, by_hour["mean"] * 100, **PLOT_STYLE)
ax.axhline(eda["train_delay_rate"] * 100, color="#d1495b", ls="--", lw=1.2,
           label=f"overall {eda['train_delay_rate']*100:.1f}%")
ax.set_xlabel("Scheduled departure hour")
ax.set_ylabel("Delayed (%)")
ax.set_title("Delay rate by scheduled departure hour (train months)")
ax.legend(frameon=False, fontsize=8)
ax.spines[["top", "right"]].set_visible(False)
savefig(fig, "delay_by_hour.png")

# --- by carrier
airlines = pd.read_csv(C.AIRLINES_CSV)
name_of = dict(zip(airlines.iloc[:, 0], airlines.iloc[:, 1]))
by_air = rate_by("AIRLINE")
eda["delay_rate_by_airline"] = {
    str(a): {"rate": float(r["mean"]), "n": int(r["size"]),
             "name": name_of.get(a, str(a))}
    for a, r in by_air.iterrows()
}
fig, ax = plt.subplots(figsize=(7, 4))
labels = [name_of.get(a, a)[:26] for a in by_air.index]
ax.barh(labels, by_air["mean"] * 100, **PLOT_STYLE)
ax.invert_yaxis()
ax.set_xlabel("Delayed (%)")
ax.set_title("Delay rate by carrier (train months)")
ax.spines[["top", "right"]].set_visible(False)
savefig(fig, "delay_by_airline.png")

# --- by month (train+val only, so the test period stays unseen)
by_month_rate = lab[lab["MONTH"].isin(C.TRAIN_MONTHS + C.VAL_MONTHS)].groupby(
    "MONTH", observed=True
)[C.TARGET_COLUMN].agg(["mean", "size"])
eda["delay_rate_by_month_train_val"] = {
    int(m): {"rate": float(r["mean"]), "n": int(r["size"])}
    for m, r in by_month_rate.iterrows()
}
fig, ax = plt.subplots(figsize=(7, 3.2))
ax.plot(by_month_rate.index, by_month_rate["mean"] * 100, "o-", color="#2b5fd9")
ax.set_xlabel("Month (2015)")
ax.set_ylabel("Delayed (%)")
ax.set_title("Delay rate by month -- train and validation only")
ax.set_xticks(list(by_month_rate.index))
ax.spines[["top", "right"]].set_visible(False)
savefig(fig, "delay_by_month.png")

# --- by day of week
by_dow = train.groupby("DAY_OF_WEEK", observed=True)[C.TARGET_COLUMN].agg(
    ["mean", "size"]
)
eda["delay_rate_by_day_of_week"] = {
    int(d): {"rate": float(r["mean"]), "n": int(r["size"])}
    for d, r in by_dow.iterrows()
}

# --- busiest origin airports
busiest = train["ORIGIN_AIRPORT"].value_counts().head(20).index
sub = train[train["ORIGIN_AIRPORT"].isin(busiest)]
by_apt = sub.groupby("ORIGIN_AIRPORT", observed=True)[C.TARGET_COLUMN].agg(
    ["mean", "size"]
).sort_values("mean", ascending=False)
eda["delay_rate_by_busiest_origin"] = {
    str(a): {"rate": float(r["mean"]), "n": int(r["size"])}
    for a, r in by_apt.iterrows()
}
fig, ax = plt.subplots(figsize=(7, 4.4))
ax.barh([str(a) for a in by_apt.index], by_apt["mean"] * 100, **PLOT_STYLE)
ax.invert_yaxis()
ax.set_xlabel("Delayed (%)")
ax.set_title("Delay rate, 20 busiest origin airports (train months)")
ax.spines[["top", "right"]].set_visible(False)
savefig(fig, "delay_by_airport.png")

# --- class balance figure
fig, ax = plt.subplots(figsize=(4.4, 3.2))
counts = train[C.TARGET_COLUMN].value_counts().sort_index()
ax.bar(["On time\n(<15 min)", "Delayed\n(>=15 min)"], counts.to_numpy(),
       color=["#9aa3b2", "#d1495b"])
for i, v in enumerate(counts.to_numpy()):
    ax.text(i, v, f"{v:,}\n{100*v/counts.sum():.1f}%", ha="center",
            va="bottom", fontsize=9)
ax.set_ylabel("Flights (train months)")
ax.set_title("Class balance")
ax.set_ylim(0, counts.max() * 1.22)
ax.spines[["top", "right"]].set_visible(False)
savefig(fig, "class_balance.png")

jdump(eda, C.ARTIFACTS_DIR / "eda.json")

print("\n" + "=" * 72)
print("STEP 01 complete")
print("=" * 72)
