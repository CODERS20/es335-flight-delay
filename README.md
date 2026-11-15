# Flight Delay Prediction: Predicting Arrival Delays

**Course:** ES 335 (Machine Learning) — Undergraduate track
**Team:** Divya Saini (25110110), Shikha Ajeet Singh (25110292)
**Live site:** <https://coders20.github.io/es335-flight-delay/>
**Repository:** <https://github.com/CODERS20/es335-flight-delay>

> Names and roll numbers above are placeholders for the team to confirm.

---

## Research question

Using only schedule-time features (carrier, route, scheduled departure hour,
distance, and calendar variables), how accurately can machine-learning models
predict whether a US domestic flight in 2015 will arrive more than 15 minutes
late in a later, unseen time period — compared with a simple baseline?

## Headline result

Gradient boosting reaches a **test PR-AUC of 0.2317** (95% CI 0.2300–0.2332)
against a majority-baseline PR-AUC of **0.1795** — a lift of **1.29×**. At the
validation-chosen threshold it catches **46.8%** of delayed flights at **22.9%**
precision, on 932,084 flights it had never seen.

The three models finish within 0.006 PR-AUC of each other on the test set.
**The model class is not the bottleneck; the missing information is.** Weather
and inbound-aircraft state are the dominant real causes of delay and neither is
knowable at scheduling time, which is the honest answer to our research
question.

A caveat on that "within 0.006": across five rolling-origin CV folds, gradient
boosting beats logistic regression in **5 of 5**, by ~0.10 lift on average. The
test set happened to land them 0.0009 apart; the folds show the boosted model
has a small but consistent edge. See
[Rolling-origin cross-validation](#rolling-origin-cross-validation).

**A note on accuracy.** These models do not beat the baseline on accuracy and
cannot: the highest accuracy reachable at *any* threshold is 0.8205, exactly the
baseline's, achieved only by flagging no flight at all (recall 0.000). Our 0.62
accuracy is the deliberate price of an F1-maximising threshold under class
weighting — 20 points of accuracy traded for 47% recall on the class the
baseline never finds. What the model does provide is ranking: the riskiest 2% of
flights are late 30.5% of the time against a 17.95% base rate (1.70× lift).

## Problem framing

| | |
|---|---|
| **One row** | one scheduled US domestic flight leg in 2015 |
| **Target** | `ARRIVAL_DELAY >= 15` minutes → 1, otherwise 0 (US BTS on-time definition) |
| **Prediction time** | at scheduling, *before* departure |
| **Information available then** | carrier, origin, destination, scheduled departure and arrival times, scheduled duration, distance, calendar fields |
| **Excluded rows** | cancelled and diverted flights — no recorded arrival delay, so they cannot be labelled |
| **Limit of the claim** | an operational *risk estimate*, not a causal model |

Because cancelled and diverted flights are dropped, every result applies to
**flights that actually operated**: a flight cancelled in a snowstorm never
enters the data, so this is not a model of disruption in general.

## Data

- **Source:** US DOT *Flight Delays and Cancellations* (2015), on Kaggle as
  [`usdot/flight-delays`](https://www.kaggle.com/datasets/usdot/flight-delays).
- **Size:** 5,819,079 rows × 31 columns (`flights.csv`, 592 MB), plus
  `airlines.csv` and `airports.csv`.
- **Raw data is not committed** and not redistributed here. It lives in a
  `Dataset/` folder *outside* this repository — see
  [Getting the data](#getting-the-data).
- After cleaning: **5,231,130** usable flights.

## Two data-quality findings

**1. October 2015 uses a different airport-code format.** Eleven months
identify airports by IATA letter code (`ATL`); October uses numeric DOT ids, in
**100% of its 486,165 rows**. The formats share no values, so to a model they
are different airports entirely. We checked whether `airports.csv` could
translate: it has only an `IATA_CODE` column and no DOT id, so **0 of 306
numeric codes are resolvable**. The mapping is impossible with the files
provided.

**Consequence — a documented deviation from our proposal.** Our proposal put
October in the validation window. Keeping it would have injected 306 unseen
airport categories into the set used for tuning, corrupting every tuning
decision. We excluded October, so **validation is September alone**. The test
months are unaffected (0% numeric). This is a real weakness: we tune on one
quiet month (13.0% delayed) and test on two busy ones (17.9% delayed).

**2. Missing labels are structural, not random.** All 105,071 missing
`ARRIVAL_DELAY` values belong to cancelled or diverted flights. Among flights
that operated, zero labels are missing — so the exclusion is clean, but it does
narrow the claim.

## Method

**Feature allow-list, not a drop-list.** This dataset rewards the mistake it
invites: it ships `DEPARTURE_DELAY`, `TAXI_OUT`, `AIR_TIME` and the airline's
own delay-cause columns, all known only during or after a flight. A model given
those scores brilliantly because it is reading the answer. A column is unusable
here unless explicitly named in [`src/config.py`](src/config.py), and
`assert_no_leakage()` raises before every fit — so leakage is a crash, not a
flattering number. 18 forbidden columns are present in the file and refused.

**Chronological split**, never a random shuffle:

| Split | Months | Flights | Delay rate | Used for |
|---|---|---|---|---|
| Train | Jan–Aug | 1,000,000 | 20.3% | fitting only |
| Validation | Sep | 462,153 | 13.0% | all tuning + threshold |
| Test | Nov–Dec | 932,084 | 17.9% | scored once, at the end |

Training uses a seeded 1,000,000-row sample of the 3,836,893 available so the
tree models finish on a laptop; **all models share the same rows**, keeping the
comparison fair.

**Models** (exactly those in our approved proposal): majority-class baseline,
class-weighted logistic regression, random forest, gradient boosting. For
gradient boosting we used `HistGradientBoostingClassifier` — the same
gradient-boosted-trees method, with histogram binning so it is tractable at this
scale and can treat carrier and airport as true categories.

**Evaluation.** Hyperparameters and the decision threshold were chosen on
validation only; the test months were scored **exactly once**, after everything
was frozen, and nothing was re-tuned afterwards. PR-AUC is the headline because
delayed flights are the minority class. Accuracy appears only beside the
baseline, to show why it misleads. Threshold rule: maximise F1 on validation.
200 bootstrap resamples give every confidence interval. Seed 42 throughout.

## Results (test set, opened once)

| Method | PR-AUC | 95% CI | Lift | ROC-AUC | Precision | Recall | F1 | Accuracy |
|---|---|---|---|---|---|---|---|---|
| Majority baseline | 0.1795 | 0.1789–0.1803 | 1.00× | 0.500 | 0.000 | 0.000 | 0.000 | 0.821 |
| Logistic regression | 0.2307 | 0.2294–0.2325 | 1.29× | 0.595 | 0.233 | 0.494 | 0.317 | 0.617 |
| Random forest | 0.2255 | 0.2241–0.2270 | 1.26× | 0.592 | 0.222 | 0.559 | 0.318 | 0.569 |
| **Gradient boosting** | **0.2317** | 0.2300–0.2332 | **1.29×** | 0.588 | 0.229 | 0.468 | 0.307 | 0.621 |

Three honest caveats we report rather than bury:

- **The winner's margin on test is not material — but the folds disagree.**
  Gradient boosting beats logistic regression by 0.0009 PR-AUC on test,
  CI [0.0000, 0.0020]; on 932k rows a gap can be statistically separable and
  still too small to act on, and we fixed 0.005 as the material margin *before*
  looking. Taken alone, that reads as "the models are equivalent, so ship the
  interpretable one". Rolling-origin CV does not support that reading: gradient
  boosting wins 5 of 5 folds against logistic regression. The honest statement
  is that the boosted model has a small, consistent edge, and choosing the
  linear model for interpretability is a genuine trade-off rather than a free
  one.
- **Test PR-AUC is not comparable to validation PR-AUC.** Test looks higher
  (0.2317 vs 0.2001) only because its base rate is higher (0.1795 vs 0.1300).
  On lift, performance **fell**: 1.54× on validation → 1.29× on test.
  Performance degraded on the holiday months.
- **The probabilities are not calibrated.** A flight scored 0.45 is delayed
  about 18% of the time, not 45% (Brier 0.2290, worst gap 0.49). Cause:
  class weighting deliberately over-weights the minority class, which lifts
  recall and inflates predicted probabilities. The website therefore presents
  output as a **relative risk score** and publishes the calibration curve.
  We did *not* fit a post-hoc calibrator, because the test set has already been
  used and re-scoring it with a changed model would turn one honest test into a
  second round of tuning. Doing that properly on validation is the obvious next
  step.

### Rolling-origin cross-validation

Ordinary k-fold CV would be wrong here: shuffling flights at random puts
December in the training folds and June in the held-out fold, so the model
learns from the future — the exact leakage the chronological split prevents.
Because losing October left us tuning on a single month, we also ran the
time-aware equivalent. Each fold trains on every month before the one it
validates on; the test months are never loaded, and an assertion enforces it.

| Validation month | Gradient boosting | Random forest | Logistic regression |
|---|---|---|---|
| May (base 26.1%) | **1.430×** | 1.377× | 1.284× |
| Jun (base 23.5%) | 1.563× | **1.593×** | 1.450× |
| Jul (base 20.9%) | 1.596× | **1.600×** | 1.484× |
| Aug (base 18.7%) | **1.612×** | 1.562× | 1.498× |
| Sep (base 13.0%) | **1.528×** | 1.437× | 1.492× |
| **Mean** | **1.546 ± 0.072** | 1.514 ± 0.100 | 1.442 ± 0.090 |

PR-AUC is shown as lift over each fold's own base rate, since raw PR-AUC scales
with the base rate and the monthly delay rate varies from 13% to 26%.

Three conclusions:

1. **The model choice holds.** Gradient boosting wins 3 of 5 folds and the best
   mean lift, agreeing with the single-September choice made in step 03.
2. **Gradient boosting consistently beats logistic regression** — 5 of 5 folds
   — which the single test comparison did not reveal.
3. **The test months are harder than anything we trained on.** Fold lift ranges
   1.43–1.61; test returned 1.29, below the worst fold. Independent
   confirmation that the holiday-season degradation is real and not an artefact
   of one split.

This was run **after** the test set had been used, so it is explicitly a
robustness check and was not allowed to re-select the model. Had it disagreed,
the honest response would have been to report the disagreement, not to pick a
new model and re-score a spent test set.

**What carries the signal** (permutation importance): scheduled departure hour
dominates (−0.031 PR-AUC when shuffled), then destination, origin and carrier.
`MONTH` scores zero because validation is a single month — a limitation of our
split, not a claim about seasonality.

## Repository layout

```
es335-flight-delay/
├── src/
│   ├── config.py                 paths, allow-list, split, seed — single source of truth
│   ├── features.py               preprocessors, fitted on train only
│   ├── step01_audit_eda.py       data understanding + quality audit
│   ├── step02_preprocess_split.py cleaning, features, chronological split
│   ├── step03_models.py          baseline + 3 models, tuning on validation
│   ├── step04_export_model.py    model → JSON for the site, importance
│   ├── step05_final_eval.py      test set, opened once
│   ├── step06_rolling_cv.py      rolling-origin CV (robustness; no test data)
│   ├── check_site_parity.py/.mjs verifies the site's JS == scikit-learn
│   └── check_site_render.mjs     verifies every section renders
├── artifacts/                    every number and figure the site shows
├── data/processed/               saved splits (gitignored; regenerated by step02)
├── docs/                         the static GitHub Pages site
└── requirements.txt / requirements.lock.txt
```

**Every number on the website is read from a JSON file in `docs/data/` that
these scripts wrote.** None are typed in by hand. Two checks enforce this:
`check_site_parity` confirms the browser's predictor reproduces scikit-learn's
`predict_proba` (agreement 2.2e-16 over 200 real routes), and
`check_site_render` executes the page's renderers against the real data files
and fails if any section is empty or contains `undefined`/`NaN`.

Fitted models (`artifacts/models/*.joblib`) are gitignored — the random forest
alone is 78 MB. The scripts regenerate them deterministically from the fixed
seed.

## Setup

```bash
python -m venv .venv

# Windows (PowerShell)
.venv\Scripts\Activate.ps1
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

Exact versions behind every committed number are in `requirements.lock.txt`
(Python 3.12.10, pandas 3.1.1, scikit-learn 1.9.1).

### Getting the data

The raw CSVs are **not** in this repository (592 MB, and redistribution is not
ours to grant).

1. Create a Kaggle account and accept the dataset terms at
   <https://www.kaggle.com/datasets/usdot/flight-delays>.
2. Download and unzip `flights.csv`, `airlines.csv`, `airports.csv`.
3. Place them in a `Dataset/` folder **next to** this repository:

   ```
   ES 335 Project/
   ├── Dataset/              <- the three CSVs
   └── es335-flight-delay/   <- this repository
   ```

4. Confirm the paths resolve: `python src/config.py`

`kaggle.json` and other credential files are gitignored and must never be
committed.

### Running

```bash
python src/step01_audit_eda.py        # ~1 min
python src/step02_preprocess_split.py # ~1 min
python src/step03_models.py           # ~3 min  (test set untouched)
python src/step04_export_model.py     # ~3 min
python src/step05_final_eval.py       # ~4 min  (opens the test set)
python src/step06_rolling_cv.py       # ~6 min  (robustness; Jan-Sep only)

# verification
python src/check_site_parity.py --make && node src/check_site_parity.mjs
python src/check_site_parity.py
node src/check_site_render.mjs
```

To preview the site locally, serve it — browsers block `fetch` over `file://`:

```bash
cd docs && python -m http.server 8000   # then open http://localhost:8000
```

## Limitations

- **No weather**, the single largest omission and the ceiling on everything above.
- **No inbound-aircraft state**, the best predictor of a late departure, and unknowable at scheduling time.
- **Uncalibrated probabilities** — scores rank risk, they are not probabilities.
- **One year** (2015); no claim about other years.
- **Operated flights only**; cancellations and diversions excluded by construction.
- **October missing entirely**, so validation rests on one quiet month.
- **November–December test period** is the least ordinary of the year, and performance measurably degraded there.
- **1M training rows, not 3.8M**, for tractability.
- **Association, not causation.** Evening flights are riskier; evening does not *cause* delay. The schedule proxies accumulated upstream disruption.

## Use of AI assistance

In line with the course policy on AI tools, we disclose the following.

**Tool used:** Anthropic's Claude (Claude Code), an AI coding assistant.

**Kinds of assistance:** writing and debugging the Python analysis scripts;
structuring this repository; building the static website's HTML, CSS and
JavaScript; generating the matplotlib figures from our analysis outputs; and
drafting and editing explanatory prose in this README and on the website.

**What was not delegated:** no result, number, table or figure in this
repository or on the website was produced by an AI assistant. Every one is the
output of the code in `src/`, run on the dataset described above, and saved to
`artifacts/`. The project's substantive decisions — the research question, the
feature allow-list and leakage rules, the chronological split, the exclusion of
October, the model and metric choices, the threshold rule, and the
interpretation of the results and their limitations — are ours, and we can
explain and defend each of them.

**Verification.** Outputs were checked independently of the assistant rather
than taken on trust: the exported browser model is asserted equal to
scikit-learn's own `predict_proba` (`check_site_parity`), the rendered site is
executed and checked for empty or malformed sections (`check_site_render`), and
a leakage assertion runs before every model fit.

**Data handling.** No credentials, API keys or personal data appear in this
repository. The raw dataset is not redistributed; the published site carries
only precomputed model outputs and aggregate statistics, as the course policy
permits.

## Citations

- US Department of Transportation, Bureau of Transportation Statistics.
  *Airline On-Time Performance Data*, 2015. Distributed on Kaggle as
  `usdot/flight-delays`. <https://www.kaggle.com/datasets/usdot/flight-delays>
- Bureau of Transportation Statistics, *On-Time Performance* — a flight is
  on time if it arrives within 15 minutes of schedule. <https://www.bts.gov/>
- Pedregosa, F. et al. (2011). Scikit-learn: Machine Learning in Python.
  *Journal of Machine Learning Research*, 12, 2825–2830.
- Ke, G. et al. (2017). LightGBM: A Highly Efficient Gradient Boosting Decision
  Tree. *NeurIPS 30*. (The histogram-binning approach used by
  `HistGradientBoostingClassifier`.)
- The pandas development team. *pandas-dev/pandas: Pandas*. Zenodo.
- Hunter, J. D. (2007). Matplotlib: A 2D graphics environment.
  *Computing in Science & Engineering*, 9(3), 90–95.

No external code was copied into this repository; all analysis code in `src/`
and all site code in `docs/` was written for this project.
