"""
Single source of truth for the ES 335 flight-delay project.

Every notebook and module imports its paths, column rules, split definition and
seed from here. Nothing is hard-coded anywhere else. If a choice is worth
defending in the viva, it is written down in this file with a reason.
"""

from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
# The raw dataset deliberately lives OUTSIDE the repository, one level up, so
# that a 592 MB CSV can never be added to git even by accident.
#
#   ES 335 Project/
#   |-- Dataset/              <-- raw data (NOT in git)
#   `-- es335-flight-delay/   <-- this repository
#
REPO_ROOT = Path(__file__).resolve().parents[1]
DATASET_DIR = REPO_ROOT.parent / "Dataset"

FLIGHTS_CSV = DATASET_DIR / "flights.csv"
AIRLINES_CSV = DATASET_DIR / "airlines.csv"
AIRPORTS_CSV = DATASET_DIR / "airports.csv"

PROCESSED_DIR = REPO_ROOT / "data" / "processed"
ARTIFACTS_DIR = REPO_ROOT / "artifacts"
FIGURES_DIR = ARTIFACTS_DIR / "figures"
DOCS_DIR = REPO_ROOT / "docs"
DOCS_DATA_DIR = DOCS_DIR / "data"

# ---------------------------------------------------------------------------
# Reproducibility
# ---------------------------------------------------------------------------
SEED = 42

# ---------------------------------------------------------------------------
# Target definition
# ---------------------------------------------------------------------------
# US Bureau of Transportation Statistics counts a flight as "on time" if it
# arrives less than 15 minutes after its scheduled arrival. We therefore
# predict the complement: ARRIVAL_DELAY >= 15 minutes.
TARGET_SOURCE_COLUMN = "ARRIVAL_DELAY"   # used ONLY to build the label
TARGET_COLUMN = "IS_DELAYED"
DELAY_THRESHOLD_MINUTES = 15

# Cancelled and diverted flights have no recorded arrival delay, so they cannot
# be labelled and are excluded. This narrows every claim we make to "flights
# that actually operated" -- stated explicitly on the website.
EXCLUDE_CANCELLED = True
EXCLUDE_DIVERTED = True

# ---------------------------------------------------------------------------
# Feature allow-list  (leakage control)
# ---------------------------------------------------------------------------
# An ALLOW-list, not a drop-list: a column is unusable unless it is named here,
# so a leaky field cannot slip in by default when the schema changes.
# Everything below is known at scheduling time, before the aircraft moves.

CATEGORICAL_FEATURES = [
    "AIRLINE",              # operating carrier (14 values)
    "ORIGIN_AIRPORT",       # scheduled departure airport
    "DESTINATION_AIRPORT",  # scheduled arrival airport
]

NUMERIC_FEATURES = [
    "SCHED_DEP_HOUR",   # derived from SCHEDULED_DEPARTURE (hhmm -> hour)
    "SCHED_ARR_HOUR",   # derived from SCHEDULED_ARRIVAL   (hhmm -> hour)
    "SCHEDULED_TIME",   # planned gate-to-gate duration, published in advance
    "DISTANCE",         # great-circle distance, fixed by the route
    "MONTH",
    "DAY",
    "DAY_OF_WEEK",
]

CALENDAR_FLAG_FEATURES = [
    "IS_WEEKEND",   # DAY_OF_WEEK in {6, 7}
]

ALLOWED_FEATURES = CATEGORICAL_FEATURES + NUMERIC_FEATURES + CALENDAR_FLAG_FEATURES

# Columns that exist in flights.csv but are FORBIDDEN as inputs, because they
# are only known during or after the flight. Using any of them would leak the
# future into the model and inflate every score.
FORBIDDEN_FEATURES = [
    "DEPARTURE_TIME",       # actual pushback
    "DEPARTURE_DELAY",      # actual departure delay
    "TAXI_OUT",
    "WHEELS_OFF",
    "WHEELS_ON",
    "TAXI_IN",
    "AIR_TIME",
    "ELAPSED_TIME",
    "ARRIVAL_TIME",         # actual arrival
    "ARRIVAL_DELAY",        # this IS the target
    "AIR_SYSTEM_DELAY",     # the five cause-breakdown columns are assigned
    "SECURITY_DELAY",       # after the fact, by the airline
    "AIRLINE_DELAY",
    "LATE_AIRCRAFT_DELAY",
    "WEATHER_DELAY",
    "CANCELLATION_REASON",  # only exists once a flight is cancelled
    "DIVERTED",             # outcome, not a schedule attribute
    "CANCELLED",            # outcome, not a schedule attribute
]

# Raw columns we need to READ from the CSV: the allow-listed raw fields, the
# fields the derived features come from, the label source, and the two
# exclusion flags. Nothing else is loaded into memory.
RAW_COLUMNS_TO_READ = [
    "MONTH", "DAY", "DAY_OF_WEEK",
    "AIRLINE", "ORIGIN_AIRPORT", "DESTINATION_AIRPORT",
    "SCHEDULED_DEPARTURE", "SCHEDULED_ARRIVAL", "SCHEDULED_TIME", "DISTANCE",
    "ARRIVAL_DELAY",          # label source only -- dropped before training
    "CANCELLED", "DIVERTED",  # exclusion flags only -- dropped before training
]

# ---------------------------------------------------------------------------
# Chronological split  (2015 only -- the dataset is a single year)
# ---------------------------------------------------------------------------
# A random shuffle would let a model learn from flights that happen after the
# ones it is scored on. Splitting by calendar month mirrors the real task:
# train on the past, predict a future period.
TRAIN_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8]   # January - August
VAL_MONTHS = [9, 10]                      # September - October, as proposed
TEST_MONTHS = [11, 12]                    # November - December

# DEVIATION FROM THE PROPOSAL, forced by a data-quality defect.
#
# Step 01 established from the data that October 2015 stores airport codes as
# numeric DOT ids (486,165 rows, 100% of the month) while every other month
# uses IATA letter codes, and that airports.csv contains only an IATA_CODE
# column -- so 0 of the 306 numeric codes can be mapped back.
#
# Including October would put 306 airport categories into the validation set
# that never appear in training, corrupting the set we tune on. We therefore
# validate on September alone. The test months are unaffected (0% numeric).
OCTOBER_EXCLUDED = True
VAL_MONTHS_EFFECTIVE = [9]                # September only

# ---------------------------------------------------------------------------
# Model selection rule
# ---------------------------------------------------------------------------
# Hyperparameters AND the decision threshold are chosen on VALIDATION only.
# The test months are scored exactly once, at the end of the project.
THRESHOLD_RULE = "max_f1_on_validation"

# Headline metric. The positive class is the minority, so PR-AUC reflects
# performance on delayed flights far better than ROC-AUC or accuracy.
PRIMARY_METRIC = "average_precision"   # scikit-learn's name for PR-AUC
N_BOOTSTRAP = 200                      # test-set confidence intervals

# ---------------------------------------------------------------------------
# Model roster  (exactly the methods named in our approved proposal)
# ---------------------------------------------------------------------------
MODELS = [
    "majority_baseline",    # always predicts the most common class
    "logistic_regression",  # class-weighted, interpretable linear reference
    "random_forest",
    "gradient_boosting",
]


def assert_no_leakage(columns) -> None:
    """Raise if any forbidden column reaches a model matrix.

    Called before every fit as a hard stop, so leakage fails loudly instead of
    quietly producing an impressive-looking score.
    """
    found = sorted(set(columns) & set(FORBIDDEN_FEATURES))
    if found:
        raise ValueError(
            f"LEAKAGE: forbidden column(s) present in model input: {found}. "
            "These are only known during/after the flight."
        )


if __name__ == "__main__":
    print("Repo root      :", REPO_ROOT)
    print("Dataset dir    :", DATASET_DIR)
    print("  exists?      :", DATASET_DIR.exists())
    for p in (FLIGHTS_CSV, AIRLINES_CSV, AIRPORTS_CSV):
        print(f"  {p.name:15s} exists? {p.exists()}")
    print("Seed           :", SEED)
    print("Allowed feats  :", len(ALLOWED_FEATURES))
    print("Forbidden feats:", len(FORBIDDEN_FEATURES))
    print("Split          :", TRAIN_MONTHS, VAL_MONTHS, TEST_MONTHS)
