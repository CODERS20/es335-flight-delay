export const pct = (x: number | null | undefined, digits = 1) =>
  x == null ? "—" : `${(x * 100).toFixed(digits)}%`;

export const n3 = (x: number | null | undefined) =>
  x == null ? "—" : x.toFixed(3);

export const n4 = (x: number | null | undefined) =>
  x == null ? "—" : x.toFixed(4);

export const int = (x: number | null | undefined) =>
  x == null ? "—" : x.toLocaleString("en-US");

export const MONTH_NAME = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const monthShort = (m: number) => MONTH_NAME[m - 1]?.slice(0, 3) ?? String(m);

/** Turn {"C": 1.0, "class_weight": null} into "C 1, class_weight none". */
export const settingsLabel = (s: Record<string, unknown> | undefined) => {
  if (!s || Object.keys(s).length === 0) return "—";
  return Object.entries(s)
    .map(([k, v]) => `${k} ${v === null ? "none" : String(v)}`)
    .join(", ");
};
