import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { P2Split } from "../lib/data";
import { COLOR, axisProps } from "../lib/theme";
import { int, monthShort, pct } from "../lib/format";
import { Callout, Card, ChartFrame, Pending, StepSection, SubHead, Table, Tooltip } from "./ui";

/** The calendar, with the held-out days marked. This is the clearest way to
 *  show that test days come from every month and that whole days move together. */
function CalendarGrid({ p2 }: { p2: P2Split }) {
  const months = Object.keys(p2.test_days_by_month)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[2px] text-[10px]">
          <caption className="sr-only">
            Calendar of 2015 showing which days were held out for testing
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-9" />
              {Array.from({ length: 31 }, (_, i) => (
                <th
                  key={i}
                  scope="col"
                  className="w-5 pb-1 text-center font-medium text-ink-muted"
                >
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const held = new Set(p2.test_days_by_month[String(m)]);
              const nDays = p2.days_by_month[String(m)];
              return (
                <tr key={m}>
                  <th
                    scope="row"
                    className="pr-2 text-right text-[11px] font-medium text-ink-soft"
                  >
                    {monthShort(m)}
                  </th>
                  {Array.from({ length: 31 }, (_, i) => {
                    const day = i + 1;
                    if (day > nDays)
                      return <td key={day} className="h-5 w-5" aria-hidden="true" />;
                    const isTest = held.has(day);
                    return (
                      <td
                        key={day}
                        title={`${monthShort(m)} ${day}: ${isTest ? "test" : "training"}`}
                        className="h-5 w-5 rounded-[3px]"
                        style={{
                          background: isTest ? COLOR.s2 : "rgb(var(--surface-sunken))",
                          border: `1px solid ${isTest ? COLOR.s2 : "rgb(var(--line))"}`,
                        }}
                      >
                        <span className="sr-only">
                          {monthShort(m)} {day} {isTest ? "test" : "training"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-[12.5px] text-ink-soft">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-[3px]"
            style={{ background: "rgb(var(--surface-sunken))", border: "1px solid rgb(var(--line))" }}
          />
          Training day
        </span>
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-[3px]"
            style={{ background: COLOR.s2 }}
          />
          Held-out test day
        </span>
        <span className="text-ink-muted">October is absent — excluded in step 1</span>
      </div>
    </div>
  );
}

export default function Step2Split({ p2 }: { p2: P2Split | null }) {
  return (
    <StepSection
      id="split"
      step="2"
      title="Split into training and test"
      lede={
        <>
          Twenty percent of flights are held back, drawn as{" "}
          <strong>whole calendar days</strong> from every month. The test file is
          then left alone until the final step.
        </>
      }
    >
      {!p2 ? (
        <Pending what="data/p2_split.json" />
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <Card>
              <SubHead
                hint={`${p2.test_days_by_month["1"]?.length ?? 6} days from each month, chosen once with seed ${p2.seed}.`}
              >
                Which days were held out
              </SubHead>
              <CalendarGrid p2={p2} />
            </Card>

            <div className="space-y-5">
              <Callout tone="warn" title="Why whole days, and not random flights">
                <p>{p2.why_whole_days}</p>
              </Callout>
              <Callout title="Why days from every month, and not the last two months">
                <p>{p2.why_every_month}</p>
              </Callout>
              <Card>
                <Table
                  head={["", "Flights", "Delay rate"]}
                  rows={[
                    ["Training", int(p2.train_rows), pct(p2.train_delay_rate, 2)],
                    ["Test", int(p2.test_rows), pct(p2.test_delay_rate, 2)],
                  ]}
                  caption="The two delay rates should be close — they are, which is what holding out days from every month buys."
                />
              </Card>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card>
            <ChartFrame
              title="Delay rate per month, training against test"
              hint="If the split were biased towards easy or hard days, these pairs would separate. They track each other; December differs most, because which specific days are drawn matters more in the holiday weeks."
              height={200}
              table={{
                head: ["Month", "Train flights", "Test flights", "Train rate", "Test rate"],
                rows: p2.per_month.map((m) => [
                  monthShort(m.month),
                  int(m.train_rows),
                  int(m.test_rows),
                  pct(m.train_delay_rate),
                  pct(m.test_delay_rate),
                ]),
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={p2.per_month.map((m) => ({
                    month: monthShort(m.month),
                    train: m.train_delay_rate,
                    test: m.test_delay_rate,
                  }))}
                  margin={{ top: 8, right: 8, bottom: 4, left: -16 }}
                  barGap={2}
                >
                  <CartesianGrid vertical={false} stroke={COLOR.line} />
                  <XAxis dataKey="month" {...axisProps} interval={0} />
                  <YAxis
                    {...axisProps}
                    tickFormatter={(v) => `${Math.round(v * 100)}%`}
                  />
                  <RTooltip
                    content={<Tooltip formatter={(v) => pct(Number(v))} />}
                    cursor={{ fill: "rgb(var(--surface-sunken))" }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    height={28}
                    iconType="circle"
                    iconSize={8}
                    formatter={(v) => (
                      <span className="text-[12.5px] text-ink-soft">{v}</span>
                    )}
                  />
                  <Bar dataKey="train" name="Training days" fill={COLOR.s1} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="test" name="Held-out days" fill={COLOR.s2} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          </Card>

          <Card>
            <SubHead hint="Checks the split script asserts every time it runs, so the design cannot silently drift.">
              What the split guarantees
            </SubHead>
            <div className="grid gap-x-8 gap-y-3 text-[13.5px]">
              <p className="flex gap-2">
                <span style={{ color: COLOR.good }}>✓</span>
                No calendar day appears on both sides
              </p>
              <p className="flex gap-2">
                <span style={{ color: COLOR.good }}>✓</span>
                Every month, day and weekday value appears in training
              </p>
              {Object.entries(p2.unseen_categories_in_test).map(([k, v]) => (
                <p key={k} className="flex gap-2">
                  <span style={{ color: v === 0 ? COLOR.good : COLOR.bad }}>
                    {v === 0 ? "✓" : "!"}
                  </span>
                  <span className="font-mono text-[12.5px]">{k}</span>
                  <span className="text-ink-soft">
                    — {v} categories in test that training never saw
                  </span>
                </p>
              ))}
            </div>
            <div className="mt-4">
              <Callout title="The secondary check we also report">
                <p>
                  {p2.secondary_check.purpose} It is reported in step 5 beside the main
                  result, because the two answer different questions and a reader should
                  be able to see both.
                </p>
              </Callout>
            </div>
          </Card>
          </div>
        </>
      )}
    </StepSection>
  );
}
