import type { ReactNode } from "react";

/* ---------------------------------------------------------------- layout */

export function Card({
  children,
  className = "",
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return (
    <As className={`card card-hover p-5 sm:p-6 ${className}`}>{children}</As>
  );
}

export function StepSection({
  id,
  step,
  title,
  lede,
  children,
}: {
  id: string;
  step: string;
  title: string;
  lede: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4">
      <div className="mb-6 flex items-start gap-5">
        <span
          aria-hidden="true"
          className="step-badge mt-1 flex h-9 w-9 flex-none items-center justify-center rounded-xl text-[15px] font-bold"
        >
          {step}
        </span>
        <div className="min-w-0">
          <h2 className="text-[26px] font-bold leading-tight tracking-[-0.02em] sm:text-[32px]">
            {title}
          </h2>
          <p className="mt-2.5 max-w-prose text-[15.5px] leading-relaxed text-ink-soft">
            {lede}
          </p>
        </div>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

export function SubHead({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-[16px] font-semibold tracking-[-0.01em]">{children}</h3>
      {hint ? (
        <p className="mt-1.5 max-w-prose text-[13.5px] leading-relaxed text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- stats */

export function StatCard({
  label,
  value,
  sub,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  detail?: ReactNode;
  tone?: "neutral" | "primary";
}) {
  return (
    <div
      className={`card card-hover p-5 ${
        tone === "primary" ? "ring-1 ring-[rgb(var(--s1)/0.35)]" : ""
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {label}
      </p>
      <p
        className={`tabular mt-2 text-[32px] font-bold leading-none tracking-[-0.025em] sm:text-[34px] ${
          tone === "primary" ? "stat-accent" : ""
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-2 text-[13px] text-ink-soft">{sub}</p> : null}
      {detail ? (
        <p className="mt-3 border-t border-line pt-3 text-[12.5px] leading-relaxed text-ink-muted">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- tables */

export function Table({
  head,
  rows,
  caption,
  highlight,
}: {
  head: ReactNode[];
  rows: ReactNode[][];
  caption?: ReactNode;
  highlight?: (i: number) => boolean;
}) {
  return (
    <div>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr>
              {head.map((h, i) => (
                <th
                  key={i}
                  scope="col"
                  className={`whitespace-nowrap border-b border-line-strong px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted ${
                    i === 0 ? "text-left" : "text-right"
                  }`}
                  style={{ borderColor: "rgb(var(--line-strong))" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className={highlight?.(i) ? "bg-[rgb(var(--accent-soft))]" : undefined}
              >
                {r.map((c, j) => (
                  <td
                    key={j}
                    className={`border-b border-line px-3 py-2 ${
                      j === 0
                        ? "text-left font-medium"
                        : "tabular whitespace-nowrap text-right text-ink-soft"
                    }`}
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caption ? (
        <p className="mt-3 max-w-prose text-[12.5px] leading-relaxed text-ink-muted">
          {caption}
        </p>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- figures */

/** A chart plus, always, the same numbers as a table. Nothing on this page is
 *  readable only by hovering. */
export function ChartFrame({
  title,
  hint,
  children,
  table,
  height = 300,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
  table?: { head: ReactNode[]; rows: ReactNode[][] };
  height?: number;
}) {
  return (
    <div>
      <SubHead hint={hint}>{title}</SubHead>
      <div style={{ height }} className="w-full">
        {children}
      </div>
      {table ? (
        <details className="mt-3 rounded-lg border border-line bg-surface-sunken px-4">
          <summary className="cursor-pointer py-2.5 text-[13px] font-medium text-ink-soft hover:text-ink">
            Show these numbers as a table
          </summary>
          <div className="pb-4">
            <Table head={table.head} rows={table.rows} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function Tooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string }[];
  label?: string | number;
  formatter?: (v: number | string, name?: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] shadow-lg">
      {label !== undefined ? (
        <p className="mb-1 font-semibold text-ink">{label}</p>
      ) : null}
      {payload.map((p, i) => (
        <p key={i} className="tabular flex items-center gap-2 text-ink-soft">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: p.color }}
          />
          <span>{p.name}</span>
          <span className="font-medium text-ink">
            {formatter && p.value !== undefined
              ? formatter(p.value, p.name)
              : String(p.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- messaging */

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "good";
  title?: ReactNode;
  children: ReactNode;
}) {
  const border =
    tone === "warn" ? "rgb(var(--warn))" : tone === "good" ? "rgb(var(--good))" : "rgb(var(--s1))";
  const bg =
    tone === "warn"
      ? "rgb(var(--warn-soft))"
      : tone === "good"
        ? "rgb(var(--good-soft))"
        : "rgb(var(--surface-sunken))";
  return (
    <div
      className="max-w-prose rounded-xl border-l-[3px] px-4 py-3.5 text-[13.5px] leading-relaxed"
      style={{ borderColor: border, background: bg }}
    >
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div className="text-ink-soft [&>p+p]:mt-2">{children}</div>
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "bad" | "accent";
}) {
  const map = {
    neutral: "bg-surface-sunken text-ink-soft",
    good: "text-[rgb(var(--good))]",
    bad: "text-[rgb(var(--bad))]",
    accent: "text-accent",
  } as const;
  const bg = {
    neutral: "rgb(var(--surface-sunken))",
    good: "rgb(var(--good-soft))",
    bad: "rgb(var(--bad-soft))",
    accent: "rgb(var(--accent-soft))",
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${map[tone]}`}
      style={{ background: bg }}
    >
      {children}
    </span>
  );
}

export function Pending({ what }: { what: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-surface-sunken p-6 text-[13.5px] text-ink-muted">
      <p className="font-medium text-ink-soft">Not generated yet</p>
      <p className="mt-1.5 max-w-prose">
        This panel reads <code className="font-mono text-[12.5px]">{what}</code>, which the
        pipeline has not written yet. Run the step that produces it, or serve the site
        with <code className="font-mono text-[12.5px]">npm run dev</code> from{" "}
        <code className="font-mono text-[12.5px]">site/</code>.
      </p>
    </div>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded border border-line bg-surface-sunken px-1.5 py-0.5 font-mono text-[12.5px]">
      {children}
    </code>
  );
}


/** A long step is shown as several landscape slides. Each block declares which
 *  slide it belongs to, so splitting a step is a one-line change rather than a
 *  restructuring of its markup. */
export function Part({
  n,
  part,
  children,
}: {
  n: number | number[];
  part: number;
  children: ReactNode;
}) {
  const on = Array.isArray(n) ? n.includes(part) : n === part;
  return on ? <>{children}</> : null;
}
