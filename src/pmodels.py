"""
Shared model definitions.

p3 (selection), p4 (retraining) and p5 (evaluation) must build a model the
same way, or the thing being evaluated is not the thing that was chosen. All
three import from here so there is one definition of each pipeline.
"""

from __future__ import annotations

import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import (
    FunctionTransformer, OneHotEncoder, OrdinalEncoder, StandardScaler,
)

import pconfig as P


# ---------------------------------------------------------------------------
# feature groups
# ---------------------------------------------------------------------------
def split_features(features: list[str]) -> tuple[list[str], list[str], list[str], list[str]]:
    """Return (categorical, numeric, hour columns, plain numeric)."""
    cats = [f for f in features if f in P.CATEGORICAL]
    nums = [f for f in features if f not in P.CATEGORICAL]
    hours = [f for f in nums if f.endswith("_HOUR")]
    plain = [f for f in nums if not f.endswith("_HOUR")]
    return cats, nums, hours, plain


# ---------------------------------------------------------------------------
# the clock is circular
# ---------------------------------------------------------------------------
def cyclic(A):
    """Map an hour in [0, 24) onto a circle.

    Encoding 23:00 as the number 23 puts it 23 units away from 00:00, when the
    two are an hour apart. A sine and a cosine column put them next to each
    other, which is what a linear model needs to treat late night and early
    morning as neighbours.
    """
    A = np.asarray(A, dtype=np.float64)
    rad = 2.0 * np.pi * A / 24.0
    return np.hstack([np.sin(rad), np.cos(rad)])


def cyclic_names(_, input_features):
    """Names in the order `cyclic` emits them: all sines, then all cosines.

    Naming them pairwise instead would mislabel every exported coefficient,
    which is a silent error -- the model would still fit, and the website would
    show the wrong number next to the wrong feature.
    """
    return np.asarray(
        [f"{f}_sin" for f in input_features] + [f"{f}_cos" for f in input_features],
        dtype=object,
    )


# ---------------------------------------------------------------------------
# preprocessing
# ---------------------------------------------------------------------------
def linear_prep(features: list[str], min_frequency: int = 500) -> ColumnTransformer:
    """For logistic regression: indicator columns, circular hours, scaled numbers.

    `min_frequency` folds airports with fewer than that many training flights
    into one bucket. With two airport columns and a few hundred airports, this
    keeps the design matrix small and stops the model fitting noise on airports
    that appear a handful of times.
    """
    cats, _, hours, plain = split_features(features)
    return ColumnTransformer(
        [
            ("cat", OneHotEncoder(handle_unknown="infrequent_if_exist",
                                  min_frequency=min_frequency, sparse_output=True,
                                  dtype=np.float32), cats),
            ("hour", FunctionTransformer(cyclic, feature_names_out=cyclic_names,
                                         validate=False), hours),
            ("num", StandardScaler(), plain),
        ],
        remainder="drop",
        sparse_threshold=0.3,
    )


def tree_prep(features: list[str], max_categories: int = 250) -> ColumnTransformer:
    """For the tree models: integer codes.

    A tree splits on order, so the particular integer a category gets does not
    matter. `max_categories` caps each column at 250 levels for two reasons:
    the boosting implementation supports at most 255 native categories, and the
    airports being folded together are the quietest ones, where there are too
    few flights to estimate a rate from anyway. Categories unseen at prediction
    time map to -1.
    """
    cats, nums, _, _ = split_features(features)
    return ColumnTransformer(
        [
            ("cat", OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1,
                                   encoded_missing_value=-1,
                                   max_categories=max_categories,
                                   dtype=np.float32), cats),
            ("num", "passthrough", nums),
        ],
        remainder="drop",
    )


# ---------------------------------------------------------------------------
# the four methods
# ---------------------------------------------------------------------------
def build(model: str, settings: dict, features: list[str]) -> Pipeline:
    """One pipeline per (model, settings) pair.

    Settings missing from `settings` fall back to the defaults below, so a
    config saved by an earlier run stays loadable.
    """
    cats, _, _, _ = split_features(features)
    cat_idx = list(range(len(cats)))

    if model == "logistic_regression":
        return Pipeline([
            ("prep", linear_prep(features)),
            ("clf", LogisticRegression(
                C=settings.get("C", 1.0),
                class_weight=settings.get("class_weight", None),
                max_iter=settings.get("max_iter", 300),
                solver="lbfgs",
                random_state=P.SEED,
            )),
        ])

    if model == "random_forest":
        return Pipeline([
            ("prep", tree_prep(features)),
            ("clf", RandomForestClassifier(
                n_estimators=settings.get("n_estimators", 80),
                max_depth=settings.get("max_depth", 20),
                min_samples_leaf=settings.get("min_samples_leaf", 50),
                class_weight=settings.get("class_weight", None),
                n_jobs=-1,
                random_state=P.SEED,
            )),
        ])

    if model == "gradient_boosting":
        return Pipeline([
            ("prep", tree_prep(features)),
            ("clf", HistGradientBoostingClassifier(
                learning_rate=settings.get("learning_rate", 0.05),
                max_leaf_nodes=settings.get("max_leaf_nodes", 31),
                max_iter=settings.get("max_iter", 200),
                l2_regularization=settings.get("l2", 1.0),
                categorical_features=cat_idx,
                class_weight=settings.get("class_weight", None),
                early_stopping=False,
                random_state=P.SEED,
            )),
        ])

    raise ValueError(f"unknown model: {model}")


# ---------------------------------------------------------------------------
# metrics used in more than one step
# ---------------------------------------------------------------------------
def confusion_at(y_true: np.ndarray, scores: np.ndarray, threshold: float) -> dict:
    pred = (scores >= threshold).astype(np.int8)
    tp = int(((pred == 1) & (y_true == 1)).sum())
    fp = int(((pred == 1) & (y_true == 0)).sum())
    fn = int(((pred == 0) & (y_true == 1)).sum())
    tn = int(((pred == 0) & (y_true == 0)).sum())
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    balance = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "confusion": {"tp": tp, "fp": fp, "fn": fn, "tn": tn},
        "precision": float(precision),
        "recall": float(recall),
        "balance": float(balance),
        "accuracy": float((tp + tn) / len(y_true)),
    }


def day_groups(df) -> np.ndarray:
    """A group id per calendar day, so folds and splits can keep days whole."""
    return (df["MONTH"].astype(int) * 100 + df["DAY"].astype(int)).to_numpy()
