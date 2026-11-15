/* Verification: does docs/app.js render without errors?
 *
 * The shipped app.js is executed against a minimal DOM shim, with `fetch`
 * wired to the real docs/data/*.json files. app.js wraps each renderer in
 * try/catch and reports failures with console.error, so this script treats any
 * console.error as a hard failure -- otherwise a broken section would simply
 * render as empty in a browser and nobody would notice.
 *
 * It also asserts that the sections which must contain results are non-empty,
 * and that no placeholder text survives where a number belongs.
 *
 * Run: node src/check_site_render.mjs
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

function makeNode(tag = "div", id = "") {
  nodeCount++;
  const node = {
    tagName: String(tag).toUpperCase(),
    id,
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
    listeners: {},
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this[k] = v; },
    addEventListener(ev, fn) { (this.listeners[ev] ||= []).push(fn); },
    getAttribute(k) { return this[k]; },
  };
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
  getElementById: (id) => registry.get(id) ?? null,
  addEventListener: (ev, fn) => { if (ev === "DOMContentLoaded") document._ready = fn; },
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
const ready = run(document, fetchStub, console2, { document });

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
const mustHaveContent = [
  "hero-stats", "data-tiles", "quality-audit", "exclusions", "allowed-list",
  "forbidden-list", "methods-table", "split-table", "results-table",
  "comparison", "calibration-warning", "calibration-table", "importance-text",
  "predictor", "threshold-tool", "errors-slices", "error-examples",
  "conclusion-body", "provenance", "october-note", "balance-text", "rolling-cv",
];
let failures = 0;
for (const id of mustHaveContent) {
  const text = registry.get(id)?.rendered ?? "";
  if (text.trim().length < 20) {
    console.log(`  EMPTY: #${id}`);
    failures++;
  }
}

// Nothing may still be waiting on data.
for (const id of mustHaveContent) {
  const text = registry.get(id)?.rendered ?? "";
  if (text.includes("Could not load")) {
    console.log(`  NOT LOADED: #${id}`);
    failures++;
  }
}

// Guard against the classic template bugs reaching the page.
const all = mustHaveContent.map((id) => registry.get(id).rendered).join("");
for (const bad of ["undefined", "NaN", "[object Object]", "null"]) {
  if (all.includes(bad)) {
    console.log(`  SUSPECT TEXT "${bad}" appears in rendered output`);
    failures++;
  }
}

if (failures) {
  console.log(`\nFAIL: ${failures} content problem(s).`);
  process.exit(1);
}
console.log(`sections populated: ${mustHaveContent.length}/${mustHaveContent.length}`);
console.log("no undefined/NaN/placeholder text in rendered output");
console.log("\nPASS: every section renders with real numbers.");
