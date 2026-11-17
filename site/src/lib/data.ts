/** Every number on this site is read from a JSON file that the pipeline in
 *  src/ wrote. Nothing is typed in by hand, and a missing file shows as a
 *  "not generated yet" panel rather than as invented content. */

export interface P1Dataset {
  rows_raw: number;
  rows_clean: number;
  cleaning_log: { step: string; rows_removed: number; rows_left: number; reason: string }[];
  airport_code_format_by_month: Record<string, { rows: number; pct_numeric_codes: number }>;
  months_excluded: number[];
  target: { column: string; rule: string; delay_rate_overall: number };
  delay_rate_by_month: Record<string, number>;
  rows_by_month: Record<string, number>;
  scheduled_time_median_train: number;
  scheduled_time_missing: number;
  identical_feature_rows: number;
  correlations: Record<string, number>;
  dropped_features: Record<string, string>;
  final_features: string[];
  categorical_features: string[];
  numeric_features: string[];
  forbidden_features: string[];
  csv_size_mb: number;
}

export interface P2Split {
  design: string;
  why_whole_days: string;
  why_every_month: string;
  seed: number;
  test_days_by_month: Record<string, number[]>;
  days_by_month: Record<string, number>;
  train_rows: number;
  test_rows: number;
  train_delay_rate: number;
  test_delay_rate: number;
  per_month: {
    month: number; train_rows: number; test_rows: number;
    train_delay_rate: number; test_delay_rate: number;
  }[];
  unseen_categories_in_test: Record<string, number>;
  secondary_check: { train_months: number[]; test_months: number[]; purpose: string };
}

export interface CvResult {
  model: string;
  settings: Record<string, unknown>;
  fold_scores: number[];
  fold_ratios?: number[];
  fold_seconds?: number[];
  mean_score: number;
  std_score: number;
  mean_ratio_to_base: number;
  oof_roc_auc?: number;
  fit_seconds: number;
}

export interface P3Selection {
  procedure: string;
  why_grouped: string;
  test_read: boolean;
  rows_used: number;
  rows_available: number;
  features: string[];
  base_rate: number;
  n_candidates: number;
  n_fits: number;
  folds: {
    fold: number; fit_rows: number; validate_rows: number;
    fit_days: number; validate_days: number; validate_base_rate: number;
    validate_months?: number[]; validate_day_list?: number[];
  }[];
  results: CvResult[];
  best: CvResult;
  threshold: {
    value: number; rule: string; precision: number; recall: number;
    balance: number; chosen_on: string;
  };
  threshold_sweep: {
    t: number; tp: number; fp: number; fn: number; tn: number;
    precision: number; recall: number; balance: number; accuracy: number;
  }[];
  why_small_grid?: string;
  spread_between_candidates?: number;
  gap_to_baseline?: number;
  winner_by_fold?: {
    fold: number; validate_rows: number; validate_days: number;
    validate_months: number[]; base_rate: number; curve_area: number;
    ratio_to_base: number; seconds: number;
    confusion: { tp: number; fp: number; fn: number; tn: number };
    precision: number; recall: number; balance: number; accuracy: number;
  }[];
  oof_calibration?: { bin: string; mean_predicted: number; observed_rate: number; n: number }[];
}

export interface P4Model {
  chosen_model: string;
  settings: Record<string, unknown>;
  trained_on_rows: number;
  trained_on_days: number;
  features: string[];
  importance: { feature: string; drop_in_score: number; std: number }[];
  importance_note: string;
  browser_model: {
    kind: string;
    intercept: number;
    categorical: Record<string, Record<string, number>>;
    cyclic_hours: Record<string, { sin: number; cos: number }>;
    numeric: Record<string, { coef: number; mean: number; scale: number }>;
    infrequent_level: string;
    verified_max_abs_error: number;
    note: string;
  };
}

export interface P5Results {
  evaluated_once: boolean;
  test_rows: number;
  test_delay_rate: number;
  threshold: number;
  chosen_model: string;
  n_resamples: number;
  results: Record<string, {
    pr_curve_area: number;
    pr_curve_area_range?: [number, number];
    ratio_to_base_rate: number;
    roc_curve_area: number;
    precision: number;
    recall: number;
    balance: number;
    accuracy: number;
    mean_squared_error: number;
    confusion: { tp: number; fp: number; fn: number; tn: number };
  }>;
  pr_curve: Record<string, { recall: number; precision: number }[]>;
  calibration: { bin: string; mean_predicted: number; observed_rate: number; n: number }[];
  slices: {
    by: string;
    rows: { group: string; n: number; actual_rate: number; recall: number; precision: number }[];
  }[];
  examples: { kind: string; rows: Record<string, string | number | boolean>[] }[];
  secondary_check: {
    design: string;
    train_months: number[];
    test_months: number[];
    pr_curve_area: number;
    ratio_to_base_rate: number;
    base_rate: number;
    reading: string;
  } | null;
  cv_to_test: { stage: string; score: number; base_rate: number; ratio: number }[];
}

export interface Options {
  airlines: { code: string; name: string; n_train: number }[];
  airports: { code: string; city: string; n_train: number }[];
  routes: Record<string, Record<string, [number, number]>>;
  defaults: Record<string, number>;
  note: string;
}

const BASE = import.meta.env.BASE_URL;

export async function loadJSON<T>(name: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}data/${name}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
