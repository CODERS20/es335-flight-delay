/** Every number on this site is read from a JSON file the pipeline in src/
 *  wrote. Nothing is typed in by hand. */

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
  seed: number;
  test_days_by_month: Record<string, number[]>;
  days_by_month: Record<string, number>;
  train_rows: number;
  test_rows: number;
  train_delay_rate: number;
  test_delay_rate: number;
  per_month: {
    month: number;
    train_rows: number;
    test_rows: number;
    train_delay_rate: number;
    test_delay_rate: number;
  }[];
  unseen_categories_in_test: Record<string, number>;
}

export interface CvResult {
  model: string;
  settings: Record<string, unknown>;
  fold_scores: number[];
  fold_ratios?: number[];
  mean_score: number;
  std_score: number;
  mean_ratio_to_base: number;
  fit_seconds: number;
}

export interface Confusion {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

export interface P3Selection {
  rows_used: number;
  rows_available: number;
  base_rate: number;
  n_candidates: number;
  n_fits: number;
  folds: {
    fold: number;
    fit_rows: number;
    validate_rows: number;
    fit_days: number;
    validate_days: number;
    validate_base_rate: number;
    validate_months: number[];
    validate_day_list: number[];
  }[];
  results: CvResult[];
  best: CvResult;
  spread_between_candidates: number;
  gap_to_baseline: number;
  winner_by_fold: {
    fold: number;
    validate_rows: number;
    validate_days: number;
    validate_months: number[];
    base_rate: number;
    curve_area: number;
    ratio_to_base: number;
    seconds: number;
    confusion: Confusion;
    precision: number;
    recall: number;
    balance: number;
  }[];
  threshold: { value: number; precision: number; recall: number; balance: number };
  threshold_sweep: ({
    t: number;
    precision: number;
    recall: number;
    balance: number;
    accuracy: number;
  } & Confusion)[];
}

export interface BrowserModel {
  kind: string;
  intercept: number;
  categorical: Record<string, Record<string, number>>;
  cyclic_hours: Record<string, { sin: number; cos: number }>;
  numeric: Record<string, { coef: number; mean: number; scale: number }>;
  infrequent_level: string;
  verified_max_abs_error: number;
  note: string;
}

export interface P4Model {
  chosen_model: string;
  settings: Record<string, unknown>;
  trained_on_rows: number;
  trained_on_days: number;
  features: string[];
  threshold: number;
  importance: { feature: string; drop_in_score: number; std: number }[];
  browser_model: BrowserModel;
}

export interface ModelResult {
  pr_curve_area: number;
  pr_curve_area_range: [number, number];
  ratio_to_base_rate: number;
  roc_curve_area: number;
  precision: number;
  recall: number;
  balance: number;
  accuracy: number;
  confusion: Confusion;
}

export interface P5Results {
  test_rows: number;
  test_delay_rate: number;
  threshold: number;
  chosen_model: string;
  n_resamples: number;
  results: Record<string, ModelResult>;
  comparison: {
    better: string;
    than: string;
    mean_difference: number;
    range: [number, number];
    material: boolean;
    material_margin: number;
  } | null;
  pr_curve: Record<string, { recall: number; precision: number }[]>;
  calibration: { bin: string; mean_predicted: number; observed_rate: number; n: number }[];
  calibration_worst_gap: number;
  slices: {
    by: string;
    rows: { group: string; n: number; actual_rate: number; recall: number; precision: number }[];
  }[];
  secondary_check: {
    train_months: number[];
    test_months: number[];
    train_rows: number;
    test_rows: number;
    pr_curve_area: number;
    base_rate: number;
    ratio_to_base_rate: number;
  } | null;
}

export interface Options {
  airlines: { code: string; name: string; n_train: number }[];
  airports: { code: string; city: string; n_train: number; lat: number | null; lon: number | null }[];
  routes: Record<string, Record<string, [number, number]>>;
  top_routes: [string, string, number][];
}

export interface Bundle {
  p1: P1Dataset;
  p2: P2Split;
  p3: P3Selection;
  p4: P4Model;
  p5: P5Results;
  options: Options;
}

const BASE = import.meta.env.BASE_URL;

async function get<T>(name: string): Promise<T> {
  const res = await fetch(`${BASE}data/${name}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Load everything at once: the walkthrough is one story, and a half-loaded
 *  story is worse than a short wait. */
export async function loadAll(): Promise<Bundle> {
  const [p1, p2, p3, p4, p5, options] = await Promise.all([
    get<P1Dataset>("p1_dataset.json"),
    get<P2Split>("p2_split.json"),
    get<P3Selection>("p3_selection.json"),
    get<P4Model>("p4_model.json"),
    get<P5Results>("p5_results.json"),
    get<Options>("options.json"),
  ]);
  return { p1, p2, p3, p4, p5, options };
}
