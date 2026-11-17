import { useMemo, useState } from "react";
import type { Options, P3Selection, P4Model } from "../lib/data";
import { COLOR, MODEL_LABEL } from "../lib/theme";
import { int, n3, pct } from "../lib/format";
import { Callout, Card, Pending, Pill } from "./ui";

/* ---------------------------------------------------------------------------
   Scoring, in the browser.

   These two functions are the whole model. `scoreFlight` adds up the fitted
   coefficients for the carrier, the two airports, the two clock hours and the
   numeric features, then squashes the total through the logistic function. The
   Python side scores the same flights through scikit-learn and the project's
   verification script fails if the two disagree by more than 1e-9, so this is
   the model itself rather than an approximation of it.
--------------------------------------------------------------------------- */
export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export function scoreFlight(
  model: P4Model["browser_model"],
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

/* ------------------------------------------------------------------- UI */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11.5px] text-ink-muted">{hint}</span> : null}
    </label>
  );
}

const selectClass =
  "w-full rounded-lg border border-line-strong bg-surface-sunken px-3 py-2 text-[14px] text-ink";

export default function Predictor({
  p4,
  p3,
  options,
}: {
  p4: P4Model | null;
  p3: P3Selection | null;
  options: Options | null;
}) {
  const origins = useMemo(
    () => (options ? Object.keys(options.routes).sort() : []),
    [options],
  );

  const [carrier, setCarrier] = useState("");
  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");
  const [hour, setHour] = useState(19);
  const [dow, setDow] = useState(5);
  const [month, setMonth] = useState(12);

  // Sensible defaults the first time the data lands, so a visitor sees a real
  // prediction without touching anything.
  const ready = p4 && options && origins.length > 0;
  const activeCarrier = carrier || options?.airlines[0]?.code || "";
  const activeOrigin = origin || (origins.includes("ORD") ? "ORD" : origins[0]) || "";
  const destsFor = (o: string) => Object.keys(options?.routes[o] ?? {}).sort();
  const dests = destsFor(activeOrigin);
  const activeDest = dests.includes(dest) ? dest : dests.includes("LAX") ? "LAX" : dests[0] || "";

  const cityOf = useMemo(() => {
    const m: Record<string, string> = {};
    options?.airports.forEach((a) => (m[a.code] = a.city));
    return m;
  }, [options]);
  const label = (code: string) => (cityOf[code] ? `${code} — ${cityOf[code]}` : code);

  const result = useMemo(() => {
    if (!ready || !activeDest) return null;
    const route = options!.routes[activeOrigin]?.[activeDest];
    if (!route) return null;
    // route = [median distance in miles, typical journey length in hours]
    const [distance, hours] = route;
    const arrHour = (hour + hours) % 24;
    const flight: Record<string, string | number> = {
      AIRLINE: activeCarrier,
      ORIGIN_AIRPORT: activeOrigin,
      DESTINATION_AIRPORT: activeDest,
      SCHED_DEP_HOUR: hour,
      SCHED_ARR_HOUR: arrHour,
      DISTANCE: distance,
      MONTH: month,
      DAY: 15,
      DAY_OF_WEEK: dow,
    };
    const p = scoreFlight(p4!.browser_model, flight);
    return { p, distance, hours, arrHour };
  }, [ready, options, p4, activeCarrier, activeOrigin, activeDest, hour, dow, month]);

  const threshold = p3?.threshold.value ?? 0.5;
  const flagged = result ? result.p >= threshold : false;

  return (
    <section id="predict" className="scroll-mt-24 pt-10 sm:pt-14">
      <Card className="border-accent/40">
        <div className="mb-6">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Score a flight
          </h2>
          <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink-soft">
            Pick a real route and departure time, as a scheduler would see it. The
            model runs <strong>in your browser</strong> from its published
            coefficients — the same arithmetic as the Python model, checked against
            it to within <code className="font-mono text-[13px]">1e-9</code>.
          </p>
        </div>

        {!ready ? (
          <Pending what="data/p4_model.json and data/options.json" />
        ) : (
          <>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
              {/* ---------------- inputs ---------------- */}
              <div className="rounded-xl border border-line bg-surface p-5">
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  Flight details
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Airline">
                    <select
                      className={selectClass}
                      value={activeCarrier}
                      onChange={(e) => setCarrier(e.target.value)}
                    >
                      {options!.airlines.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Month">
                    <select
                      className={selectClass}
                      value={month}
                      onChange={(e) => setMonth(Number(e.target.value))}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12].map((m) => (
                        <option key={m} value={m}>
                          {new Date(2015, m - 1).toLocaleString("en-US", { month: "long" })}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Origin airport">
                    <select
                      className={selectClass}
                      value={activeOrigin}
                      onChange={(e) => {
                        setOrigin(e.target.value);
                        setDest("");
                      }}
                    >
                      {origins.map((o) => (
                        <option key={o} value={o}>
                          {label(o)}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Destination airport">
                    <select
                      className={selectClass}
                      value={activeDest}
                      onChange={(e) => setDest(e.target.value)}
                    >
                      {dests.map((d) => (
                        <option key={d} value={d}>
                          {label(d)}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Scheduled departure">
                    <select
                      className={selectClass}
                      value={hour}
                      onChange={(e) => setHour(Number(e.target.value))}
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, "0")}:00
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Day of the week">
                    <select
                      className={selectClass}
                      value={dow}
                      onChange={(e) => setDow(Number(e.target.value))}
                    >
                      {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(
                        (d, i) => (
                          <option key={d} value={i + 1}>
                            {d}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                </div>

                {result ? (
                  <p className="mt-4 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-muted">
                    This route's training medians fill the rest of the row:{" "}
                    <strong className="text-ink-soft">{int(result.distance)} miles</strong>,
                    about {result.hours} hours in the air, arriving around{" "}
                    <strong className="text-ink-soft">
                      {String(result.arrHour).padStart(2, "0")}:00
                    </strong>
                    . The schedule fields follow the route rather than being set
                    independently, so the model is never asked about a flight that
                    could not exist.
                  </p>
                ) : null}
              </div>

              {/* ---------------- output ---------------- */}
              <div className="rounded-xl border border-line-strong bg-surface p-5">
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  Estimated delay risk
                </p>

                {!result ? (
                  <p className="text-[13.5px] text-ink-muted">
                    No training flights on that route — pick another destination.
                  </p>
                ) : (
                  <>
                    <p className="tabular text-[52px] font-semibold leading-none tracking-tight">
                      {pct(result.p, 1)}
                    </p>
                    <p className="mt-2 text-[13.5px] text-ink-soft">
                      model score that this flight arrives 15+ minutes late
                    </p>

                    <div
                      className="mt-5 h-3.5 w-full overflow-hidden rounded-full"
                      role="img"
                      aria-label={`Risk ${pct(result.p, 1)} against a decision threshold of ${n3(threshold)}`}
                      style={{ background: "rgb(var(--line))" }}
                    >
                      <div
                        className="h-full rounded-full transition-[width] duration-200"
                        style={{
                          width: `${Math.min(result.p * 100, 100).toFixed(1)}%`,
                          background: flagged ? COLOR.s2 : COLOR.s1,
                        }}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
                      <Pill tone={flagged ? "bad" : "good"}>
                        {flagged ? "Above the threshold" : "Below the threshold"}
                      </Pill>
                      <span className="text-ink-soft">
                        decision cut-off {n3(threshold)}
                        {flagged ? " — this flight would be flagged" : " — not flagged"}
                      </span>
                    </div>

                    <p className="mt-4 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-muted">
                      Scored with{" "}
                      {MODEL_LABEL[p4!.browser_model.kind] ?? p4!.browser_model.kind}. The
                      threshold is the one chosen during cross-validation, before the
                      test set was opened.
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="mt-5">
              <Callout tone="warn">
                <p>
                  Predictions are estimates based on historical flight data from 2015
                  and should not be treated as guaranteed flight outcomes. The model
                  cannot see weather or whether the aircraft is running late on an
                  earlier leg, which are the two largest real causes of delay.
                </p>
              </Callout>
            </div>
          </>
        )}
      </Card>
    </section>
  );
}
