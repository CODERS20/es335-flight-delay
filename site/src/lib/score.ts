/* ---------------------------------------------------------------------------
   Scoring, in the browser.

   `sigmoid` and `scoreFlight` are the whole model. src/check_parity.py lifts
   these two functions out of this file by name, transpiles them, and checks
   them against scikit-learn on 300 real routes -- so their text is load-bearing.
   Change them and the check will tell you whether you broke the model.
--------------------------------------------------------------------------- */
import type { BrowserModel } from "./data";

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export function scoreFlight(
  model: BrowserModel,
  f: Record<string, string | number>,
): number {
  let z = model.intercept;

  for (const col of Object.keys(model.categorical)) {
    const table = model.categorical[col] ?? {};
    const level = String(f[col]);
    if (level in table) z += table[level];
    else if (model.infrequent_level in table) z += table[model.infrequent_level];
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

/** The same sum as `scoreFlight`, broken into its parts, so the page can show
 *  which choices pushed a flight's risk up and which pulled it down. The parts
 *  plus the intercept add back to exactly the log-odds scoreFlight uses. */
export function contributions(
  model: BrowserModel,
  f: Record<string, string | number>,
): { feature: string; value: number }[] {
  const parts: { feature: string; value: number }[] = [];

  for (const col of Object.keys(model.categorical)) {
    const table = model.categorical[col] ?? {};
    const level = String(f[col]);
    let v = 0;
    if (level in table) v = table[level];
    else if (model.infrequent_level in table) v = table[model.infrequent_level];
    parts.push({ feature: col, value: v });
  }

  for (const [col, cc] of Object.entries(model.cyclic_hours)) {
    const rad = (2 * Math.PI * Number(f[col])) / 24;
    parts.push({ feature: col, value: cc.sin * Math.sin(rad) + cc.cos * Math.cos(rad) });
  }

  for (const [col, nc] of Object.entries(model.numeric)) {
    parts.push({ feature: col, value: (nc.coef * (Number(f[col]) - nc.mean)) / nc.scale });
  }

  return parts;
}
