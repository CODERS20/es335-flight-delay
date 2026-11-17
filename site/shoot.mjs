/* Walk the built site in a real browser, screenshot every screen once its
 * animations have settled, and fail on anything a reader would notice:
 *
 *   - a console error, page error or failed request
 *   - "undefined", "NaN" or "[object Object]" in the page text
 *   - a screen with almost no content
 *   - text clipped by its container (content that is cut off)
 *   - horizontal overflow
 *
 *   node shoot.mjs            serve ../docs and capture
 *   node shoot.mjs <url>      capture a running server instead
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
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

const SCREENS = [
  "overview", "predict", "clean", "features", "split", "folds", "compare",
  "threshold", "retrain", "results", "errors", "forecast", "reproduce",
];

const urlArg = process.argv[2];
const port = 4178;
const server = urlArg ? null : await serve(port);
const url = urlArg ?? `http://localhost:${port}${BASE}`;
await mkdir(outDir, { recursive: true });

let browser = null;
for (const channel of ["chrome", "msedge"]) {
  try {
    browser = await chromium.launch({ channel });
    console.log(`using installed browser: ${channel}`);
    break;
  } catch {
    /* next */
  }
}
if (!browser) browser = await chromium.launch();

const problems = [];

/** Find text that its own container is cutting off. */
async function clippedText(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return [];
    const out = [];
    const leaves = main.querySelectorAll("p, span, h1, h2, h3, li, text, button, a, td, th, label");
    for (const el of leaves) {
      const t = (el.textContent || "").trim();
      if (!t || el.children.length > 2) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      let a = el.parentElement;
      while (a && a !== main.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflowY !== "visible" || cs.overflowX !== "visible") {
          const ar = a.getBoundingClientRect();
          if (r.bottom > ar.bottom + 3 || r.right > ar.right + 3) {
            out.push(`"${t.slice(0, 40)}" cut off by its container`);
          }
          break;
        }
        a = a.parentElement;
      }
    }
    return [...new Set(out)].slice(0, 5);
  });
}

for (const vp of [
  { name: "laptop", width: 1512, height: 945, shots: true },
  { name: "small-laptop", width: 1366, height: 768, shots: false },
]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    colorScheme: "dark",
    deviceScaleFactor: vp.shots ? 2 : 1,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  // The commits panel asks GitHub live; a rate-limited answer falls back to the
  // saved list, so it is not a fault of the page.
  const external = (u) => (u ?? "").startsWith("https://api.github.com/");
  page.on("console", (m) => m.type() === "error" && !external(m.location()?.url) && problems.push(`[${vp.name}] console: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`[${vp.name}] page error: ${e.message}`));
  page.on("requestfailed", (r) => !external(r.url()) && problems.push(`[${vp.name}] failed request: ${r.url()}`));

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  for (const id of SCREENS) {
    const started = Date.now();
    const guard = setTimeout(() => {
      console.log(`  [${vp.name}] ${id} is taking over 25s`);
    }, 25000);
    await page.evaluate((h) => (window.location.hash = h), id);
    // screens appear fully drawn; a short pause lets fonts and layout settle
    await page.waitForTimeout(vp.shots ? 600 : 400);

    if (!(await page.$(`section#${id}`))) {
      problems.push(`[${vp.name}] screen #${id} did not render`);
      continue;
    }
    if (vp.shots) {
      await page.screenshot({ path: join(outDir, `${id}.png`) });
      console.log(`wrote ${id}.png`);
    }

    const text = await page.evaluate(() => document.querySelector("main")?.innerText ?? "");
    for (const bad of ["undefined", "NaN", "[object Object]"]) {
      if (text.includes(bad)) problems.push(`[${vp.name}] ${id}: text contains "${bad}"`);
    }
    if (text.trim().length < 150) problems.push(`[${vp.name}] ${id}: almost empty`);

    for (const c of await clippedText(page)) problems.push(`[${vp.name}] ${id}: ${c}`);

    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (over > 1) problems.push(`[${vp.name}] ${id}: ${over}px horizontal overflow`);
    clearTimeout(guard);
    console.log(`  [${vp.name}] ${id} checked in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }

  // the drawer, open, on one screen
  if (vp.shots) {
    await page.evaluate(() => (window.location.hash = "folds"));
    await page.waitForTimeout(1500);
    const btn = await page.$("button:has-text('See the numbers')");
    if (btn) {
      await btn.click();
      await page.waitForTimeout(900);
      await page.screenshot({ path: join(outDir, "drawer.png") });
      console.log("wrote drawer.png");
      await page.keyboard.press("Escape");
    } else {
      problems.push("drawer button not found on #folds");
    }
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
  console.log("every screen renders cleanly at both laptop sizes");
}
console.log("screenshots in artifacts/screenshots/");
