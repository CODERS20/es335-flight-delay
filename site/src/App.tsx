import { useEffect, useState } from "react";
import Deck, { type Slide } from "./components/Deck";
import Hero from "./components/Hero";
import Predictor from "./components/Predictor";
import Step1Data from "./components/Step1Data";
import Step2Split from "./components/Step2Split";
import Step3Select from "./components/Step3Select";
import Step4Retrain from "./components/Step4Retrain";
import Step5Evaluate from "./components/Step5Evaluate";
import Reproduce from "./components/Reproduce";
import {
  loadJSON,
  type Options,
  type P1Dataset,
  type P2Split,
  type P3Selection,
  type P4Model,
  type P5Results,
} from "./lib/data";

export default function App() {
  const [p1, setP1] = useState<P1Dataset | null>(null);
  const [p2, setP2] = useState<P2Split | null>(null);
  const [p3, setP3] = useState<P3Selection | null>(null);
  const [p4, setP4] = useState<P4Model | null>(null);
  const [p5, setP5] = useState<P5Results | null>(null);
  const [options, setOptions] = useState<Options | null>(null);

  useEffect(() => {
    loadJSON<P1Dataset>("p1_dataset.json").then(setP1);
    loadJSON<P2Split>("p2_split.json").then(setP2);
    loadJSON<P3Selection>("p3_selection.json").then(setP3);
    loadJSON<P4Model>("p4_model.json").then(setP4);
    loadJSON<P5Results>("p5_results.json").then(setP5);
    loadJSON<Options>("options.json").then(setOptions);
  }, []);

  // One screen per idea. A step that has more than one idea gets more than one
  // screen rather than a scrollbar.
  const slides: Slide[] = [
    { id: "top", label: "Overview", badge: "0", title: "Flight Delay Prediction",
      render: () => <Hero p1={p1} p2={p2} p3={p3} p5={p5} /> },
    { id: "predict", label: "Predict", badge: "▸", title: "Score a flight",
      render: () => <Predictor p4={p4} p3={p3} options={options} /> },

    { id: "data", label: "Data", badge: "1", title: "Build one clean dataset",
      render: () => <Step1Data p1={p1} part={1} /> },
    { id: "data-audit", label: "Audit", badge: "1", title: "What the audit found",
      render: () => <Step1Data p1={p1} part={2} /> },

    { id: "split", label: "Split", badge: "2", title: "Split into training and test",
      render: () => <Step2Split p2={p2} /> },

    { id: "select", label: "Folds", badge: "3", title: "How the folds work",
      render: () => <Step3Select p3={p3} part={1} /> },
    { id: "select-folds", label: "Iterations", badge: "3", title: "Each iteration",
      render: () => <Step3Select p3={p3} part={2} /> },
    { id: "select-candidates", label: "Candidates", badge: "3", title: "Every candidate",
      render: () => <Step3Select p3={p3} part={3} /> },
    { id: "select-threshold", label: "Threshold", badge: "3", title: "The decision threshold",
      render: () => <Step3Select p3={p3} part={4} /> },

    { id: "retrain", label: "Retrain", badge: "4", title: "Retrain on all training data",
      render: () => <Step4Retrain p3={p3} p4={p4} /> },

    { id: "evaluate", label: "Results", badge: "5", title: "Evaluate on the test set",
      render: () => <Step5Evaluate p3={p3} p5={p5} part={1} /> },
    { id: "evaluate-detail", label: "Errors", badge: "5", title: "Probabilities and failures",
      render: () => <Step5Evaluate p3={p3} p5={p5} part={2} /> },
    { id: "evaluate-forecast", label: "Forecast", badge: "5", title: "A future period",
      render: () => <Step5Evaluate p3={p3} p5={p5} part={3} /> },

    { id: "reproduce", label: "Reproduce", badge: "↻", title: "Reproduce this",
      render: () => <Reproduce p1={p1} /> },
  ];

  return <Deck slides={slides} />;
}
