"""
Single source of truth for the flight-delay pipeline.

Every script imports its paths, column rules, split and seed from here, so no
decision is written down twice. If a choice needs defending in a viva, the
reason is in this file next to the choice.

    p1_build_dataset.py   raw csv      -> one clean csv
    p2_split.py           clean csv    -> train csv + test csv
    p3_select.py          train csv    -> best model + settings (cross-validation)
    p4_retrain.py         train csv    -> final model fitted on all of train
    p5_evaluate.py        test csv     -> the single test evaluation
"""

from pathlib import Path

import numpy as np

# ---------------------------------------------------------------------------
# paths
# ---------------------------------------------------------------------------
# The raw data lives OUTSIDE the repository so a 592 MB csv cannot be committed
# by accident:
#
#   ES 335 Project/
#   |-- Dataset/              <- raw csvs, not in git
#   `-- es335-flight-delay/   <- this repository
#
REPO_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = REPO_ROOT.parent / "Dataset"
FLIGHTS_CSV = RAW_DIR / "flights.csv"
AIRLINES_CSV = RAW_DIR / "airlines.csv"
AIRPORTS_CSV = RAW_DIR / "airports.csv"

DATA_DIR = REPO_ROOT / "data"
CLEAN_CSV = DATA_DIR / "flights_clean.csv"      # written by p1
TRAIN_CSV = DATA_DIR / "train.csv"              # written by p2
TEST_CSV = DATA_DIR / "test.csv"                # written by p2

ART = REPO_ROOT / "artifacts"
MODELS_DIR = ART / "models"
SITE_DATA = REPO_ROOT / "site" / "public" / "data"   # the website reads this

SEED = 42

# ---------------------------------------------------------------------------
# the question
# ---------------------------------------------------------------------------
# The US Bureau of Transportation Statistics counts a flight as on time if it
# arrives less than 15 minutes late, so we predict the complement. The
# threshold is the official one rather than one we invented.
TARGET = "IS_DELAYED"
DELAY_MINUTES = 15

# ---------------------------------------------------------------------------
# features: an allow-list
# ---------------------------------------------------------------------------
# A column is unusable unless it is named here. The opposite -- listing what to
# drop -- is one forgotten column away from leaking.
CATEGORICAL = ["AIRLINE", "ORIGIN_AIRPORT", "DESTINATION_AIRPORT"]

CANDIDATE_FEATURES = [
    "AIRLINE",              # operating carrier
    "ORIGIN_AIRPORT",       # scheduled departure airport
    "DESTINATION_AIRPORT",  # scheduled arrival airport
    "SCHED_DEP_HOUR",       # derived from SCHEDULED_DEPARTURE (hhmm)
    "SCHED_ARR_HOUR",       # derived from SCHEDULED_ARRIVAL   (hhmm)
    "SCHEDULED_TIME",       # planned gate-to-gate duration, published in advance
    "DISTANCE",             # great-circle distance, fixed by the route
    "MONTH",
    "DAY",
    "DAY_OF_WEEK",
    "IS_WEEKEND",           # derived from DAY_OF_WEEK
]

# p1 measures redundancy among the candidates and drops what it finds. Two
# features above this correlation carry the same information, so one of them
# makes the model harder to read without making it better.
CORR_DROP_THRESHOLD = 0.90

# When a pair is redundant, keep the one that is fixed by the route and reads
# more directly. DISTANCE is a property of the city pair; SCHEDULED_TIME is the
# airline's padded estimate of it.
PREFER_KEEP = ["DISTANCE", "DAY_OF_WEEK", "SCHED_DEP_HOUR"]

# Known only during or after the flight. Any of these would leak the outcome.
FORBIDDEN = [
    "DEPARTURE_TIME", "DEPARTURE_DELAY",        # actual pushback
    "TAXI_OUT", "WHEELS_OFF", "WHEELS_ON", "TAXI_IN",
    "AIR_TIME", "ELAPSED_TIME",
    "ARRIVAL_TIME", "ARRIVAL_DELAY",            # ARRIVAL_DELAY *is* the target
    "AIR_SYSTEM_DELAY", "SECURITY_DELAY",       # assigned after the fact
    "AIRLINE_DELAY", "LATE_AIRCRAFT_DELAY", "WEATHER_DELAY",
    "CANCELLATION_REASON", "CANCELLED", "DIVERTED",
]

# ---------------------------------------------------------------------------
# split: whole days held out from every month
# ---------------------------------------------------------------------------
# Splitting single flights at random would leak: a snowstorm on one day would
# have some of its flights in training and the rest in test, so the model would
# learn that day's weather from the training half and get the test half almost
# free. We therefore hold out WHOLE DAYS.
#
# The days are drawn from every month, so every MONTH and DAY value appears on
# both sides of the split. That matters because the alternative -- training on
# Jan-Sep and testing on Nov-Dec -- asks the model to extrapolate: months 11
# and 12 never appear in training, so a tree can only put those flights in a
# branch it never populated, and a linear model extends a straight line past
# the edge of its data.
TEST_FRACTION = 0.20            # of flights, achieved by choosing whole days
SPLIT_UNIT = "calendar day"     # the whole day goes to one side or the other

# A secondary check, reported alongside the main result: fit on the earlier
# months and score the two later ones. This is the forecasting question, and it
# is strictly harder -- the base rate rises from about 13% to 18% and the month
# values are unseen. Reporting both makes clear which question each answers.
CHRONO_TRAIN_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
CHRONO_TEST_MONTHS = [11, 12]

# Fitting every setting on 4.2M rows does not finish on a laptop, so model
# selection uses a seeded sample. The chosen model is refitted on all of train.
CV_SAMPLE_ROWS = 400_000
FINAL_SAMPLE_ROWS = 1_500_000

# ---------------------------------------------------------------------------
# cross-validation
# ---------------------------------------------------------------------------
# 5-fold, GROUPED BY CALENDAR DAY, so a day never straddles two folds for the
# same reason it never straddles the train/test split.
CV_SPLITS = 5
CV_GROUP = "calendar day"

# ---------------------------------------------------------------------------
# how we score
# ---------------------------------------------------------------------------
# Delayed flights are the rare class, so the area under the precision-recall
# curve measures what we care about; a model with no information scores the
# base rate, which makes the baseline row meaningful. Accuracy is reported only
# to show why it misleads here.
METRIC = "average_precision"        # scikit-learn's name for the PR curve area

# The monthly delay rate runs from about 13% to 26%, and the curve area grows
# with the base rate, so folds are compared as a ratio to their own base rate.
SCORE_AS_RATIO_TO_BASE_RATE = True

# The decision threshold is chosen on the cross-validation folds, never on test.
THRESHOLD_RULE = "best precision/recall balance on the cross-validation folds"

N_RESAMPLES = 200                   # for the ranges reported on test



def test_day_map(days_by_month: dict[int, list[int]]) -> dict[int, set[int]]:
    """Choose which calendar days are held out, month by month.

    Whole days, so a day's weather cannot appear on both sides of the split;
    drawn from every month, so every MONTH and DAY value is present in both
    training and test and nothing has to be extrapolated. Seeded, so p1 and p2
    and any later re-run all make exactly the same choice.
    """
    rng = np.random.default_rng(SEED)
    chosen: dict[int, set[int]] = {}
    for month in sorted(days_by_month):
        days = sorted(days_by_month[month])
        k = max(1, round(TEST_FRACTION * len(days)))
        chosen[month] = set(int(d) for d in rng.choice(days, size=k, replace=False))
    return chosen


def assert_no_leakage(columns) -> None:
    """Raise if a forbidden column reaches a model.

    Called before every fit, so leakage fails loudly instead of quietly
    producing an impressive score.
    """
    found = sorted(set(columns) & set(FORBIDDEN))
    if found:
        raise ValueError(
            f"LEAKAGE: {found} are known only during or after the flight and "
            f"must never be model inputs."
        )


if __name__ == "__main__":
    print("repo root     :", REPO_ROOT)
    print("raw data      :", RAW_DIR, "exists?", RAW_DIR.exists())
    for p in (FLIGHTS_CSV, AIRLINES_CSV, AIRPORTS_CSV):
        print(f"  {p.name:15s} exists? {p.exists()}")
    print("clean csv     :", CLEAN_CSV)
    print("seed          :", SEED)
    print("candidates    :", len(CANDIDATE_FEATURES))
    print("forbidden     :", len(FORBIDDEN))
    print("split         :", f"{TEST_FRACTION:.0%} of flights, held out as whole {SPLIT_UNIT}s")
    print("cross-val     :", f"{CV_SPLITS}-fold, grouped by {CV_GROUP}")
    print("secondary     :", f"fit {CHRONO_TRAIN_MONTHS} -> score {CHRONO_TEST_MONTHS}")
