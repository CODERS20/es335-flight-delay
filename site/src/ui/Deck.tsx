import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Github, Plane } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { EASE } from "../lib/motion";

export interface ChapterDef {
  id: string;
  /** Short name in the rail. */
  label: string;
  /** Which phase of the project the screen belongs to. */
  group: string;
  render: () => ReactNode;
}

const REPO = "https://github.com/CODERS20/es335-flight-delay";

/**
 * The walkthrough. A rail on the left always shows the whole pipeline and
 * where you are in it; the stage on the right holds one screen at a time.
 * Arrow keys, the rail, and the buttons all move between screens, and the
 * address bar follows, so a link to #folds opens on the folds.
 */
export default function Deck({ chapters }: { chapters: ChapterDef[] }) {
  const [index, setIndex] = useState(0);

  const go = useCallback(
    (next: number) => {
      const i = Math.max(0, Math.min(chapters.length - 1, next));
      if (i === index) return;
      setIndex(i);
      history.replaceState(null, "", `#${chapters[i].id}`);
    },
    [index, chapters],
  );

  useEffect(() => {
    const fromHash = () => {
      const i = chapters.findIndex((c) => c.id === location.hash.slice(1));
      if (i >= 0) setIndex(i);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [chapters]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = document.activeElement?.tagName;
      if (t === "SELECT" || t === "INPUT" || t === "TEXTAREA") return;
      if (document.body.dataset.drawer === "open") return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === "Home") {
        go(0);
      } else if (e.key === "End") {
        go(chapters.length - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, chapters.length]);

  const groups = chapters.reduce<{ name: string; items: { c: ChapterDef; i: number }[] }[]>(
    (acc, c, i) => {
      const last = acc[acc.length - 1];
      if (last && last.name === c.group) last.items.push({ c, i });
      else acc.push({ name: c.group, items: [{ c, i }] });
      return acc;
    },
    [],
  );

  const current = chapters[index];
  const progress = (index + 1) / chapters.length;

  return (
    <div className="atmosphere relative flex h-dvh w-screen overflow-hidden">
      {/* ------------------------------------------------------------ rail */}
      <aside className="relative z-10 flex w-[244px] flex-none flex-col border-r border-line bg-[rgba(7,11,22,0.6)] px-5 py-6 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => go(0)}
          className="flex items-center gap-2.5 text-left"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-soft ring-1 ring-amber/40">
            <Plane className="h-[18px] w-[18px] -rotate-45 text-amber" strokeWidth={2.2} />
          </span>
          <span className="leading-tight">
            <span className="block font-display text-[15px] font-bold tracking-tight">
              Flight Delays
            </span>
            <span className="block text-[11px] text-ink-muted">ES 335 · ML project</span>
          </span>
        </button>

        <nav aria-label="Walkthrough" className="mt-7 min-h-0 flex-1 overflow-y-auto pr-1">
          {groups.map((g) => (
            <div key={g.name} className="mb-4">
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                {g.name}
              </p>
              <ul>
                {g.items.map(({ c, i }) => {
                  const active = i === index;
                  const done = i < index;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => go(i)}
                        aria-current={active ? "step" : undefined}
                        className={`relative flex w-full items-center gap-3 rounded-lg px-2 py-[7px] text-left text-[13px] transition-colors ${
                          active ? "text-ink" : done ? "text-ink-soft hover:text-ink" : "text-ink-muted hover:text-ink-soft"
                        }`}
                      >
                        {active ? (
                          <motion.span
                            layoutId="rail-active"
                            className="absolute inset-0 rounded-lg bg-white/[0.06] ring-1 ring-white/10"
                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                          />
                        ) : null}
                        <span
                          className={`relative flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md font-mono text-[10.5px] font-semibold ${
                            active
                              ? "bg-amber text-bg"
                              : done
                                ? "bg-white/[0.07] text-ink-soft"
                                : "bg-white/[0.03] text-ink-muted"
                          }`}
                        >
                          {String(i).padStart(2, "0")}
                        </span>
                        <span className="relative truncate font-medium">{c.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-3 border-t border-line pt-4">
          <div className="mb-2 flex items-center justify-between text-[11px] text-ink-muted">
            <span>Progress</span>
            <span className="tabular font-mono">
              {String(index + 1).padStart(2, "0")} / {String(chapters.length).padStart(2, "0")}
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-s1 via-amber to-amber"
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.6, ease: EASE }}
            />
          </div>

          {/* The controls live here, in the rail, so they can never sit on top
              of a chart. The arrow keys do the same thing. */}
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => go(index - 1)}
              disabled={index === 0}
              aria-label="Previous screen"
              className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-line-strong text-ink-soft transition hover:border-white/30 hover:text-ink disabled:opacity-30"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              disabled={index === chapters.length - 1}
              className="flex h-10 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl bg-amber pl-3.5 pr-3 text-[12.5px] font-semibold text-bg shadow-glow transition hover:brightness-110 disabled:opacity-30 disabled:shadow-none"
            >
              <span className="truncate">
                {index < chapters.length - 1 ? chapters[index + 1].label : "The end"}
              </span>
              <ArrowRight className="h-4 w-4 flex-none" />
            </button>
          </div>
          <p className="mt-2 text-center text-[10.5px] text-ink-muted">or use ← → on your keyboard</p>

          <a
            href={REPO}
            className="mt-3 flex items-center gap-2 text-[12px] text-ink-muted transition-colors hover:text-ink"
          >
            <Github className="h-3.5 w-3.5" /> Source on GitHub
          </a>
        </div>
      </aside>

      {/* ----------------------------------------------------------- stage */}
      <main className="relative z-10 min-w-0 flex-1">
        <AnimatePresence key={current.id} initial={false}>
          <section id={current.id} className="absolute inset-0">
            {current.render()}
          </section>
        </AnimatePresence>

      </main>
    </div>
  );
}
