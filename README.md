# Flight Delay Prediction: Predicting Arrival Delays

**Course:** ES 335 / ES 678 (Machine Learning), Semester I, 2026
**Team:** Divya Saini (25110110), Shikha Ajeet Singh (25110292)
**Live walkthrough:** <https://coders20.github.io/es335-flight-delay/>
**Repository:** <https://github.com/CODERS20/es335-flight-delay>

---

## Project summary

**What we asked.** Will a scheduled US domestic flight arrive 15 or more
minutes late? We answer it from the schedule alone (airline, route, departure
and arrival hour, distance, date), so the prediction could be made when the
ticket is sold.

**Data.** The 2015 US DOT on-time performance file: 5.82 million flights. After
removing cancelled and diverted flights and October (whose airport codes cannot
be translated), **5.23 million flights** and **9 features** remain; 19.2% of
them are late.

**Method.**

1. **Clean** the raw file into one CSV and drop redundant features on measured
   evidence (correlation ≥ 0.90 or an exact duplicate).
2. **Split** by whole calendar days: six days from every month (20%) are sealed
   as the test set before any model is fit.
3. **Cross-validate** 12 candidate settings of logistic regression, random
   forest and gradient boosting on 5 folds grouped by date, and pick the
   setting with the best PR curve area.
4. **Choose the decision threshold** on the cross-validation predictions, where
   precision and recall are best balanced.
5. **Retrain** the winner on all 4.19 million training flights, then **score the
   sealed test days once**.

**Results.** Gradient boosting reaches a PR curve area of **0.3678 — 1.87×
the base rate** on 1.04 million unseen flights, catching **68.5%** of late
flights at **29.6%** precision. Every model beats the baseline. Asked instead to
forecast November–December from January–September, the same model scores
**1.20×**: predicting a later period is much harder than filling in skipped days.

**Deliverables.** Six pipeline scripts in `src/`, every number they produce in
`artifacts/`, and an [interactive walkthrough](https://coders20.github.io/es335-flight-delay/)
that explains each step with figures, lets you score a flight in the browser,
and lists the latest commits.

## The question

Can we predict whether a US domestic flight in 2015 arrives more than 15
minutes late, using only information available **before** its scheduled
departure — and does that beat a simple baseline?

One row is one scheduled flight leg. The target is `ARRIVAL_DELAY >= 15`, the
US Bureau of Transportation Statistics definition of a late arrival rather than
a threshold we invented. The prediction is made at scheduling time, so nothing
recorded during or after the flight may be used.

## Headline result

On **1,044,467 held-out flights**, gradient boosting reaches a
**precision–recall curve area of 0.3678** (95% range 0.366–0.370) against a
majority-class baseline of **0.1965** — **1.87× the base rate**. At the
threshold chosen during cross-validation it catches **68.5%** of delayed
flights at **29.6%** precision.

**The same model, asked to forecast a period it has never seen, scores 1.20×.**
That gap is the most important number in the project.

## Two questions, two answers

The split decides which question you are answering, and they are not equally
hard:

| Design | Question | Result |
|---|---|---|
| Hold out whole days from **every month** (main) | given a period, can we predict the flights we did not see? | **1.87×** base rate |
| Fit Jan–Sep, score Nov–Dec (secondary) | can we predict a **later** period? | **1.20×** base rate |

We report both. The second is harder for two reasons that are tangled together:
the later months are busier, and their `MONTH` values appear nowhere in
training, so a tree can only place those flights in a branch it never populated
and a linear model extends a straight line past the edge of its data.

The main split avoids that extrapolation by drawing held-out days from every
month, and it holds out **whole calendar days**: if one day's flights were
split across training and test, a model could learn that day's weather from the
training half and score the test half almost for free.

## The pipeline

Six scripts, one job each. Later steps read only what earlier ones wrote.

| Script | Does | Output |
|---|---|---|
| `p1_build_dataset.py` | clean, derive features, measure redundancy, drop | `data/flights_clean.csv` |
| `p2_split.py` | hold out 20% of flights as whole days | `data/train.csv`, `data/test.csv` |
| `p3_select.py` | 5-fold cross-validation, model choice, tuning, threshold | `artifacts/p3_selection.json` |
| `p4_retrain.py` | refit the winner on all training rows, export the browser model | `artifacts/models/`, `p4_model.json` |
| `p5_evaluate.py` | score the held-out flights, once | `artifacts/p5_results.json` |
| `p6_export_site.py` | copy what the website reads | `site/public/data/` |

Every decision that can change a number lives in `src/pconfig.py`: the seed,
the feature allow-list, the redundancy threshold, which days are held out, the
fold count, and the rule for choosing the decision threshold.

### 1. One clean dataset

5,819,079 raw rows become **5,231,130**:

| Removed | Rows | Why |
|---|---|---|
| Cancelled | 89,884 | never arrives, so there is no arrival delay to predict |
| Diverted | 15,187 | no arrival at the scheduled destination |
| All of October | 482,878 | its airport codes are numeric DOT ids while every other month uses letter codes, and `airports.csv` has no column to translate them |

**Features are an allow-list, not a drop-list.** A column is unusable unless it
is named as available at scheduling time, and `assert_no_leakage()` raises
before every fit. The 18 refused columns include `DEPARTURE_DELAY`, `TAXI_OUT`,
`AIR_TIME`, the five airline-assigned cause columns, and `ARRIVAL_DELAY`
itself, which is the target.

**Redundancy is measured, not assumed.** Of 11 candidates, two were dropped on
evidence:

- `IS_WEEKEND` — exactly determined by `DAY_OF_WEEK`, so it carries nothing new.
- `SCHEDULED_TIME` — correlated **+0.985** with `DISTANCE`. It is the airline's
  padded estimate of the same thing; we kept the one fixed by the route.

Nine features remain: carrier, origin, destination, scheduled departure hour,
scheduled arrival hour, distance, month, day, day of week.

### 2. The split

20% of flights, drawn as **whole calendar days**, six days from each month,
seeded. The script asserts what the design claims every time it runs: no day on
both sides, every `MONTH`/`DAY`/`DAY_OF_WEEK` value present in training, and
**0 carriers or airports in test that training never saw**.

Training delay rate 19.06%, test 19.65% — close, which is what drawing days
from every month buys.

### 3. Cross-validation, model choice and tuning

**5-fold cross-validation grouped by calendar day**, over 12 candidate settings
(60 fits). Grouping by date matters for the same reason the split does: a day
spread across folds could be learned in four and rewarded in the fifth.

| Model | Best curve area | × base rate |
|---|---|---|
| **Gradient boosting** | **0.3036 ± 0.017** | **1.60×** |
| Random forest | 0.2965 ± 0.023 | 1.56× |
| Logistic regression | 0.2736 ± 0.015 | 1.44× |
| Majority baseline | 0.1902 | 1.00× |

Winner: `learning_rate=0.05, max_leaf_nodes=63, max_iter=200`.

Two things worth saying out loud. The spread between the **best and worst**
candidate is 0.031, while the gap from the best candidate to the **baseline** is
0.113 — so the choice of model and settings moves the score about a quarter as
much as having a model at all does. And weighting the rare class made logistic
regression slightly *worse* (0.2724 against 0.2736), so the weighting that
would have inflated every predicted probability bought nothing.

The grid is deliberately small. An earlier version of this project searched 62
settings and the best beat the setting already in use by 0.0021 — nothing. The
settings are not the constraint on this problem; the features are.

**The decision threshold (0.178)** is chosen here, from the pooled out-of-fold
predictions, as the value giving the best balance of precision and recall. It is
frozen before any test flight is read.

### 4. Retraining

Cross-validation never fitted a candidate on more than 80% of the training days.
With the settings chosen there is no reason to keep data back, so the final
model is refitted on **all 4,186,663 training rows** with the settings frozen
exactly as selected. Nothing is re-tuned.

Feature importance is measured by shuffling one column at a time and re-scoring
on days a probe model was not fitted on — never on the rows the model was fitted
on, which would flatter every feature.

### 5. The single evaluation

`p5_evaluate.py` **fits nothing and chooses nothing.** It loads the models p4
saved and measures.

| Model | PR curve area | 95% range | × base rate | ROC area |
|---|---|---|---|---|
| Majority baseline | 0.1965 | 0.196–0.197 | 1.00× | 0.500 |
| Logistic regression | 0.2832 | 0.281–0.285 | 1.44× | 0.636 |
| Random forest | 0.3507 | 0.349–0.353 | 1.78× | 0.686 |
| **Gradient boosting** | **0.3678** | 0.366–0.370 | **1.87×** | 0.699 |

Ranges come from re-drawing the test flights at random 200 times and
re-measuring. Gradient boosting beats random forest by 0.0171, which holds in
every re-draw and clears the 0.005 margin we fixed in advance as the smallest
difference worth acting on.

**Accuracy is reported only to show why it misleads here:** the baseline is
80.4% accurate and catches no delayed flight at all.

## Honest limitations

- **No weather, and no inbound-aircraft state.** The two largest real causes of
  delay are both absent and both unknowable at scheduling time. That is the
  ceiling on everything above, and it is a property of the question rather than
  of our models.
- **The probabilities are not perfectly calibrated.** The worst score band is
  off by 0.32 between the stated probability and the observed rate.
- **One year.** 2015 fleets, schedules and carriers.
- **Operated flights only.** Cancellations and diversions are excluded by
  construction, so this does not predict disruption in general.
- **Association, not causation.** Evening flights are riskier; evening does not
  *cause* delay. The schedule is a proxy for accumulated upstream disruption, so
  nothing here supports moving a flight to the morning to make it punctual.
- **The test months are not pristine.** An earlier version of this project
  scored November and December under a different split. The held-out days used
  for the headline here were drawn fresh for this pipeline, and the earlier run
  remains in git history.

## The website

A landscape walkthrough of thirteen screens laid out like a research project
page: a title page with the abstract and key results, an in-browser predictor,
then one numbered section per pipeline step (the cleaning funnel, the
correlation matrix, the calendar of held-out days, all five cross-validation
folds, every candidate with its spread, an interactive threshold slider, the
held-out results, the errors and the forecasting check). Each section pairs a
short explanation and a ruled table of key numbers with a titled chart; "See the numbers" opens the exact table behind it. The contents list on
the left, or the arrow keys, move between sections. The last section lists the
recent commits by `divyasaini-dot`, fetched live from GitHub with a saved copy
(`cd site && npm run commits`) as the fallback.

Built with Vite, React, TypeScript and Tailwind (charts are hand-drawn SVG) into
`docs/`, which is what GitHub Pages serves. The predictor runs **in the
browser** from exported coefficients, with no server.

## Verification

| Check | What it proves |
|---|---|
| `python src/check_parity.py` | the JavaScript the page ships reproduces scikit-learn on 300 real routes, to within 1e-9 |
| `cd site && node shoot.mjs` | every screen renders in a real browser at 1512×945 and 1366×768, with no console error, no placeholder, no empty screen, no clipped text and no horizontal overflow — and saves screenshots |
| `assert_no_leakage()` | runs before every fit, so leakage stops the program instead of producing a flattering score |

Those checks have already paid for themselves. `shoot.mjs` caught a grid column
starved to 106px by nowrap text, and a route offset stored in hours but divided
by 60 as though it were minutes. `check_parity.py` caught the page being
compared against the wrong logistic regression — the best-of-family model from
cross-validation rather than the one actually exported to the page.

## Reproducing this

```bash
git clone https://github.com/CODERS20/es335-flight-delay
cd es335-flight-delay

# The raw data is not redistributed here. Download flights.csv, airlines.csv
# and airports.csv from the Kaggle mirror of the US DOT on-time performance
# data and put them in a Dataset/ folder NEXT TO this repository.
python -m venv .venv && .venv/Scripts/activate   # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python src/pconfig.py                 # confirm the paths resolve

python src/p1_build_dataset.py        # ~3 min
python src/p2_split.py                # ~1 min
python src/p3_select.py               # ~20 min
python src/p4_retrain.py              # ~15 min
python src/p5_evaluate.py             # ~10 min
python src/p6_export_site.py          # ~1 min

python src/check_parity.py
cd site && npm install && npm run build && node shoot.mjs
```

The seed is 42 throughout. Re-running on the same input reproduces the same
output: a re-run of the fold scores differed only in timings and one value at
the sixteenth decimal place.

## Repository layout

```
es335-flight-delay/
├── src/
│   ├── pconfig.py             every decision that can change a number
│   ├── pmodels.py             shared model definitions, so p3/p4/p5 cannot drift
│   ├── p1_build_dataset.py … p6_export_site.py
│   └── check_parity.py        the page against scikit-learn
├── site/                      the walkthrough (Vite + React + TypeScript)
│   ├── src/components/        one component per step
│   └── shoot.mjs              drives a browser, screenshots and verifies
├── docs/                      built site, served by GitHub Pages
├── artifacts/                 every number the website shows, plus screenshots
└── data/                      the csvs (gitignored: large, and not ours to share)
```
## Team responsibilities

| Team Member | Core Responsibilities |
| :--- | :--- |
| **Divya Saini** (`25110110`) | Data cleaning, feature allow-list, leakage assertions & redundancy checks (`src/pconfig.py`, `src/p1_build_dataset.py`)<br>Whole-day stratified splitting & grouped 5-fold cross-validation (`src/p2_split.py`, `src/p3_select.py`)<br>Model parity verification (`src/check_parity.py`) & walkthrough story/data views (`site/src/chapters/`) |
| **Shikha Ajeet Singh** (`25110292`) | Shared model definitions, final retraining & browser weight export (`src/pmodels.py`, `src/p4_retrain.py`)<br>Single held-out evaluation, bootstrap confidence intervals & site data export (`src/p5_evaluate.py`, `src/p6_export_site.py`)<br>Browser layout testing (`site/shoot.mjs`), interactive predictor UI & live deployment (`site/`, `docs/`) |
| **Shared** | Research question formulation, leak-free split redesign (whole-day vs. Jan–Sep forecasting), decision threshold selection, error/limitation analysis, and documentation (`README.md`) |

## Use of AI assistance

We used Claude (Anthropic) as a coding assistant: writing and debugging the
Python pipeline and the website, and editing prose. Every result, table and
figure is the output of the code in `src/` run on the dataset described above
and written to `artifacts/`; none were produced or estimated by an AI assistant.

What it was **not** used for is the thinking the project is marked on. The
research question, the feature allow-list and leakage rules, the decision to
hold out whole days from every month rather than train on early months and test
on late ones, the choice of models and metrics, the threshold rule, and the
reading of the results and their limitations are our decisions. We specified
each step before it was implemented, reviewed the output, and directed the
corrections.

One example of that review changing the work: an earlier version of this project
trained on January–September and tested on November–December. We questioned
whether the model could predict months whose `MONTH` value it had never seen,
which is extrapolation rather than prediction. The split was redesigned to hold
out whole days from every month, and the forecasting version was kept as a
secondary result — which is why this README reports 1.87× and 1.20× side by side
instead of one number.

Checks are committed as code rather than asserted in prose: the exported browser
model is compared against scikit-learn, the website is driven in a real browser,
and a leakage assertion runs before every fit.

**Data handling.** No credentials or personal data appear in this repository.
The raw dataset is not redistributed; the published site carries only
precomputed model outputs and aggregate statistics.

## Citations

- US Department of Transportation, Bureau of Transportation Statistics.
  *Airline On-Time Performance Data*, 2015. Distributed on Kaggle as
  `usdot/flight-delays`. <https://www.kaggle.com/datasets/usdot/flight-delays>
- Bureau of Transportation Statistics, *On-Time Performance*: a flight is on
  time if it arrives within 15 minutes of schedule. <https://www.bts.gov/>
- Pedregosa, F. et al. (2011). Scikit-learn: Machine Learning in Python.
  *Journal of Machine Learning Research*, 12, 2825–2830.
- Ke, G. et al. (2017). LightGBM: A Highly Efficient Gradient Boosting Decision
  Tree. *NeurIPS 30*. (The histogram-binning approach used by
  `HistGradientBoostingClassifier`.)
- The pandas development team. *pandas-dev/pandas: Pandas*. Zenodo.
- Hunter, J. D. (2007). Matplotlib: A 2D graphics environment.
  *Computing in Science & Engineering*, 9(3), 90–95.
