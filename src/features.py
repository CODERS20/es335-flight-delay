"""
Shared preprocessing. Every transformer here is fitted on TRAINING rows only
and then applied unchanged to validation and test.

Two preprocessors, because linear and tree models want different input:

  build_linear_preprocessor()
      one-hot for the categoricals, cyclic sine/cosine for the clock hours
      (so 23:00 sits next to 00:00 rather than 23 units away), and
      standardisation for the remaining numerics, which logistic regression
      needs for its optimiser and for comparable coefficients.

  build_tree_preprocessor()
      integer codes for the categoricals and raw numerics. Trees split on
      order, so they neither need one-hot nor scaling, and integer codes keep
      the matrix small enough to fit in memory.

Unseen categories (an airport in validation that never appears in training)
are handled explicitly rather than crashing: one-hot emits an all-zero row,
and the ordinal encoder emits -1.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, OrdinalEncoder, StandardScaler

import config as C

# Clock hours get cyclic treatment; the rest are ordinary numerics.
CYCLIC_HOURS = ["SCHED_DEP_HOUR", "SCHED_ARR_HOUR"]
PLAIN_NUMERIC = ["SCHEDULED_TIME", "DISTANCE", "MONTH", "DAY", "DAY_OF_WEEK", "IS_WEEKEND"]


def _cyclic(X):
    """Map an hour in [0, 24) to its position on a circle."""
    X = np.asarray(X, dtype=np.float64)
    radians = 2.0 * np.pi * X / 24.0
    return np.hstack([np.sin(radians), np.cos(radians)])


def _cyclic_names(_, input_features):
    """Names in the order `_cyclic` actually emits them.

    `_cyclic` returns hstack([sin(all columns), cos(all columns)]), so every
    sine column comes before any cosine column. Naming them pairwise would
    silently mislabel the fitted coefficients.
    """
    sines = [f"{f}_sin" for f in input_features]
    cosines = [f"{f}_cos" for f in input_features]
    return np.asarray(sines + cosines, dtype=object)


def build_linear_preprocessor(min_frequency: int = 500) -> ColumnTransformer:
    """Preprocessor for logistic regression.

    `min_frequency` folds airports seen fewer than that many times in training
    into a single 'infrequent' bucket. With 322 airports and two airport
    columns, this keeps the design matrix to a few hundred columns and stops
    the model fitting noise on airports with a handful of flights.
    """
    return ColumnTransformer(
        transformers=[
            (
                "cat",
                OneHotEncoder(
                    handle_unknown="infrequent_if_exist",
                    min_frequency=min_frequency,
                    sparse_output=True,
                    dtype=np.float32,
                ),
                C.CATEGORICAL_FEATURES,
            ),
            (
                "hour",
                FunctionTransformer(
                    _cyclic,
                    feature_names_out=_cyclic_names,
                    validate=False,
                ),
                CYCLIC_HOURS,
            ),
            ("num", StandardScaler(), PLAIN_NUMERIC),
        ],
        remainder="drop",
        sparse_threshold=0.3,
    )


def build_tree_preprocessor(max_categories: int = 250) -> ColumnTransformer:
    """Preprocessor for random forest and gradient boosting.

    `max_categories` keeps only the most frequent levels of each categorical
    column and folds the remainder into a single 'infrequent' level. Two
    reasons, one practical and one statistical:

      * HistGradientBoostingClassifier supports at most 255 native categories
        per feature, and the data has 322 airports;
      * the airports being folded away are the quietest ones, where there are
        too few flights to estimate a delay rate reliably anyway.

    Unseen categories at prediction time map to -1, which the gradient-boosting
    implementation treats as missing.
    """
    return ColumnTransformer(
        transformers=[
            (
                "cat",
                OrdinalEncoder(
                    handle_unknown="use_encoded_value",
                    unknown_value=-1,
                    encoded_missing_value=-1,
                    max_categories=max_categories,
                    dtype=np.float32,
                ),
                C.CATEGORICAL_FEATURES,
            ),
            ("num", "passthrough", CYCLIC_HOURS + PLAIN_NUMERIC),
        ],
        remainder="drop",
    )


# Column positions of the categoricals after build_tree_preprocessor, which
# HistGradientBoostingClassifier needs in order to treat them as categories
# rather than as ordered numbers.
TREE_CATEGORICAL_INDICES = list(range(len(C.CATEGORICAL_FEATURES)))


def load_split(name: str) -> tuple[pd.DataFrame, pd.Series]:
    """Load a saved split and return (features, target), leakage-checked."""
    path = C.PROCESSED_DIR / f"{name}.parquet"
    df = pd.read_parquet(path)
    y = df[C.TARGET_COLUMN].astype("int8")
    X = df[C.ALLOWED_FEATURES]
    C.assert_no_leakage(X.columns)
    return X, y
