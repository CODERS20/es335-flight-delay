/* Walk the built site in a real browser, capture every slide, and fail on
 * anything a reader would notice: a console error, a failed request, a
 * placeholder left on the page, an empty slide, or a slide that does not fit a
 * laptop screen.
 *
 *   node shoot.mjs            serve ../docs and capture
 *   node shoot.mjs <url>      capture a running dev server instead
 *
 * Screenshots land in ../artifacts/screenshots/.
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const docs = join(here, "..", "docs");
const outDir = join(here, "..", "artifacts", "screenshots");
const BASE = "/es335-flight-delay/";

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function serve(port) {
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (path.startsWith(BASE)) path = path.slice(BASE.length - 1);
    let file = join(docs, path);
    if (path === "/" || path.endsWith("/")) file = join(docs, "index.html");
    if (!existsSync(file)) file = join(docs, "index.html");
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      });
      res.end(body);
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

/** Every step of the walkthrough, in order. */
const SLIDES = [
  "top",
  "predict",
  "data",
  "data-audit",
  "split",
  "select",
  "select-folds",
  "select-candidates",
  "select-threshold",
  "retrain",
  "evaluate",
  "evaluate-detail",
  "evaluate-forecast",
  "reproduce",
];

const urlArg = process.argv[2];
const port = 4178;
const server = urlArg ? null : await serve(port);
const url = urlArg ?? `http://localhost:${port}${BASE}`;

await mkdir(outDir, { recursive: true });

// Drive a browser that is already installed rather than downloading one.
let browser = null;
for (const channel of ["chrome", "msedge"]) {
  try {
    browser = await chromium.launch({ channel });
    console.log(`using installed browser: ${channel}`);
    break;
  } catch {
    /* try the next one */
  }
}
if (!browser) browser = await chromium.launch();

const problems = [];

for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({
    viewport: { width: 1512, height: 945 }, // a laptop, in landscape
    colorScheme: scheme,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[${scheme}] console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`[${scheme}] page error: ${e.message}`));
  page.on("requestfailed", (r) =>
    problems.push(`[${scheme}] failed request: ${r.url()}`),
  );

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  for (const id of SLIDES) {
    await page.evaluate((hash) => {
      window.location.hash = hash;
    }, id);
    await page.waitForTimeout(scheme === "light" ? 700 : 450);

    const present = await page.evaluate((sel) => !!document.getElementById(sel), id);
    if (!present) {
      problems.push(`[${scheme}] slide #${id} did not render`);
      continue;
    }

    await page.screenshot({ path: join(outDir, `${scheme}-${id}.png`) });
    if (scheme === "light") console.log(`wrote ${scheme}-${id}.png`);

    if (scheme !== "light") continue;

    // ---- content checks, once ----
    const text = await page.evaluate(() => document.body.innerText);
    for (const bad of ["Not generated yet", "undefined", "NaN", "[object Object]"]) {
      if (text.includes(bad)) problems.push(`slide ${id}: text contains "${bad}"`);
    }

    const len = await page.evaluate(
      (sel) => document.getElementById(sel)?.innerText.trim().length ?? 0,
      id,
    );
    if (len < 120) problems.push(`slide #${id} is nearly empty (${len} chars)`);

    // A slide much taller than the viewport is not a landscape slide any more.
    const fit = await page.evaluate(() => {
      const m = document.querySelector("main");
      return m ? { h: m.scrollHeight, view: m.clientHeight } : null;
    });
    if (fit && fit.h > fit.view * 1.55) {
      problems.push(
        `slide ${id} is ${(fit.h / fit.view).toFixed(1)} screens tall - split it or tighten it`,
      );
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 1) problems.push(`slide ${id}: ${overflow}px of horizontal overflow`);
  }

  await ctx.close();
}

await browser.close();
if (server) server.close();

console.log("\n" + "=".repeat(64));
if (problems.length) {
  console.log(`${problems.length} problem(s):`);
  problems.forEach((p) => console.log("  - " + p));
  process.exitCode = 1;
} else {
  console.log("every slide renders, fits the screen, and reports no errors");
}
console.log("screenshots in artifacts/screenshots/");
