import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { P1Dataset } from "../lib/data";
import { COLOR, axisProps } from "../lib/theme";
import { int, monthShort, pct } from "../lib/format";
import { Callout, Card, ChartFrame, Mono, Part, Pending, Pill, StepSection, SubHead, Table, Tooltip } from "./ui";

export default function Step1Data({
  p1,
  part = 1,
}: {
  p1: P1Dataset | null;
  part?: number;
}) {
  return (
    <StepSection
      id={part === 1 ? "data" : "data-audit"}
      step="1"
      title={part === 1 ? "Build one clean dataset" : "What the audit found"}
      lede={
        <>
          The raw file has 31 columns, and most of them cannot be used: they are
          recorded <em>during or after</em> the flight. This step keeps only what
          a scheduler would know in advance, removes the rows that cannot be
          labelled, measures which remaining features duplicate each other, and
          writes a single csv that every later step reads.
        </>
      }
    >
      {!p1 ? (
        <Pending what="data/p1_dataset.json" />
      ) : (
        <>
          <Part n={1} part={part}>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <ChartFrame
                title="Rows removed, and what is left"
                hint={
                  <>
                    A flight with no arrival has no arrival delay, so it cannot be
                    labelled at all. October goes for a different reason, below.
                  </>
                }
                height={220}
                table={{
                  head: ["Stage", "Removed", "Left"],
                  rows: [
                    ["Raw file", "—", int(p1.rows_raw)],
                    ...p1.cleaning_log.map((l) => [
                      l.step,
                      int(l.rows_removed),
                      int(l.rows_left),
                    ]),
                  ],
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { stage: "Raw", rows: p1.rows_raw },
                      ...p1.cleaning_log.map((l) => ({
                        stage: l.step.replace(" flights", "").replace("month(s) ", "month "),
                        rows: l.rows_left,
                      })),
                    ]}
                    layout="vertical"
                    margin={{ top: 4, right: 56, bottom: 4, left: 4 }}
                  >
                    <CartesianGrid horizontal={false} stroke={COLOR.line} />
                    <XAxis type="number" hide domain={[0, p1.rows_raw * 1.02]} />
                    <YAxis
                      type="category"
                      dataKey="stage"
                      width={132}
                      {...axisProps}
                      tick={{ fill: COLOR.inkSoft, fontSize: 12 }}
                    />
                    <RTooltip
                      content={<Tooltip formatter={(v) => int(Number(v)) + " flights"} />}
                      cursor={{ fill: "rgb(var(--surface-sunken))" }}
                    />
                    <Bar dataKey="rows" name="Flights left" radius={[0, 4, 4, 0]} barSize={16}>
                      {[0, ...p1.cleaning_log].map((_, i) => (
                        <Cell key={i} fill={i === 0 ? COLOR.inkMuted : COLOR.s1} />
                      ))}
                      <LabelList
                        dataKey="rows"
                        position="right"
                        formatter={(v: number) => int(v)}
                        style={{ fill: COLOR.inkMuted, fontSize: 11, fontVariantNumeric: "tabular-nums" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            </Card>

            <Card>
              <ChartFrame
                title="Delay rate by month"
                hint={
                  <>
                    The share of flights arriving 15 or more minutes late. It moves
                    from {pct(Math.min(...Object.values(p1.delay_rate_by_month)))} to{" "}
                    {pct(Math.max(...Object.values(p1.delay_rate_by_month)))} across the
                    year, which is why a model has to be scored against the base rate
                    of the period it is tested on.
                  </>
                }
                height={220}
                table={{
                  head: ["Month", "Flights", "Delay rate"],
                  rows: Object.entries(p1.delay_rate_by_month).map(([m, r]) => [
                    monthShort(Number(m)),
                    int(p1.rows_by_month[m]),
                    pct(r),
                  ]),
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={Object.entries(p1.delay_rate_by_month).map(([m, r]) => ({
                      month: monthShort(Number(m)),
                      rate: r,
                    }))}
                    margin={{ top: 8, right: 8, bottom: 4, left: -16 }}
                  >
                    <CartesianGrid vertical={false} stroke={COLOR.line} />
                    <XAxis dataKey="month" {...axisProps} interval={0} />
                    <YAxis
                      {...axisProps}
                      tickFormatter={(v) => `${Math.round(v * 100)}%`}
                      domain={[0, "dataMax"]}
                    />
                    <RTooltip
                      content={<Tooltip formatter={(v) => pct(Number(v))} />}
                      cursor={{ fill: "rgb(var(--surface-sunken))" }}
                    />
                    <Bar dataKey="rate" name="Delayed" fill={COLOR.s1} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            </Card>
          </div>
          </Part>

          <Part n={1} part={part}>
          <Card>
            <SubHead
              hint={
                <>
                  Two features that carry the same information make a model harder to
                  read without making it better. We measured correlation on the
                  training rows and checked for exact duplicates, then dropped on that
                  evidence rather than by intuition.
                </>
              }
            >
              Redundant features, measured then dropped
            </SubHead>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <Table
                head={["Feature pair", "Correlation"]}
                rows={Object.entries(p1.correlations)
                  .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                  .slice(0, 6)
                  .map(([pair, r]) => {
                    const [a, b] = pair.split("|");
                    const strong = Math.abs(r) >= 0.9;
                    return [
                      <span className="font-mono text-[12px]">
                        {a} <span className="text-ink-muted">·</span> {b}
                      </span>,
                      <span className="flex items-center justify-end gap-2">
                        <span
                          aria-hidden="true"
                          className="h-1.5 rounded-full"
                          style={{
                            width: `${Math.abs(r) * 48}px`,
                            background: strong ? COLOR.s2 : COLOR.line,
                          }}
                        />
                        <span className={strong ? "font-semibold text-[rgb(var(--s2))]" : ""}>
                          {r >= 0 ? "+" : ""}
                          {r.toFixed(3)}
                        </span>
                      </span>,
                    ];
                  })}
                caption="Correlation of 0.90 or above counts as redundant, a threshold set before looking."
              />

              <div>
                <p className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-ink-muted">
                  Dropped
                </p>
                <ul className="space-y-3">
                  {Object.entries(p1.dropped_features).map(([f, why]) => (
                    <li key={f} className="text-[13.5px] leading-relaxed">
                      <Mono>{f}</Mono>
                      <p className="mt-1 text-ink-soft">{why}</p>
                    </li>
                  ))}
                </ul>

                <p className="mb-2 mt-5 text-[13px] font-semibold uppercase tracking-wider text-ink-muted">
                  Kept — {p1.final_features.length} features
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {p1.final_features.map((f) => (
                    <li key={f}>
                      <Pill tone={p1.categorical_features.includes(f) ? "accent" : "neutral"}>
                        {f}
                      </Pill>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
          </Part>

          <Part n={2} part={part}>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <SubHead
                hint="Eleven months identify airports by letter code. One does not, and the lookup table cannot translate it."
              >
                The October defect
              </SubHead>
              <Table
                head={["Month", "Flights", "Numeric codes"]}
                rows={Object.entries(p1.airport_code_format_by_month).map(([m, v]) => [
                  <span className={v.pct_numeric_codes > 50 ? "text-[rgb(var(--bad))]" : ""}>
                    {monthShort(Number(m))}
                  </span>,
                  int(v.rows),
                  <span className={v.pct_numeric_codes > 50 ? "font-semibold text-[rgb(var(--bad))]" : ""}>
                    {v.pct_numeric_codes.toFixed(0)}%
                  </span>,
                ])}
                caption="Checked in code across all 5.8 million rows, not sampled."
              />
              <div className="mt-4">
                <Callout tone="warn" title="Why the whole month had to go">
                  <p>
                    October stores airport codes as numeric ids while every other month
                    uses letter codes, and the airports lookup has no numeric column to
                    translate them. Keeping it would add hundreds of airport categories
                    that appear in no other month. Our proposal had October in the
                    validation window, so this is a documented deviation forced by the
                    data.
                  </p>
                </Callout>
              </div>
            </Card>

            <Card>
              <SubHead hint="Known only during or after the flight, so each one would leak the answer.">
                Columns refused
              </SubHead>
              <ul className="flex flex-wrap gap-1.5">
                {p1.forbidden_features.map((f) => (
                  <li key={f}>
                    <Pill tone="bad">{f}</Pill>
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <Callout title="An allow-list, not a drop-list">
                  <p>
                    A column is unusable unless it is named as available at scheduling
                    time. The opposite — listing what to exclude — is one forgotten
                    column away from leaking, and{" "}
                    <Mono>ARRIVAL_DELAY</Mono> is the target itself.{" "}
                    <Mono>assert_no_leakage()</Mono> runs before every fit, so leakage
                    stops the program instead of quietly producing a flattering score.
                  </p>
                </Callout>
              </div>
            </Card>
          </div>
          </Part>

          <Part n={2} part={part}>
          <Card>
            <div className="grid gap-x-8 gap-y-4 text-[13.5px] sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  Target
                </p>
                <p className="mt-1.5 font-mono text-[12.5px]">{p1.target.rule}</p>
                <p className="mt-1 text-ink-muted">
                  the official on-time threshold, not one we chose
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  Missing values
                </p>
                <p className="tabular mt-1.5">{int(p1.scheduled_time_missing)}</p>
                <p className="mt-1 text-ink-muted">
                  filled with the training median, {p1.scheduled_time_median_train.toFixed(0)} min
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  Identical feature rows
                </p>
                <p className="tabular mt-1.5">{int(p1.identical_feature_rows)}</p>
                <p className="mt-1 text-ink-muted">
                  kept — the same leg on different dates is a different flight
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  Output
                </p>
                <p className="tabular mt-1.5">{p1.csv_size_mb} MB</p>
                <p className="mt-1 text-ink-muted">
                  one csv, {int(p1.rows_clean)} rows
                </p>
              </div>
            </div>
          </Card>
          </Part>

        </>
      )}
    </StepSection>
  );
}
