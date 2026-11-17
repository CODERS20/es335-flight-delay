import { motion } from "framer-motion";
import { Plane } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Clean from "./chapters/Clean";
import Compare from "./chapters/Compare";
import Errors from "./chapters/Errors";
import Features from "./chapters/Features";
import Folds from "./chapters/Folds";
import Forecast from "./chapters/Forecast";
import Hero from "./chapters/Hero";
import Predict from "./chapters/Predict";
import Reproduce from "./chapters/Reproduce";
import Results from "./chapters/Results";
import Retrain from "./chapters/Retrain";
import Split from "./chapters/Split";
import Threshold from "./chapters/Threshold";
import { loadAll, type Bundle } from "./lib/data";
import Deck, { type ChapterDef } from "./ui/Deck";

function Loading() {
  return (
    <div className="atmosphere flex h-dvh items-center justify-center">
      <motion.div
        className="relative z-10 flex flex-col items-center gap-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <motion.div animate={{ x: [-40, 40], opacity: [0, 1, 0] }} transition={{ duration: 1.4, repeat: Infinity }}>
          <Plane className="h-7 w-7 -rotate-45 text-accent" />
        </motion.div>
        <p className="text-[13px] text-ink-muted">Loading the flight data…</p>
      </motion.div>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAll().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  const chapters: ChapterDef[] = useMemo(() => {
    if (!data) return [];
    return [
      { id: "overview", label: "Overview", group: "Start", render: () => <Hero data={data} /> },
      { id: "predict", label: "Try the predictor", group: "Start", render: () => <Predict data={data} /> },
      { id: "clean", label: "Clean the data", group: "Prepare", render: () => <Clean data={data} /> },
      { id: "features", label: "Choose features", group: "Prepare", render: () => <Features data={data} /> },
      { id: "split", label: "Split train / test", group: "Prepare", render: () => <Split data={data} /> },
      { id: "folds", label: "Cross-validation", group: "Train", render: () => <Folds data={data} /> },
      { id: "compare", label: "Compare models", group: "Train", render: () => <Compare data={data} /> },
      { id: "threshold", label: "Pick a threshold", group: "Train", render: () => <Threshold data={data} /> },
      { id: "retrain", label: "Retrain", group: "Train", render: () => <Retrain data={data} /> },
      { id: "results", label: "Test results", group: "Evaluate", render: () => <Results data={data} /> },
      { id: "errors", label: "Errors & honesty", group: "Evaluate", render: () => <Errors data={data} /> },
      { id: "forecast", label: "Forecasting", group: "Evaluate", render: () => <Forecast data={data} /> },
      { id: "reproduce", label: "Reproduce", group: "Finish", render: () => <Reproduce data={data} /> },
    ];
  }, [data]);

  if (error) {
    return (
      <div className="atmosphere flex h-dvh items-center justify-center p-8">
        <div className="panel relative z-10 max-w-md p-6">
          <p className="font-display text-[18px] font-semibold">The data didn't load</p>
          <p className="mt-2 text-[13.5px] text-ink-soft">{error}</p>
          <p className="mt-3 text-[12.5px] text-ink-muted">
            If you opened index.html straight from disk, browsers block it from reading the data
            files. Serve the folder instead, for example with <code className="font-mono">npm run dev</code>.
          </p>
        </div>
      </div>
    );
  }
  if (!data) return <Loading />;
  return <Deck chapters={chapters} />;
}
