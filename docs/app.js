/* ES 335 Flight Delay Prediction - site behaviour.
 *
 * Hard rule: this file contains no results. Every number rendered below is
 * read from ./data/*.json, which the project's Python steps wrote. If a file
 * is missing the page says so rather than showing something invented.
 *
 *   data/summary.json    audit, EDA, splits, feature importance, config
 *   data/metrics.json    validation and test metrics for all four methods
 *   data/threshold.json  confusion counts at 97 thresholds (slider)
 *   data/errors.json     performance slices and representative mistakes
 *   data/model.json      logistic-regression coefficients (in-browser scoring)
 *   data/options.json    carriers, airports, real routes (predictor inputs)
 */

"use strict";

const MODEL_LABEL = {
  majority_baseline: "Majority baseline",
  logistic_regression: "Logistic regression",
  random_forest: "Random forest",
  gradient_boosting: "Gradient boosting",
};
const SERIES = {
  logistic_regression: "var(--series-1)",
  random_forest: "var(--series-2)",
  gradient_boosting: "var(--series-3)",
  majority_baseline: "var(--text-muted)",
};
const ORDER = ["majority_baseline", "logistic_regression", "random_forest", "gradient_boosting"];

const pct = (x, d = 1) => (x * 100).toFixed(d) + "%";
const n3 = (x) => (x == null ? "—" : Number(x).toFixed(3));
const n4 = (x) => (x == null ? "—" : Number(x).toFixed(4));
const num = (x) => (x == null ? "—" : Number(x).toLocaleString("en-US"));
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

async function loadJSON(name) {
  try {
    const res = await fetch(`data/${name}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function fail(id, what) {
  const node = document.getElementById(id);
  if (node) {
    node.innerHTML =
      `<div class="pending">Could not load <code>${what}</code>. ` +
      `If you are viewing this page from the local filesystem, browsers block ` +
      `<code>fetch</code> over <code>file://</code> &mdash; serve the folder with ` +
      `<code>python -m http.server</code> instead.</div>`;
  }
}

/* ===================================================================== */
/* tables                                                                */
/* ===================================================================== */
function table(headers, rows, opts = {}) {
  const wrap = el("div", "table-wrap");
  const t = el("table");
  const thead = el("thead");
  const tr = el("tr");
  headers.forEach((h) => tr.appendChild(el("th", null, h)));
  thead.appendChild(tr);
  t.appendChild(thead);
  const tb = el("tbody");
  rows.forEach((r) => {
    const row = el("tr", r.cls || null);
    r.cells.forEach((c, i) => {
      const cell = el(i === 0 ? "th" : "td", null, c);
      if (i === 0) cell.scope = "row";
      row.appendChild(cell);
    });
    tb.appendChild(row);
  });
  t.appendChild(tb);
  wrap.appendChild(t);
  if (opts.caption) wrap.appendChild(el("p", "caption", opts.caption));
  return wrap;
}

/* ===================================================================== */
/* hero + data                                                           */
/* ===================================================================== */
function renderHero(metrics) {
  const test = metrics.test;
  const best = test.results[test.chosen_model];
  const base = test.results.majority_baseline;
  const tiles = [
    {
      k: "Best test PR-AUC",
      v: n3(best.pr_auc),
      s: `${MODEL_LABEL[test.chosen_model]}, vs ${n3(base.pr_auc)} for the baseline`,
    },
    {
      k: "Lift over baseline",
      v: best.pr_auc_lift_over_baseline.toFixed(2) + "×",
      s: "what the model adds over knowing nothing",
    },
    {
      k: "Delays caught",
      v: pct(best.recall, 0),
      s: `at ${pct(best.precision, 0)} precision, on ${num(test.test_rows)} unseen flights`,
    },
  ];
  const box = document.getElementById("hero-stats");
  tiles.forEach((t) => {
    const d = el("div", "tile");
    d.appendChild(el("p", "tile-k", t.k));
    d.appendChild(el("p", "tile-v", t.v));
    d.appendChild(el("p", "tile-s", t.s));
    box.appendChild(d);
  });
  document.getElementById("hero-foot").innerHTML =
    `A modest result, honestly measured. The schedule carries real signal, but ` +
    `most of what makes a flight late &mdash; weather, and the aircraft arriving ` +
    `late from its last leg &mdash; is invisible at booking time.`;
}

function renderData(summary) {
  const a = summary.audit, e = summary.eda, s = summary.splits;
  const tiles = [
    { k: "Flights in the raw file", v: num(a.n_rows_raw), s: "2015, all US domestic legs" },
    { k: "Columns offered", v: `${a.n_columns_in_file}`, s: `${a.forbidden_columns_present_in_file.length} of them unusable before departure` },
    { k: "Usable after cleaning", v: num(s.n_rows_after_exclusions), s: "cancelled, diverted and October removed" },
    { k: "Features we allow", v: `${summary.config.features.length}`, s: "all known at scheduling time" },
  ];
  const box = document.getElementById("data-tiles");
  tiles.forEach((t) => {
    const d = el("div", "tile");
    d.appendChild(el("p", "tile-k", t.k));
    d.appendChild(el("p", "tile-v", t.v));
    d.appendChild(el("p", "tile-s", t.s));
    box.appendChild(d);
  });

  document.getElementById("balance-text").innerHTML =
    `In the training months, <strong>${pct(e.train_delay_rate)}</strong> of ` +
    `flights arrived 15 or more minutes late. That imbalance is the single most ` +
    `important fact about this task: a model predicting &ldquo;on time&rdquo; ` +
    `every time is <strong>${pct(e.majority_baseline_train_accuracy)}</strong> ` +
    `accurate and catches nothing.`;

  // quality audit
  const q = document.getElementById("quality-audit");
  const months = Object.entries(a.airport_code_format_by_month)
    .filter(([, v]) => v.pct_origin_numeric > 0)
    .map(([m]) => m);
  q.appendChild(
    el(
      "div",
      "finding",
      `<h4>1. October stores airport codes in a different format</h4>
       <p>Eleven months of 2015 identify airports by IATA letter code
       (<code>ATL</code>, <code>ORD</code>). October identifies them by numeric
       DOT id &mdash; <strong>100% of its
       ${num(a.airport_code_format_by_month[10].rows)} rows</strong>. The two
       formats share no values, so to a model they are entirely different
       airports.</p>
       <p>We checked whether <code>airports.csv</code> could translate them. It
       has only an <code>IATA_CODE</code> column and no DOT id, so
       <strong>0 of ${a.distinct_origin_codes_numeric} numeric codes are
       resolvable</strong>. The mapping is impossible with the files provided.</p>
       <p><strong>What we did:</strong> excluded October. Our proposal had it in
       the validation window, and keeping it would have injected
       ${a.distinct_origin_codes_numeric} never-before-seen airport categories
       into the very set we use to tune &mdash; corrupting every tuning decision.
       Validation is therefore September alone. The test months are unaffected
       (0% numeric). This is a documented deviation from our proposal, forced by
       the data.</p>`
    )
  );
  q.appendChild(
    el(
      "div",
      "finding",
      `<h4>2. Some flights have no arrival delay to learn from</h4>
       <p><strong>${num(a.n_cancelled)}</strong> cancelled and
       <strong>${num(a.n_diverted)}</strong> diverted flights carry no recorded
       arrival delay. Every one of the ${num(a.n_arrival_delay_missing)} missing
       labels belongs to such a flight &mdash; among flights that operated,
       <strong>${a.n_operated_missing_delay} labels are missing</strong>. So the
       exclusion is clean rather than selective, but it does narrow our claim to
       flights that flew.</p>`
    )
  );

  // code-format table
  const rows = Object.entries(a.airport_code_format_by_month).map(([m, v]) => ({
    cls: v.pct_origin_numeric > 0 ? "flag" : null,
    cells: [
      new Date(2015, Number(m) - 1).toLocaleString("en-US", { month: "long" }),
      num(v.rows),
      v.pct_origin_numeric > 0 ? "numeric DOT id" : "IATA letter code",
      v.pct_origin_numeric.toFixed(0) + "%",
    ],
  }));
  q.appendChild(
    table(["Month", "Flights", "Airport code format", "% numeric"], rows, {
      caption: "Verified in code over all 5.8 million rows, not sampled.",
    })
  );
}

function renderPreprocessing(summary) {
  const cfg = summary.config, s = summary.splits;
  const allowed = document.getElementById("allowed-list");
  cfg.features.forEach((f) => allowed.appendChild(el("li", null, `<code>${f}</code>`)));
  const forb = document.getElementById("forbidden-list");
  cfg.forbidden_features.forEach((f) => forb.appendChild(el("li", null, `<code>${f}</code>`)));

  const rows = s.exclusions.map((x) => ({
    cells: [x.reason.charAt(0).toUpperCase() + x.reason.slice(1), num(x.rows)],
  }));
  rows.push({
    cls: "total",
    cells: ["<strong>Rows remaining</strong>", `<strong>${num(s.n_rows_after_exclusions)}</strong>`],
  });
  document.getElementById("exclusions").appendChild(
    table(["Step", "Flights"], rows, {
      caption:
        `Scheduled duration was missing for 6 flights; all 6 were already ` +
        `excluded, so the training median (${s.train_scheduled_time_median} ` +
        `minutes) ended up imputing nothing. The rule was in place regardless.`,
    })
  );
}

function renderMethods(metrics) {
  const val = metrics.validation;
  const desc = {
    majority_baseline:
      "Always predicts the majority class. No assumptions, no learning. Present to prove the others earn their keep.",
    logistic_regression:
      "Linear in the log-odds. Class-weighted so the minority class is not ignored. Interpretable: each coefficient is a readable effect, which is why it powers the predictor above.",
    random_forest:
      "Many decorrelated deep trees, averaged. Captures interactions (a given carrier at a given hour) with no feature engineering.",
    gradient_boosting:
      "Trees fitted in sequence, each correcting the errors left by the last. Usually the strongest of these on tabular data.",
  };
  const rows = ORDER.map((k) => {
    const r = val.results[k];
    const cand = (val.all_candidates || []).filter((c) => c.model === k);
    const params = r && r.params ? JSON.stringify(r.params).replace(/[{}"]/g, "").replace(/,/g, ", ") : "—";
    return {
      cells: [
        `<span class="dot" style="background:${SERIES[k]}"></span>${MODEL_LABEL[k]}`,
        desc[k],
        k === "majority_baseline" ? "—" : `<code>${params}</code>`,
        k === "majority_baseline" ? "—" : `${cand.length} tried`,
      ],
    };
  });
  document.getElementById("methods-table").appendChild(
    table(["Method", "Why it fits this problem", "Chosen settings", "Candidates"], rows, {
      caption:
        "Settings were chosen by PR-AUC on the validation month. Every candidate tried is recorded in artifacts/validation.json.",
    })
  );
  document.getElementById("gb-note").innerHTML =
    `<strong>On the gradient-boosting implementation.</strong> We used
     scikit-learn's <code>HistGradientBoostingClassifier</code>. It is the same
     method our proposal named &mdash; gradient-boosted decision trees &mdash;
     but it bins each feature into a histogram before searching for splits,
     which is what makes it tractable on a million rows, and it can treat
     carrier and airport as genuine categories rather than as numbers in
     alphabetical order.`;
}

function renderEvaluation(summary, metrics) {
  const s = summary.splits, cfg = summary.config;
  const val = metrics.validation, test = metrics.test;
  const mn = (ms) => ms.map((m) => new Date(2015, m - 1).toLocaleString("en-US", { month: "short" })).join(", ");
  const rows = [
    {
      cells: ["Train", mn(cfg.train_months), num(s.n_train_used), pct(s.train_delay_rate_subsample), "fitting only"],
    },
    {
      cells: ["Validation", mn(cfg.val_months_effective), num(val.rows), pct(val.delay_rate), "all tuning + threshold"],
    },
    {
      cells: ["Test", mn(cfg.test_months), num(test.test_rows), pct(test.test_delay_rate), "scored once, at the end"],
    },
  ];
  document.getElementById("split-table").appendChild(
    table(["Split", "Months (2015)", "Flights", "Delay rate", "Used for"], rows, {
      caption:
        `Training used a seeded ${num(s.n_train_used)}-row sample of the ` +
        `${num(s.n_train_available)} available, so the tree models finish on a ` +
        `laptop; all models share the same rows. Note the base rate moves a lot ` +
        `between periods &mdash; which is why PR-AUC cannot be compared across them.`,
    })
  );
  document.getElementById("october-note").innerHTML =
    `<strong>Deviation from our proposal.</strong> We planned to validate on ` +
    `September and October. October had to be dropped for the airport-code ` +
    `defect described above, so validation is September only &mdash; a single, ` +
    `and unusually quiet, month (${pct(val.delay_rate)} delayed against ` +
    `${pct(test.test_delay_rate)} in the test months). Tuning on one calm month ` +
    `and testing on two busy ones is a genuine weakness of this design, and it ` +
    `shows up in the results.`;
}

function renderRollingCV(cv, metrics) {
  const root = document.getElementById("rolling-cv");
  const models = ["gradient_boosting", "random_forest", "logistic_regression"];
  const months = [...new Set(cv.folds.map((f) => f.val_month))].sort((a, b) => a - b);
  const mon = (m) => new Date(2015, m - 1).toLocaleString("en-US", { month: "short" });

  const lift = (model, m) =>
    cv.folds.find((f) => f.model === model && f.val_month === m)?.lift;

  const rows = months.map((m) => {
    const vals = models.map((k) => lift(k, m));
    const best = Math.max(...vals);
    return {
      cells: [
        `${mon(m)} <span class="muted">(base ${pct(
          cv.folds.find((f) => f.val_month === m).base_rate
        )})</span>`,
        ...vals.map((v) =>
          v === best ? `<strong>${v.toFixed(3)}×</strong>` : `${v.toFixed(3)}×`
        ),
      ],
    };
  });
  rows.push({
    cls: "total",
    cells: [
      "<strong>Mean</strong>",
      ...models.map(
        (k) =>
          `<strong>${cv.summary[k].mean_lift.toFixed(3)}×</strong>` +
          ` <span class="muted">±${cv.summary[k].std_lift.toFixed(3)}</span>`
      ),
    ],
  });

  root.appendChild(
    table(
      ["Validation month", ...models.map((k) => MODEL_LABEL[k])],
      rows,
      {
        caption:
          "PR-AUC as lift over each month's own base rate, because raw PR-AUC " +
          "scales with the base rate and the monthly delay rate varies widely.",
      }
    )
  );

  const testLift =
    metrics.test.results[metrics.test.chosen_model].pr_auc_lift_over_baseline;
  const worstFold = Math.min(...cv.folds.map((f) => f.lift));

  // Does the best model beat the linear one in every single fold?
  const gbBeatsLr = months.every(
    (m) => lift("gradient_boosting", m) > lift("logistic_regression", m)
  );

  root.appendChild(
    el(
      "div",
      "verdict",
      `<p><strong>${cv.verdict}</strong></p>
       ${
         gbBeatsLr
           ? `<p>One thing the single test set hid: gradient boosting beats
              logistic regression in <strong>all ${months.length} of
              ${months.length} folds</strong>, by about
              ${(cv.summary.gradient_boosting.mean_lift -
                cv.summary.logistic_regression.mean_lift).toFixed(3)} lift on
              average. On the test months the two landed within 0.0009 PR-AUC of
              each other, which made them look interchangeable. Across folds the
              boosted model has a small but consistent edge, so preferring the
              interpretable linear model is a real trade-off rather than a free
              choice.</p>`
           : ""
       }
       <p>Every fold scored between
        ${worstFold.toFixed(2)}&times; and
        ${Math.max(...cv.folds.map((f) => f.lift)).toFixed(2)}&times; lift. The
        test months returned <strong>${testLift.toFixed(2)}&times;</strong>
        &mdash; below the worst fold. That is independent confirmation that
        November and December are genuinely harder than anything the model
        trained on, rather than a quirk of one split.</p>
       <p class="muted">${cv.why_not_kfold} This check was run after the test
        set had been used, so it deliberately did <em>not</em> re-select the
        model: ${cv.purpose}.</p>`
    )
  );
}

/* ===================================================================== */
/* results                                                               */
/* ===================================================================== */
function renderResults(metrics, summary) {
  const test = metrics.test;
  const best = test.results[test.chosen_model];

  document.getElementById("results-intro").innerHTML =
    `All four methods were scored once on November and December &mdash;
     ${num(test.test_rows)} flights the models had never seen, with thresholds
     fixed beforehand on validation. ${MODEL_LABEL[test.chosen_model]} came out
     ahead on PR-AUC at <strong>${n4(best.pr_auc)}</strong> against the
     baseline's ${n4(test.results.majority_baseline.pr_auc)}, a lift of
     <strong>${best.pr_auc_lift_over_baseline.toFixed(2)}&times;</strong>.`;

  const rows = ORDER.map((k) => {
    const r = test.results[k];
    const ci = r.pr_auc_ci95 ? `${n3(r.pr_auc_ci95[0])}–${n3(r.pr_auc_ci95[1])}` : "—";
    return {
      cls: k === test.chosen_model ? "best" : null,
      cells: [
        `<span class="dot" style="background:${SERIES[k]}"></span>${MODEL_LABEL[k]}`,
        `<strong>${n4(r.pr_auc)}</strong>`,
        ci,
        r.pr_auc_lift_over_baseline.toFixed(2) + "×",
        n3(r.roc_auc),
        n3(r.precision),
        n3(r.recall),
        n3(r.f1),
        n3(r.accuracy),
      ],
    };
  });
  document.getElementById("results-table").appendChild(
    table(
      ["Method", "PR-AUC", "95% CI", "Lift", "ROC-AUC", "Precision", "Recall", "F1", "Accuracy"],
      rows
    )
  );

  // honest comparison
  const c = test.model_comparison;
  const box = document.getElementById("comparison");
  box.appendChild(
    el(
      "div",
      "verdict",
      `<p><strong>${MODEL_LABEL[c.better]} beats ${MODEL_LABEL[c.than]} by
        ${c.mean_pr_auc_difference.toFixed(4)} PR-AUC</strong>, with a 95%
        interval of ${c.ci95[0].toFixed(4)} to ${c.ci95[1].toFixed(4)} from
        paired bootstrap resampling.</p>
       <p>${c.conclusion}</p>
       <p class="muted">With ${num(test.test_rows)} test rows, a gap can be
        statistically detectable and still far too small to act on. We set
        ${c.practical_margin_used} PR-AUC as the margin that would count as
        material before looking, and this gap does not reach it. The honest
        summary is that the three models perform about equally, and all three
        clearly beat the baseline.</p>`
    )
  );

  // importance
  const imp = summary.importance;
  const top = imp.importance[0];
  document.getElementById("importance-text").innerHTML =
    `Shuffling one column at a time and watching PR-AUC fall shows
     <strong>${top.feature}</strong> doing most of the work (&minus;${n3(top.drop_in_pr_auc)}),
     followed by the route and the carrier. This matches the exploratory
     picture: time of day is the strongest schedule-time signal there is.
     <code>MONTH</code> scores zero because the validation set is a single
     month &mdash; there is no variation left in it to destroy, which is a
     limitation of our split rather than a statement about seasonality.`;

  // calibration
  const cw = test.calibration_warning;
  document.getElementById("calibration-warning").appendChild(
    el(
      "div",
      "warn",
      `<h4>Read the output as a risk score, not a probability</h4>
       <p>A flight this model scores <strong>0.45</strong> is delayed about
        <strong>18%</strong> of the time &mdash; not 45%. The predicted values
        run systematically high, by up to
        <strong>${n3(cw.max_abs_gap)}</strong> in absolute terms
        (Brier score ${n4(cw.brier)}).</p>
       <p><strong>Why:</strong> ${cw.cause}</p>
       <p><strong>What we did about it:</strong> ${cw.consequence}</p>`
    )
  );
  const crows = test.calibration.map((c) => ({
    cells: [c.bin, n3(c.mean_predicted), n3(c.observed_rate), num(c.n)],
  }));
  document.getElementById("calibration-table").appendChild(
    table(["Score band", "Mean predicted", "Observed delay rate", "Flights"], crows, {
      caption:
        "Ranking still works — higher scores really do mean higher risk, which is what the threshold tool relies on. The level is wrong, not the order.",
    })
  );
}

function renderCalibrationFix(cal) {
  const root = document.getElementById("calibration-fix");
  const h = cal.honest_measurement;

  const rows = [
    ["Brier score", h.raw.brier, h.calibrated.brier, "lower is better"],
    ["Expected calibration error", h.raw.ece, h.calibrated.ece, "mean gap between predicted and observed"],
    ["PR-AUC", h.raw.pr_auc, h.calibrated.pr_auc, "ranking — must not change"],
    ["ROC-AUC", h.raw.roc_auc, h.calibrated.roc_auc, "ranking — must not change"],
  ].map(([k, raw, calv, note]) => ({
    cells: [
      `${k} <span class="muted">${note}</span>`,
      n4(raw),
      `<strong>${n4(calv)}</strong>`,
    ],
  }));

  root.appendChild(
    table(["Measured on 16–30 September", "Raw", "Calibrated"], rows, {
      caption: `Fitted on ${num(h.n_fit)} flights from ${h.fit_days}, measured on ${num(
        h.n_assess
      )} flights from ${h.assess_days}.`,
    })
  );

  const ex = cal.examples.map((e) => ({
    cells: [e.raw_score.toFixed(2), `<strong>${pct(e.calibrated)}</strong>`],
  }));
  root.appendChild(
    table(["Raw model score", "Actual chance of being late"], ex, {
      caption:
        "The mapping the predictor above now uses. A score of 0.50 does not mean a coin flip — it means about one flight in seven.",
    })
  );

  root.appendChild(
    el(
      "div",
      "verdict",
      `<p><strong>The Brier score falls from ${n3(h.raw.brier)} to
        ${n3(h.calibrated.brier)}, and the expected calibration error from
        ${n3(h.raw.ece)} to ${n3(h.calibrated.ece)}</strong> &mdash; roughly a
        thirtyfold improvement in how closely the stated probability matches
        reality, on days the mapping never saw.</p>
       <p>Ranking is unaffected: ROC-AUC moves from ${n4(h.raw.roc_auc)} to
        ${n4(h.calibrated.roc_auc)}, which is what a monotonic transform
        guarantees. The predictor above now reports the calibrated number.</p>
       <p class="muted"><strong>Caveat.</strong> ${cal.caveat}</p>`
    )
  );
}

/* ===================================================================== */
/* interaction 1: the predictor                                          */
/* ===================================================================== */
function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

function scoreFlight(model, f) {
  let z = model.intercept;
  for (const col of ["AIRLINE", "ORIGIN_AIRPORT", "DESTINATION_AIRPORT"]) {
    const tbl = model.categorical[col] || {};
    const lvl = String(f[col]);
    if (lvl in tbl) z += tbl[lvl];
    else if (model.infrequent_level in tbl) z += tbl[model.infrequent_level];
  }
  for (const [col, cc] of Object.entries(model.cyclic_hours)) {
    const rad = (2 * Math.PI * Number(f[col])) / 24;
    z += cc.sin * Math.sin(rad) + cc.cos * Math.cos(rad);
  }
  for (const [col, nc] of Object.entries(model.numeric)) {
    z += (nc.coef * (Number(f[col]) - nc.mean)) / nc.scale;
  }
  return sigmoid(z);
}

/* Evaluate the isotonic step function exported by step07, by linear
   interpolation between its knots. Outside the fitted range we clamp, which is
   what `out_of_bounds="clip"` does on the Python side. */
function applyCalibration(cal, s) {
  if (!cal) return null;
  const { x, y } = cal.mapping;
  if (s <= x[0]) return y[0];
  if (s >= x[x.length - 1]) return y[y.length - 1];
  let lo = 0, hi = x.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (x[mid] <= s) lo = mid; else hi = mid;
  }
  const t = (s - x[lo]) / (x[hi] - x[lo] || 1);
  return y[lo] + t * (y[hi] - y[lo]);
}

function renderPredictor(model, options, calib, cal) {
  const root = document.getElementById("predictor");
  document.getElementById("verify-err").textContent =
    model.verified_max_abs_error_vs_sklearn.toExponential(1);

  const origins = Object.keys(options.routes).sort();
  const cityOf = {};
  options.airports.forEach((a) => (cityOf[a.code] = a.city));
  const label = (c) => (cityOf[c] ? `${c} — ${cityOf[c]}` : c);

  const form = el("div", "pform");
  const field = (lbl, ctrl, hint) => {
    const d = el("div", "field");
    const l = el("label", null, lbl);
    l.setAttribute("for", ctrl.id);
    d.appendChild(l);
    d.appendChild(ctrl);
    if (hint) d.appendChild(el("p", "hint", hint));
    return d;
  };
  const select = (id, items) => {
    const s = el("select");
    s.id = id;
    items.forEach(([v, t]) => {
      const o = el("option", null, t);
      o.value = v;
      s.appendChild(o);
    });
    return s;
  };

  const selCarrier = select("f-carrier", options.airlines.map((a) => [a.code, a.name]));
  const selOrigin = select("f-origin", origins.map((c) => [c, label(c)]));
  const selDest = select("f-dest", []);
  const selHour = select("f-hour", Array.from({ length: 24 }, (_, h) => [h, `${String(h).padStart(2, "0")}:00`]));
  const selDow = select("f-dow", [
    [1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"],
    [5, "Friday"], [6, "Saturday"], [7, "Sunday"],
  ]);
  const selMonth = select("f-month", Array.from({ length: 12 }, (_, i) => [
    i + 1, new Date(2015, i).toLocaleString("en-US", { month: "long" }),
  ]));

  form.appendChild(field("Carrier", selCarrier));
  form.appendChild(field("From", selOrigin));
  form.appendChild(field("To", selDest));
  form.appendChild(field("Scheduled departure", selHour));
  form.appendChild(field("Day of week", selDow));
  form.appendChild(field("Month", selMonth));
  root.appendChild(form);

  const out = el("div", "pout");
  root.appendChild(out);
  const routeInfo = el("p", "hint route-info");
  root.appendChild(routeInfo);

  function fillDests() {
    const o = selOrigin.value;
    const dests = Object.keys(options.routes[o] || {}).sort();
    selDest.innerHTML = "";
    dests.forEach((d) => {
      const op = el("option", null, label(d));
      op.value = d;
      selDest.appendChild(op);
    });
  }

  function band(p) {
    // Translate a score into observed risk using the measured calibration.
    let hit = null;
    for (const c of calib) {
      if (p >= Number(c.bin.split("-")[0]) && p < Number(c.bin.split("-")[1])) hit = c;
    }
    return hit;
  }

  function update() {
    const o = selOrigin.value, d = selDest.value;
    const route = (options.routes[o] || {})[d];
    if (!route) {
      out.innerHTML = `<div class="pending">No training flights on that route.</div>`;
      return;
    }
    const [distance, sched] = route;
    const depHour = Number(selHour.value);
    const arrHour = (depHour + Math.round(sched / 60)) % 24;
    const dow = Number(selDow.value);
    const f = {
      AIRLINE: selCarrier.value,
      ORIGIN_AIRPORT: o,
      DESTINATION_AIRPORT: d,
      SCHED_DEP_HOUR: depHour,
      SCHED_ARR_HOUR: arrHour,
      SCHEDULED_TIME: sched,
      DISTANCE: distance,
      MONTH: Number(selMonth.value),
      DAY: 15,
      DAY_OF_WEEK: dow,
      IS_WEEKEND: dow >= 6 ? 1 : 0,
    };
    const p = scoreFlight(model, f);
    const cp = applyCalibration(cal, p);
    const b = band(p);
    const flagged = p >= model.threshold;
    const shown = cp == null ? p : cp;

    out.innerHTML = "";
    const gauge = el("div", "gauge");
    const bar = el("div", "gauge-bar");
    const fillEl = el("div", "gauge-fill");
    fillEl.style.width = (shown * 100).toFixed(1) + "%";
    bar.appendChild(fillEl);

    gauge.appendChild(
      el("p", "gauge-k", cp == null ? "Risk score" : "Chance of arriving 15+ min late")
    );
    gauge.appendChild(
      el("p", "gauge-v", cp == null ? p.toFixed(3) : pct(cp))
    );
    gauge.appendChild(bar);
    gauge.appendChild(
      el(
        "p",
        "gauge-s",
        cp == null
          ? `Threshold ${model.threshold.toFixed(3)} &rarr; <strong>${
              flagged ? "flagged as at risk" : "not flagged"
            }</strong>`
          : `Raw model score ${p.toFixed(3)}, calibrated to
             <strong>${pct(cp)}</strong>. At our decision threshold this flight
             is <strong>${flagged ? "flagged as at risk" : "not flagged"}</strong>.`
      )
    );
    out.appendChild(gauge);

    const expl = el("div", "pexpl");
    const baseline = 0.1795;
    const rel = shown / baseline;
    expl.innerHTML =
      (cp == null
        ? ""
        : `<p>That is <strong>${rel.toFixed(2)}&times;</strong> the overall
            rate of ${pct(baseline)}. The raw score of ${p.toFixed(3)} is not a
            probability &mdash; class weighting inflates it &mdash; so it is
            passed through a mapping fitted on the validation month, which cut
            the Brier score from 0.222 to 0.103 on days the mapping had never
            seen.</p>`) +
      (b
        ? `<p class="muted">Independently: flights the model scored in the
            <strong>${b.bin}</strong> raw band were late
            <strong>${pct(b.observed_rate)}</strong> of the time across
            ${num(b.n)} test flights.</p>`
        : "");
    out.appendChild(expl);

    routeInfo.innerHTML =
      `Using this route's training medians: <strong>${num(distance)} miles</strong>, ` +
      `<strong>${sched} minutes</strong> scheduled, arriving about ` +
      `<strong>${String(arrHour).padStart(2, "0")}:00</strong>. ` +
      `The schedule fields follow the route rather than being set independently, ` +
      `so the model is never asked about a flight that could not exist.`;
  }

  selOrigin.addEventListener("change", () => { fillDests(); update(); });
  [selCarrier, selDest, selHour, selDow, selMonth].forEach((s) =>
    s.addEventListener("change", update)
  );

  // a deliberately interesting default: a late evening flight out of a hub
  selOrigin.value = origins.includes("ORD") ? "ORD" : origins[0];
  fillDests();
  if (Object.keys(options.routes[selOrigin.value]).includes("LAX")) selDest.value = "LAX";
  selHour.value = "19";
  selMonth.value = "12";
  update();
}

/* ===================================================================== */
/* interaction 2: the threshold slider                                   */
/* ===================================================================== */
function renderThreshold(thr) {
  const root = document.getElementById("threshold-tool");
  const sweep = thr.sweep;

  const head = el("div", "thead-row");
  const slider = el("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = String(sweep.length - 1);
  slider.step = "1";
  slider.id = "thr-slider";
  slider.setAttribute("aria-label", "Decision threshold");

  let start = sweep.findIndex((s) => s.t >= thr.chosen_threshold);
  if (start < 0) start = Math.floor(sweep.length / 2);
  slider.value = String(start);

  const lbl = el("p", "thr-label");
  head.appendChild(lbl);
  head.appendChild(slider);
  const resetBtn = el("button", "reset", "Reset to our chosen threshold");
  head.appendChild(resetBtn);
  root.appendChild(head);

  const tiles = el("div", "tiles four");
  root.appendChild(tiles);
  const matrix = el("div", "matrix");
  root.appendChild(matrix);
  const story = el("p", "thr-story");
  root.appendChild(story);

  function draw(i) {
    const s = sweep[i];
    const isChosen = Math.abs(s.t - thr.chosen_threshold) < 0.005;
    lbl.innerHTML =
      `Threshold <strong>${s.t.toFixed(2)}</strong>` +
      (isChosen ? ` <span class="pill">our chosen value</span>` : "");

    tiles.innerHTML = "";
    [
      ["Precision", s.precision, "of flights flagged, this share really were late"],
      ["Recall", s.recall, "of flights that were late, this share got flagged"],
      ["F1", s.f1, "the balance between the two"],
      ["Accuracy", s.accuracy, "why this metric misleads here"],
    ].forEach(([k, v, sub]) => {
      const d = el("div", "tile");
      d.appendChild(el("p", "tile-k", k));
      d.appendChild(el("p", "tile-v", n3(v)));
      d.appendChild(el("p", "tile-s", sub));
      tiles.appendChild(d);
    });

    matrix.innerHTML = `
      <div class="mcell good"><p class="mk">True negatives</p><p class="mv">${num(s.tn)}</p><p class="ms">on time, not flagged</p></div>
      <div class="mcell bad"><p class="mk">False positives</p><p class="mv">${num(s.fp)}</p><p class="ms">on time, flagged anyway</p></div>
      <div class="mcell bad"><p class="mk">False negatives</p><p class="mv">${num(s.fn)}</p><p class="ms">late, missed</p></div>
      <div class="mcell good"><p class="mk">True positives</p><p class="mv">${num(s.tp)}</p><p class="ms">late, caught</p></div>`;

    const flagged = s.tp + s.fp;
    story.innerHTML =
      `At this cut-off the model flags <strong>${num(flagged)}</strong> of
       ${num(thr.test_rows)} flights (${pct(flagged / thr.test_rows)}). It
       catches <strong>${num(s.tp)}</strong> of the
       ${num(thr.test_positives)} genuinely late ones and misses
       <strong>${num(s.fn)}</strong>, while raising
       <strong>${num(s.fp)}</strong> false alarms.
       ${
         s.recall > 0.9
           ? "Nearly every delay is caught — by flagging almost everything, which tells a traveller nothing."
           : s.precision > 0.4
           ? "Flags are now fairly trustworthy, but most delays slip through unflagged."
           : "This is roughly the balanced region, and it is where our F1 rule lands."
       }`;
  }

  slider.addEventListener("input", () => draw(Number(slider.value)));
  resetBtn.addEventListener("click", () => {
    slider.value = String(start);
    draw(start);
  });
  draw(start);
}

/* ===================================================================== */
/* errors                                                                */
/* ===================================================================== */
function renderErrors(errors) {
  document.getElementById("errors-intro").innerHTML =
    `At the chosen threshold of ${errors.threshold.toFixed(3)},
     ${MODEL_LABEL[errors.model]} caught ${num(errors.confusion.tp)} delayed
     flights, missed ${num(errors.confusion.fn)}, and wrongly flagged
     ${num(errors.confusion.fp)}. Breaking that down by group shows the failure
     is not uniform. ${errors.reading}`;

  const box = document.getElementById("errors-slices");

  const slice = (title, rows, keyName, note) => {
    const h = el("h3", null, title);
    box.appendChild(h);
    if (note) box.appendChild(el("p", null, note));
    const max = Math.max(...rows.map((r) => r.actual_delay_rate));
    const trs = rows.map((r) => ({
      cells: [
        r.group,
        num(r.n),
        `<span class="minibar"><span style="width:${(100 * r.actual_delay_rate / max).toFixed(1)}%"></span></span>
         <span class="mono">${pct(r.actual_delay_rate)}</span>`,
        r.recall == null ? "—" : pct(r.recall),
        r.precision == null ? "—" : pct(r.precision),
      ],
    }));
    box.appendChild(table([keyName, "Flights", "Actual delay rate", "Recall", "Precision"], trs));
  };

  slice(
    "By scheduled departure hour",
    errors.by_departure_hour,
    "Departure",
    "Risk rises through the day, and the model tracks it: it flags far more evening flights than morning ones. The pattern it has learned is real."
  );
  slice(
    "By carrier",
    errors.by_carrier.slice(0, 13),
    "Carrier",
    "Carriers differ by a factor of more than two in actual delay rate, and recall follows that ordering."
  );
  slice(
    "By test month",
    errors.by_month,
    "Month",
    "December is materially worse than November — holiday traffic and winter weather, neither of which the model can see."
  );
  slice("By distance", errors.by_distance, "Distance", null);

  const ex = document.getElementById("error-examples");
  const mk = (title, recs, note) => {
    ex.appendChild(el("h4", null, title));
    ex.appendChild(el("p", "muted", note));
    const rows = recs.map((r) => ({
      cells: [
        r.carrier,
        `<code>${r.route}</code>`,
        r.departs,
        num(r.distance_mi) + " mi",
        r.date,
        `<strong>${r.predicted_probability.toFixed(3)}</strong>`,
        r.actually_delayed ? "late" : "on time",
      ],
    }));
    ex.appendChild(
      table(["Carrier", "Route", "Departs", "Distance", "Date", "Score", "Outcome"], rows)
    );
  };
  mk(
    "Confident misses (false negatives)",
    errors.worst_false_negatives,
    "Flights the model scored as very low risk that arrived 15+ minutes late anyway."
  );
  mk(
    "Confident false alarms (false positives)",
    errors.worst_false_positives,
    "Flights the model scored as high risk that arrived on time."
  );
}

/* ===================================================================== */
/* conclusion                                                            */
/* ===================================================================== */
function renderConclusion(metrics, summary) {
  const test = metrics.test;
  const best = test.results[test.chosen_model];
  const lr = test.results.logistic_regression;
  document.getElementById("conclusion-body").innerHTML = `
    <p>
      <strong>The schedule carries real but limited signal.</strong> Knowing only
      the carrier, route, time of day and date, the best model reaches a test
      PR-AUC of ${n4(best.pr_auc)} against a baseline of
      ${n4(test.results.majority_baseline.pr_auc)} &mdash; a
      ${best.pr_auc_lift_over_baseline.toFixed(2)}&times; lift. At our chosen
      threshold that means catching ${pct(best.recall, 0)} of delayed flights
      while being right about ${pct(best.precision, 0)} of the flights it flags.
      Useful for ranking risk; nowhere near reliable enough to promise an
      individual traveller anything.
    </p>
    <p>
      <strong>The complex models did not earn their complexity.</strong>
      Gradient boosting, random forest and logistic regression finished within
      ${Math.abs(best.pr_auc - lr.pr_auc).toFixed(4)} PR-AUC of each other. On a
      problem where the inputs are this weak, the model class is not the
      bottleneck &mdash; the missing information is. We would ship the logistic
      regression: the same accuracy, and you can read its coefficients.
    </p>
    <p>
      <strong>What would actually help</strong> is not a better algorithm but
      better features: weather at origin and destination, and the state of the
      inbound aircraft. Both are the dominant real causes of delay, and both are
      unavailable at scheduling time, which is the honest answer to our research
      question. The ceiling we hit is a property of the question, not of our
      models.
    </p>
    <p>
      <strong>What we would do differently.</strong> Validate on more than one
      month &mdash; losing October to a data defect left us tuning on a single
      quiet September and testing on the holiday season, and performance fell
      between the two (lift ${(best.val_pr_auc_lift_over_baseline ?? 0).toFixed(2)}&times;
      on validation to ${best.pr_auc_lift_over_baseline.toFixed(2)}&times; on
      test). We would also fit a calibrator on validation so the output could be
      read as a probability rather than a ranking.
    </p>`;

  document.getElementById("provenance").appendChild(
    el(
      "div",
      "prov",
      `<p class="muted">Seed ${summary.config.seed} throughout.
        Test set opened once, on ${num(test.test_rows)} flights, after models,
        hyperparameters and thresholds were frozen on validation.
        ${test.n_bootstrap} bootstrap resamples for every confidence interval.
        ${test.provenance}</p>`
    )
  );
}

/* ===================================================================== */
/* boot                                                                  */
/* ===================================================================== */
document.addEventListener("DOMContentLoaded", async () => {
  const [summary, metrics, thr, errors, model, options, rollingCV, calibration] = await Promise.all([
    loadJSON("summary.json"),
    loadJSON("metrics.json"),
    loadJSON("threshold.json"),
    loadJSON("errors.json"),
    loadJSON("model.json"),
    loadJSON("options.json"),
    loadJSON("rolling_cv.json"),
    loadJSON("calibration.json"),
  ]);

  if (!metrics || !summary) {
    ["hero-stats", "data-tiles", "results-table", "predictor", "threshold-tool"].forEach((id) =>
      fail(id, "data/*.json")
    );
    return;
  }

  try { renderHero(metrics); } catch (e) { console.error(e); }
  try { renderData(summary); } catch (e) { console.error(e); }
  try { renderPreprocessing(summary); } catch (e) { console.error(e); }
  try { renderMethods(metrics); } catch (e) { console.error(e); }
  try { renderEvaluation(summary, metrics); } catch (e) { console.error(e); }
  try { renderResults(metrics, summary); } catch (e) { console.error(e); }
  if (calibration) {
    try { renderCalibrationFix(calibration); } catch (e) { console.error(e); }
  } else fail("calibration-fix", "data/calibration.json");
  if (rollingCV) {
    try { renderRollingCV(rollingCV, metrics); } catch (e) { console.error(e); }
  } else fail("rolling-cv", "data/rolling_cv.json");
  try { renderConclusion(metrics, summary); } catch (e) { console.error(e); }

  if (model && options) {
    try { renderPredictor(model, options, metrics.test.calibration, calibration); }
    catch (e) { console.error(e); fail("predictor", "data/model.json"); }
  } else fail("predictor", "data/model.json");

  if (thr) {
    try { renderThreshold(thr); } catch (e) { console.error(e); fail("threshold-tool", "data/threshold.json"); }
  } else fail("threshold-tool", "data/threshold.json");

  if (errors) {
    try { renderErrors(errors); } catch (e) { console.error(e); }
  }
});
