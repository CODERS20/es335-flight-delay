import { useEffect, useState } from "react";

const STEPS = [
  { id: "predict", label: "Predict" },
  { id: "data", label: "1 · Data" },
  { id: "split", label: "2 · Split" },
  { id: "select", label: "3 · Cross-validate" },
  { id: "retrain", label: "4 · Retrain" },
  { id: "evaluate", label: "5 · Evaluate" },
  { id: "reproduce", label: "Reproduce" },
];

const REPO = "https://github.com/CODERS20/es335-flight-delay";

function ThemeToggle() {
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("theme");
    } catch {
      // Private windows and blocked site data both throw here; the page must
      // still render, so we just fall back to following the system setting.
    }
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      document.documentElement.dataset.theme = saved;
    }
  }, []);

  const apply = (next: "system" | "light" | "dark") => {
    setTheme(next);
    if (next === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = next;
    }
    try {
      if (next === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", next);
    } catch {
      /* nothing to do: the choice just will not persist */
    }
  };

  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => apply(next)}
      className="rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}

export default function Nav() {
  const [active, setActive] = useState("predict");

  useEffect(() => {
    const seen = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.intersectionRatio));
        let best = "";
        let ratio = 0;
        seen.forEach((r, id) => {
          if (r > ratio) {
            ratio = r;
            best = id;
          }
        });
        if (best && ratio > 0) setActive(best);
      },
      { rootMargin: "-72px 0px -55% 0px", threshold: [0, 0.2, 0.5, 1] },
    );
    STEPS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[rgb(var(--bg)/0.85)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5 sm:px-6">
        <a href="#top" className="flex-none text-[13.5px] font-semibold tracking-tight">
          Flight Delay Prediction
        </a>

        <nav aria-label="Pipeline steps" className="min-w-0 flex-1">
          <ul className="flex gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {STEPS.map((s) => (
              <li key={s.id} className="flex-none">
                <a
                  href={`#${s.id}`}
                  aria-current={active === s.id ? "true" : undefined}
                  className={`block whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                    active === s.id
                      ? "text-accent"
                      : "text-ink-muted hover:bg-surface-sunken hover:text-ink"
                  }`}
                  style={
                    active === s.id ? { background: "rgb(var(--accent-soft))" } : undefined
                  }
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-none items-center gap-2">
          <a
            href={REPO}
            className="hidden rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink sm:block"
          >
            GitHub
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
