import { AnimatePresence, motion } from "framer-motion";
import { Table2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { EASE, useCountUp } from "../lib/motion";

/* -------------------------------------------------------------------- stats */

export interface StatDef {
  label: string;
  value: number;
  format: (v: number) => string;
  hint?: ReactNode;
  accent?: boolean;
}

export function Stat({ label, value, format, hint, accent }: StatDef) {
  const { ref, value: v } = useCountUp(value);
  return (
    <div className="border-l border-line px-4 py-3 first:border-l-0 first:pl-0">
      <p className="text-[10.5px] font-semibold uppercase leading-snug tracking-[0.1em] text-ink-muted">
        {label}
      </p>
      <p
        className={`tabular mt-1 whitespace-nowrap font-serif text-[clamp(22px,2vw,30px)] font-semibold leading-none ${
          accent ? "text-accent" : "text-ink"
        }`}
      >
        <span ref={ref}>{format(v)}</span>
      </p>
      {hint ? <p className="mt-1.5 text-[11.5px] leading-snug text-ink-muted">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------- drawer */

export function Drawer({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.dataset.drawer = open ? "open" : "closed";
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-2 self-start rounded border border-line-strong bg-panel px-3.5 py-2 text-[12.5px] font-medium text-ink-soft transition hover:border-ink hover:text-ink"
      >
        <Table2 className="h-3.5 w-3.5 text-accent" />
        See the numbers
      </button>

      {createPortal(
      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label={title}
              className="fixed right-0 top-0 z-50 flex h-full w-[560px] max-w-[92vw] flex-col border-l border-line-strong bg-panel"
              initial={{ x: "100%" }}
              animate={{ x: 0, transition: { duration: 0.5, ease: EASE } }}
              exit={{ x: "100%", transition: { duration: 0.3, ease: EASE } }}
            >
              <header className="flex items-center justify-between border-b border-line px-6 py-4">
                <h3 className="font-serif text-[19px] font-semibold">{title}</h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded p-1.5 text-ink-muted transition hover:bg-ink/5 hover:text-ink"
                  autoFocus
                >
                  <X className="h-4 w-4" />
                </button>
              </header>
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">{children}</div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>,
      document.body,
      )}
    </>
  );
}

/* -------------------------------------------------------------------- table */

export function DataTable({
  head,
  rows,
  caption,
}: {
  head: string[];
  rows: ReactNode[][];
  caption?: ReactNode;
}) {
  return (
    <div>
      <table className="w-full border-collapse border-t-2 border-ink text-[12.5px] [&_th]:pt-2">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={h}
                className={`border-b border-ink pb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted ${
                  i === 0 ? "text-left" : "text-right"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-b-2 last:border-ink">
              {r.map((c, j) => (
                <td
                  key={j}
                  className={`py-2 ${j === 0 ? "text-left text-ink" : "tabular text-right font-mono text-ink-soft"}`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {caption ? <p className="mt-2 text-[11.5px] leading-relaxed text-ink-muted">{caption}</p> : null}
    </div>
  );
}

export function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-3 font-serif text-[15px] font-semibold text-ink">
        {title}
      </h4>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ legend */

export function Legend({ items }: { items: { color: string; label: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-soft">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-2">
          {it.dashed ? (
            <span className="block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: it.color }} />
          ) : (
            <span className="block h-2.5 w-2.5 rounded-[2px]" style={{ background: it.color }} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ chapter */

/**
 * Every screen has the same anatomy, so a reader learns where to look once:
 * on the left, what this step is and the one thing to take from it, with the
 * numbers that prove it; on the right, the picture of it. Detail that would
 * crowd the screen lives in the drawer.
 */
export function Chapter({
  step,
  kicker,
  title,
  takeaway,
  stats,
  points,
  drawer,
  visual,
  visualTitle,
  visualHint,
  legend,
}: {
  step?: string;
  kicker: string;
  title: ReactNode;
  takeaway: ReactNode;
  stats?: StatDef[];
  points?: ReactNode[];
  drawer?: { title: string; body: ReactNode };
  visual: ReactNode;
  visualTitle?: string;
  visualHint?: ReactNode;
  legend?: ReactNode;
}) {
  const n = step ? Number(step) : null;
  return (
    <div className="grid h-full grid-cols-[minmax(340px,0.74fr)_1.6fr] gap-8 px-10 pb-6 pt-8">
      <div className="flex min-h-0 flex-col justify-center gap-5 overflow-y-auto pr-1">
        <p className="flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
          {n != null ? <span className="font-serif text-[14px] normal-case tracking-normal">§{n}</span> : null}
          {kicker}
        </p>

        <h1 className="font-serif text-[clamp(30px,3vw,42px)] font-semibold leading-[1.1] tracking-[-0.01em] text-ink">
          {title}
        </h1>

        <p className="max-w-[48ch] font-serif text-[16.5px] leading-[1.6] text-ink-soft">{takeaway}</p>

        {stats?.length ? (
          <div
            className={`grid border-y-[1.5px] border-ink ${stats.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}
          >
            {stats.map((s) => (
              <Stat key={s.label} {...s} />
            ))}
          </div>
        ) : null}

        {points?.length ? (
          <ul className="space-y-2">
            {points.map((p, i) => (
              <li key={i} className="flex gap-3 font-serif text-[15px] leading-snug text-ink-soft">
                <span className="mt-[9px] h-[5px] w-[5px] flex-none bg-ink-soft" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {drawer ? <Drawer title={drawer.title}>{drawer.body}</Drawer> : null}
      </div>

      <figure className="panel relative m-0 flex min-h-0 flex-col overflow-hidden px-6 pb-5 pt-5">
        {legend ? <div className="mb-3 flex justify-end">{legend}</div> : null}
        <div className="relative min-h-0 flex-1">{visual}</div>
        {visualTitle || visualHint ? (
          <figcaption className="mt-4 border-t border-line pt-3 font-serif text-[13.5px] leading-relaxed text-ink-soft">
            {n != null ? <b className="font-semibold text-ink">Figure {n}. </b> : null}
            {visualTitle ? <span className="text-ink">{visualTitle}{/[.?!]$/.test(visualTitle) ? "" : "."}</span> : null}
            {visualHint ? <span className="text-ink-muted"> {visualHint}</span> : null}
          </figcaption>
        ) : null}
      </figure>
    </div>
  );
}
