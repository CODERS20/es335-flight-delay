import { AnimatePresence, motion } from "framer-motion";
import { Table2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { EASE, fade, rise, stagger, useCountUp } from "../lib/motion";

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
    <motion.div
      variants={rise}
      className={`rounded-2xl border p-4 ${
        accent
          ? "border-amber/30 bg-gradient-to-br from-amber/[0.10] to-transparent"
          : "border-line bg-white/[0.02]"
      }`}
    >
      <p className="text-[10.5px] font-semibold uppercase leading-snug tracking-[0.12em] text-ink-muted">
        {label}
      </p>
      <p
        className={`tabular mt-1.5 whitespace-nowrap font-mono text-[clamp(19px,1.75vw,27px)] font-semibold leading-none tracking-tight ${
          accent ? "text-amber" : "text-ink"
        }`}
      >
        <span ref={ref}>{format(v)}</span>
      </p>
      {hint ? <p className="mt-2 text-[11.5px] leading-snug text-ink-muted">{hint}</p> : null}
    </motion.div>
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
      <motion.button
        variants={rise}
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-2 self-start rounded-full border border-line-strong bg-white/[0.03] px-4 py-2 text-[12.5px] font-medium text-ink-soft transition hover:border-amber/50 hover:text-ink"
      >
        <Table2 className="h-3.5 w-3.5 text-amber" />
        See the numbers
      </motion.button>

      {createPortal(
      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label={title}
              className="fixed right-0 top-0 z-50 flex h-full w-[560px] max-w-[92vw] flex-col border-l border-line-strong bg-[#0A1020] shadow-2xl"
              initial={{ x: "100%" }}
              animate={{ x: 0, transition: { duration: 0.5, ease: EASE } }}
              exit={{ x: "100%", transition: { duration: 0.3, ease: EASE } }}
            >
              <header className="flex items-center justify-between border-b border-line px-6 py-4">
                <h3 className="font-display text-[17px] font-semibold">{title}</h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded-lg p-1.5 text-ink-muted transition hover:bg-white/5 hover:text-ink"
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
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={h}
                className={`border-b border-line-strong pb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted ${
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
            <tr key={i} className="border-b border-line last:border-0">
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
      <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber">
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
            <span className="block h-2.5 w-2.5 rounded-[3px]" style={{ background: it.color }} />
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
  return (
    <div className="grid h-full grid-cols-[minmax(340px,0.74fr)_1.6fr] gap-7 px-9 pb-3 pt-8">
      <motion.div
        variants={stagger(0.08, 0.15)}
        initial="hidden"
        animate="show"
        className="flex min-h-0 flex-col justify-center gap-5 overflow-y-auto pr-1"
      >
        <motion.p
          variants={rise}
          className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber"
        >
          {step ? (
            <span className="rounded-md bg-amber-soft px-1.5 py-0.5 font-mono text-[10.5px] text-amber ring-1 ring-amber/30">
              {step}
            </span>
          ) : null}
          {kicker}
        </motion.p>

        <motion.h1
          variants={rise}
          className="font-display text-[clamp(30px,3.1vw,44px)] font-bold leading-[1.04] tracking-[-0.03em]"
        >
          {title}
        </motion.h1>

        <motion.p variants={rise} className="max-w-[46ch] text-[15.5px] leading-relaxed text-ink-soft">
          {takeaway}
        </motion.p>

        {stats?.length ? (
          <div className={`grid gap-3 ${stats.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {stats.map((s) => (
              <Stat key={s.label} {...s} />
            ))}
          </div>
        ) : null}

        {points?.length ? (
          <motion.ul variants={stagger(0.06)} className="space-y-2">
            {points.map((p, i) => (
              <motion.li
                key={i}
                variants={rise}
                className="flex gap-3 text-[13.5px] leading-snug text-ink-soft"
              >
                <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-amber" />
                <span>{p}</span>
              </motion.li>
            ))}
          </motion.ul>
        ) : null}

        {drawer ? <Drawer title={drawer.title}>{drawer.body}</Drawer> : null}
      </motion.div>

      <motion.div
        variants={fade}
        initial="hidden"
        animate="show"
        className="panel relative flex min-h-0 flex-col overflow-hidden p-6"
      >
        {visualTitle || legend ? (
          <header className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
            <div className="min-w-0">
              {visualTitle ? (
                <h2 className="font-display text-[16px] font-semibold tracking-tight">{visualTitle}</h2>
              ) : null}
              {visualHint ? (
                <p className="mt-1 max-w-[70ch] text-[12.5px] leading-relaxed text-ink-muted">
                  {visualHint}
                </p>
              ) : null}
            </div>
            {legend}
          </header>
        ) : null}
        <div className="relative min-h-0 flex-1">{visual}</div>
      </motion.div>
    </div>
  );
}
