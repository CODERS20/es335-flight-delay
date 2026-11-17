import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface Slide {
  id: string;
  /** Short label for the rail at the top. */
  label: string;
  /** Step number, or a symbol for the stages that are not pipeline steps. */
  badge: string;
  title: string;
  lede?: ReactNode;
  render: () => ReactNode;
}

const REPO = "https://github.com/CODERS20/es335-flight-delay";

function useTheme() {
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("theme");
    } catch {
      /* blocked site data: fall back to the system setting */
    }
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      document.documentElement.dataset.theme = saved;
    }
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* the choice just will not persist */
    }
  };
  return { theme, toggle };
}

/**
 * The project as a sequence of landscape screens rather than one long scroll.
 *
 * Each step of the pipeline gets the whole viewport, so a reader meets one idea
 * at a time and can see the whole of it at once. Arrow keys, the rail at the
 * top and the buttons at the bottom all move between steps, and the address bar
 * keeps the current step so a link points where it says it does.
 */
export default function Deck({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { theme, toggle } = useTheme();

  const go = useCallback(
    (next: number, dir: 1 | -1) => {
      const clamped = Math.max(0, Math.min(slides.length - 1, next));
      if (clamped === index) return;
      setDirection(dir);
      setIndex(clamped);
      history.replaceState(null, "", `#${slides[clamped].id}`);
      bodyRef.current?.scrollTo({ top: 0 });
    },
    [index, slides],
  );

  // Open on whichever step the link names, so #evaluate still works.
  useEffect(() => {
    const fromHash = () => {
      const id = location.hash.replace(/^#/, "");
      const i = slides.findIndex((s) => s.id === id);
      if (i >= 0) {
        setIndex(i);
        bodyRef.current?.scrollTo({ top: 0 });
      }
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [slides]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      // Arrow keys belong to a focused control first.
      if (el && ["SELECT", "INPUT", "TEXTAREA"].includes(el.tagName)) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        go(index + 1, 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(index - 1, -1);
      } else if (e.key === "Home") {
        e.preventDefault();
        go(0, -1);
      } else if (e.key === "End") {
        e.preventDefault();
        go(slides.length - 1, 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, slides.length]);

  const slide = slides[index];

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[rgb(var(--bg))]">
      {/* ------------------------------------------------ rail */}
      <header className="z-30 flex-none border-b border-line bg-[rgb(var(--surface))]">
        <div className="mx-auto flex max-w-[1680px] items-center gap-5 px-6 py-2.5">
          <a
            href="#top"
            onClick={() => go(0, -1)}
            className="flex-none text-[13.5px] font-bold tracking-tight"
          >
            Flight Delay Prediction
          </a>

          <nav aria-label="Pipeline steps" className="min-w-0 flex-1">
            <ol className="flex items-center gap-1">
              {slides.map((s, i) => {
                const done = i < index;
                const here = i === index;
                return (
                  <li key={s.id} className="flex min-w-0 items-center">
                    <button
                      type="button"
                      onClick={() => go(i, i > index ? 1 : -1)}
                      aria-current={here ? "step" : undefined}
                      title={s.title}
                      className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-medium transition-colors ${
                        here
                          ? "text-accent"
                          : done
                            ? "text-ink-soft hover:text-ink"
                            : "text-ink-muted hover:text-ink"
                      }`}
                      style={here ? { background: "rgb(var(--accent-soft))" } : undefined}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-md text-[10.5px] font-bold ${
                          here ? "step-badge" : done ? "bg-[rgb(var(--s3))] text-white" : ""
                        }`}
                        style={
                          here || done
                            ? undefined
                            : { background: "rgb(var(--surface-sunken))", color: "rgb(var(--ink-muted))" }
                        }
                      >
                        {done ? "✓" : s.badge}
                      </span>
                      <span className="hidden truncate lg:inline">{s.label}</span>
                    </button>
                    {i < slides.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="mx-0.5 h-px w-3 flex-none"
                        style={{ background: "rgb(var(--line))" }}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="flex flex-none items-center gap-2">
            <a
              href={REPO}
              className="rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
            >
              GitHub
            </a>
            <button
              type="button"
              onClick={toggle}
              className="rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
            >
              {theme === "dark" ? "Light" : "Dark"}
            </button>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------ slide */}
      <main
        ref={bodyRef}
        className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        tabIndex={-1}
      >
        <div
          key={slide.id}
          className={direction === 1 ? "slide-in-right" : "slide-in-left"}
        >
          <div className="mx-auto max-w-[1680px] px-6 py-7">{slide.render()}</div>
        </div>
      </main>

      {/* ------------------------------------------------ controls */}
      <footer className="z-30 flex-none border-t border-line bg-[rgb(var(--surface))]">
        <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4 px-6 py-2.5">
          <button
            type="button"
            onClick={() => go(index - 1, -1)}
            disabled={index === 0}
            className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink disabled:opacity-35"
          >
            ← {index > 0 ? slides[index - 1].label : "Back"}
          </button>

          <div className="flex min-w-0 items-center gap-3">
            <div
              className="h-1 w-40 overflow-hidden rounded-full"
              style={{ background: "rgb(var(--line))" }}
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={slides.length}
              aria-valuenow={index + 1}
              aria-label="Progress through the walkthrough"
            >
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${((index + 1) / slides.length) * 100}%`,
                  background: "linear-gradient(90deg, rgb(var(--s1)), rgb(var(--s3)))",
                }}
              />
            </div>
            <p className="tabular flex-none text-[12.5px] text-ink-muted">
              {index + 1} / {slides.length}
              <span className="ml-2 hidden sm:inline">· arrow keys to move</span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => go(index + 1, 1)}
            disabled={index === slides.length - 1}
            className="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-35"
          >
            {index < slides.length - 1 ? slides[index + 1].label : "End"} →
          </button>
        </div>
      </footer>
    </div>
  );
}
