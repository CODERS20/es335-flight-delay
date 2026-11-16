/* Verification: does docs/app.js render without errors?
 *
 * The shipped app.js is executed against a minimal DOM shim, with `fetch`
 * wired to the real docs/data/*.json files. app.js wraps each renderer in
 * try/catch and reports failures with console.error, so this script treats any
 * console.error as a hard failure -- otherwise a broken section would simply
 * render as empty in a browser and nobody would notice.
 *
 * It asserts that the sections which must contain results are non-empty, that
 * no placeholder text survives where a number belongs, that every dashboard
 * tab panel renders, and that the landing-page predictor actually responds to
 * input rather than printing one fixed number.
 *
 * Run: node src/check_site_render.mjs [path-to-a-docs-folder]
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
// Optional argument: check a different copy of the site, e.g. one downloaded
// from the live GitHub Pages deployment rather than the working tree.
const docs = process.argv[2] ? process.argv[2] : join(repo, "docs");
console.log(`checking site at: ${docs}`);

const html = readFileSync(join(docs, "index.html"), "utf8");
const appSrc = readFileSync(join(docs, "app.js"), "utf8");
const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);

/* ---------------- minimal DOM ---------------- */
let nodeCount = 0;
const dynamic = new Map(); // nodes that app.js created and gave an id

function makeNode(tag = "div", id = "") {
  nodeCount++;
  let _id = id;
  const node = {
    tagName: String(tag).toUpperCase(),
    className: "",
    _html: "",
    children: [],
    style: {},
    dataset: {},
    value: "",
    type: "",
    min: "", max: "", step: "",
    title: "",
    scope: "",
    textContent: "",
    tabIndex: 0,
    _attrs: {},
    _focused: false,
    listeners: {},
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this._attrs[k] = String(v); this[k] = v; },
    removeAttribute(k) { delete this._attrs[k]; delete this[k]; },
    getAttribute(k) { return this._attrs[k] ?? this[k]; },
    hasAttribute(k) { return k in this._attrs; },
    addEventListener(ev, fn) { (this.listeners[ev] ||= []).push(fn); },
    removeEventListener() {},
    focus() { this._focused = true; },
    scrollIntoView() { this._scrolled = true; },
    // Fire the handlers app.js registered, the way a real event would.
    dispatch(ev, payload = {}) {
      (this.listeners[ev] || []).forEach((fn) => fn({ preventDefault() {}, ...payload }));
    },
  };
  // app.js assigns ids to nodes it creates (the predictor's selects, for one),
  // so track those and let getElementById find them too.
  Object.defineProperty(node, "id", {
    get() { return _id; },
    set(v) { _id = String(v); dynamic.set(_id, node); },
  });
  Object.defineProperty(node, "innerHTML", {
    get() { return this._html; },
    set(v) { this._html = String(v); if (v === "") this.children = []; },
  });
  // Text actually visible in this subtree, used for the emptiness assertions.
  Object.defineProperty(node, "rendered", {
    get() {
      return (
        this._html + this.children.map((c) => c.rendered ?? "").join("")
      );
    },
  });
  return node;
}

const registry = new Map();
for (const id of ids) registry.set(id, makeNode("div", id));

const document = {
  createElement: (tag) => makeNode(tag),
  getElementById: (id) => registry.get(id) ?? dynamic.get(id) ?? null,
  addEventListener: (ev, fn) => { if (ev === "DOMContentLoaded") document._ready = fn; },
};

// The page reads window.location.hash for tab routing and window.history to
// update it. Model both, with no hash set: the default tab must then be shown.
const windowStub = {
  document,
  location: { hash: "" },
  history: { replaceState: (_a, _b, url) => { windowStub.location.hash = String(url); } },
  addEventListener: (ev, fn) => { (windowStub._on ||= {})[ev] = fn; },
};

/* ---------------- stubs ---------------- */
const errors = [];
const console2 = {
  log: (...a) => console.log(...a),
  info: () => {},
  warn: (...a) => console.log("WARN:", ...a),
  error: (...a) => {
    errors.push(a.map((x) => (x && x.stack) || String(x)).join(" "));
  },
};

async function fetchStub(url) {
  const path = join(docs, String(url).replace(/^\.?\//, ""));
  try {
    const text = readFileSync(path, "utf8");
    return { ok: true, json: async () => JSON.parse(text) };
  } catch {
    return { ok: false, json: async () => { throw new Error("no file"); } };
  }
}

/* ---------------- run ---------------- */
const run = new Function(
  "document", "fetch", "console", "window",
  `${appSrc}\n; return document._ready;`
);
const ready = run(document, fetchStub, console2, windowStub);

await ready();
// let the awaited Promise.all chain inside settle
await new Promise((r) => setTimeout(r, 150));

console.log("=".repeat(72));
console.log("WEBSITE RENDER CHECK  (docs/app.js against the real data files)");
console.log("=".repeat(72));
console.log(`DOM nodes created : ${nodeCount}`);

if (errors.length) {
  console.log(`\nFAIL: ${errors.length} renderer error(s):`);
  errors.forEach((e) => console.log("  - " + e.split("\n")[0]));
  process.exit(1);
}
console.log("renderer errors   : 0");

/* ---------------- content assertions ---------------- */
let failures = 0;
const bad = (msg) => { console.log("  " + msg); failures++; };

const mustHaveContent = [
  "hero-stats", "data-tiles", "quality-audit", "exclusions", "allowed-list",
  "forbidden-list", "methods-table", "split-table", "results-table",
  "comparison", "calibration-warning", "calibration-table", "importance-text",
  "predictor", "threshold-tool", "errors-slices", "error-examples",
  "conclusion-body", "provenance", "october-note", "balance-text", "rolling-cv",
  "calibration-fix", "splitviz", "grid-search",
];
for (const id of mustHaveContent) {
  const text = registry.get(id)?.rendered ?? "";
  if (text.trim().length < 20) bad(`EMPTY: #${id}`);
}

// Nothing may still be waiting on data.
for (const id of mustHaveContent) {
  if ((registry.get(id)?.rendered ?? "").includes("Could not load")) {
    bad(`NOT LOADED: #${id}`);
  }
}

// Guard against the classic template bugs reaching the page.
const all = mustHaveContent.map((id) => registry.get(id).rendered).join("");
for (const token of ["undefined", "NaN", "[object Object]", "null"]) {
  if (all.includes(token)) bad(`SUSPECT TEXT "${token}" appears in rendered output`);
}

/* ---------------- the dashboard tabs ---------------- */
const TABS = [
  "question", "data", "methods", "evaluation", "results", "errors", "conclusion",
];
for (const t of TABS) {
  const btn = registry.get("tab-" + t);
  const panel = registry.get("panel-" + t);
  if (!btn) { bad(`MISSING TAB BUTTON: #tab-${t}`); continue; }
  if (!panel) { bad(`MISSING TAB PANEL: #panel-${t}`); continue; }
  // The static prose lives in index.html, so a panel's own rendered text can be
  // empty here; what matters is that the tab machinery wired it up.
  if (!btn.listeners.click || !btn.listeners.click.length) {
    bad(`TAB NOT CLICKABLE: #tab-${t}`);
  }
  if (!btn.listeners.keydown || !btn.listeners.keydown.length) {
    bad(`TAB NOT KEYBOARD-NAVIGABLE: #tab-${t}`);
  }
}

// Clicking a tab must select exactly that tab and reveal exactly its panel.
for (const t of TABS) {
  registry.get("tab-" + t).dispatch("click");
  const selected = TABS.filter(
    (x) => registry.get("tab-" + x).getAttribute("aria-selected") === "true"
  );
  const shown = TABS.filter((x) => !registry.get("panel-" + x).hasAttribute("hidden"));
  if (selected.length !== 1 || selected[0] !== t) {
    bad(`TAB SELECTION WRONG after clicking ${t}: [${selected.join(", ")}]`);
  }
  if (shown.length !== 1 || shown[0] !== t) {
    bad(`PANEL VISIBILITY WRONG after clicking ${t}: [${shown.join(", ")}]`);
  }
}

// Arrow keys must move between tabs, since the dashboard has to be usable
// without a mouse.
registry.get("tab-question").dispatch("click");
registry.get("tab-question").dispatch("keydown", { key: "ArrowRight" });
if (registry.get("tab-data").getAttribute("aria-selected") !== "true") {
  bad("ARROW-RIGHT did not move to the next tab");
}

// Every old published anchor must still resolve to an element on the page.
for (const anchor of [
  "question", "data", "preprocessing", "methods", "evaluation", "results",
  "explore", "errors", "limitations", "conclusion", "reproduce",
]) {
  if (!registry.has(anchor)) bad(`BROKEN ANCHOR: #${anchor} no longer exists`);
}

/* ---------------- the predictor actually predicts ---------------- */
const predictor = registry.get("predictor");
const pctRe = /(\d+(?:\.\d+)?)%/;

const readProbability = () => {
  const m = predictor.rendered.match(pctRe);
  return m ? Number(m[1]) : null;
};

const first = readProbability();
if (first == null) {
  bad("PREDICTOR shows no probability on load");
} else if (!(first > 0 && first < 100)) {
  bad(`PREDICTOR probability out of range on load: ${first}`);
}

// Changing an input has to change the number. A predictor that ignores its
// inputs would otherwise satisfy every check above.
const hour = document.getElementById("f-hour");
if (!hour) {
  bad("PREDICTOR has no departure-hour control (#f-hour)");
} else {
  const seen = new Set();
  for (const h of ["5", "12", "19", "22"]) {
    hour.value = h;
    hour.dispatch("change");
    const p = readProbability();
    if (p == null) { bad(`PREDICTOR produced no probability at hour ${h}`); break; }
    seen.add(p);
  }
  if (seen.size < 2) {
    bad(`PREDICTOR output does not respond to the departure hour (always ${[...seen][0]}%)`);
  } else {
    console.log(
      `predictor response : ${seen.size} distinct probabilities across 4 departure hours`
    );
  }
}

const carrier = document.getElementById("f-carrier");
if (!carrier) {
  bad("PREDICTOR has no airline control (#f-carrier)");
} else {
  // Compare the RAW model score here, not the displayed percentage: the
  // calibration mapping is a step function, so two genuinely different scores
  // can legitimately round to the same percentage.
  const rawScore = () => {
    const m = predictor.rendered.match(/Raw model score (\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) : null;
  };
  const before = rawScore();
  // Pick any carrier other than the one currently selected.
  const options = JSON.parse(readFileSync(join(docs, "data", "options.json"), "utf8"));
  const other = options.airlines.map((a) => a.code).find((c) => c !== carrier.value);
  carrier.value = other;
  carrier.dispatch("change");
  const after = rawScore();
  if (before == null || after == null) {
    bad("PREDICTOR does not report a raw model score");
  } else if (after === before) {
    bad(`PREDICTOR output does not respond to the airline (${before} either way)`);
  } else {
    console.log(
      `predictor airline  : raw score ${before} -> ${after} on switching carrier`
    );
  }
}

// The threshold slider drives the confusion matrix and the precision/recall
// tiles, so it must respond too.
const slider = document.getElementById("thr-slider");
const thrTool = registry.get("threshold-tool");
if (!slider) {
  bad("THRESHOLD TOOL has no slider (#thr-slider)");
} else {
  const before = thrTool.rendered;
  slider.value = String(Math.max(0, Number(slider.max) - 1));
  slider.dispatch("input");
  if (thrTool.rendered === before) {
    bad("THRESHOLD TOOL does not respond to the slider");
  } else if (!/Precision/.test(thrTool.rendered) || !/False positives/.test(thrTool.rendered)) {
    bad("THRESHOLD TOOL is missing precision/recall or the confusion matrix");
  } else {
    console.log("threshold slider   : updates the matrix and the metric tiles");
  }
}

/* ---------------- figures and data files referenced by the page ---------- */
for (const src of [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1])) {
  try {
    readFileSync(join(docs, src));
  } catch {
    bad(`MISSING ASSET: ${src}`);
  }
}

if (failures) {
  console.log(`\nFAIL: ${failures} content problem(s).`);
  process.exit(1);
}
console.log(`sections populated: ${mustHaveContent.length}/${mustHaveContent.length}`);
console.log(`dashboard tabs    : ${TABS.length}/${TABS.length} switch correctly`);
console.log("no undefined/NaN/placeholder text in rendered output");
console.log("\nPASS: every section renders with real numbers, and the predictor responds.");
