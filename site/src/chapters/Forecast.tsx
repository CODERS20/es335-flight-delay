import { motion } from "framer-motion";
import { CalendarRange, Shuffle } from "lucide-react";
import type { ReactNode } from "react";
import type { Bundle } from "../lib/data";
import { COLOR } from "../lib/labels";
import { EASE, useCountUp } from "../lib/motion";
import { Chapter, DataTable, DrawerSection, Legend } from "../ui/kit";
import { FitCalendar } from "./Split";

function Ratio({ value, delay, color }: { value: number; delay: number; color: string }) {
  const { ref, value: v } = useCountUp(value, 1.6, delay);
  return (
    <span ref={ref} className="tabular font-mono text-[52px] font-semibold leading-none tracking-tight" style={{ color }}>
      {v.toFixed(2)}×
    </span>
  );
}

function Card({
  icon,
  title,
  question,
  ratio,
  color,
  delay,
  calendar,
  note,
}: {
  icon: ReactNode;
  title: string;
  question: string;
  ratio: number;
  color: string;
  delay: number;
  calendar: ReactNode;
  note: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.7, ease: EASE }}
      className="flex min-h-0 flex-col justify-center gap-4 rounded border border-line bg-ink/[0.02] px-6 py-5"
    >
      <div className="flex items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13.5px] font-semibold">
            {icon}
            {title}
          </p>
          <p className="mt-1 text-[12px] italic text-ink-muted">“{question}”</p>
        </div>
        <div className="flex flex-none items-end gap-3 text-right">
          <p className="max-w-[150px] pb-1 text-[11.5px] leading-snug text-ink-muted">{note}</p>
          <Ratio value={ratio} delay={delay + 0.6} color={color} />
        </div>
      </div>
      {calendar}
    </motion.div>
  );
}

export default function Forecast({ data }: { data: Bundle }) {
  const { p5 } = data;
  const main = p5.results[p5.chosen_model].ratio_to_base_rate;
  const sec = p5.secondary_check;
  if (!sec) return null;
  const drop = (1 - (sec.ratio_to_base_rate - 1) / (main - 1)) * 100;

  return (
    <Chapter
      step="10"
      kicker="Evaluate · The harder question"
      title={<>Interpolating is easier than forecasting</>}
      takeaway={
        <>
          Same model, same features, two different questions. Predicting flights on days we skipped
          inside a period we know is one thing; predicting a <b className="text-ink">whole future period</b> is
          much harder — and we report both.
        </>
      }
      stats={[
        { label: "Skipped days", value: main, format: (v) => `${v.toFixed(2)}×`, accent: true },
        { label: "Future period", value: sec.ratio_to_base_rate, format: (v) => `${v.toFixed(2)}×` },
        { label: "Edge lost", value: drop, format: (v) => `${v.toFixed(0)}%`, hint: "of the gain over guessing" },
      ]}
      points={[
        <>Forecasting asks the model about months it has <b className="text-ink">never seen</b> — it has to extrapolate.</>,
        <>November and December are also busier, with holiday traffic and winter weather.</>,
        <>That's why the main split draws test days from <i>every</i> month.</>,
      ]}
      drawer={{
        title: "The two designs",
        body: (
          <DrawerSection title="Same model, two splits">
            <DataTable
              head={["Design", "Test flights", "Base rate", "Curve area", "× base"]}
              rows={[
                ["Held-out days, every month", p5.test_rows.toLocaleString("en-US"), `${(p5.test_delay_rate * 100).toFixed(1)}%`, p5.results[p5.chosen_model].pr_curve_area.toFixed(4), `${main.toFixed(2)}×`],
                [`Fit months ${sec.train_months.join(",")} → test ${sec.test_months.join(",")}`, sec.test_rows.toLocaleString("en-US"), `${(sec.base_rate * 100).toFixed(1)}%`, sec.pr_curve_area.toFixed(4), `${sec.ratio_to_base_rate.toFixed(2)}×`],
              ]}
            />
          </DrawerSection>
        ),
      }}
      visualTitle="Two ways to hold data back"
      legend={<Legend items={[{ color: "rgba(42,120,214,0.45)", label: "learned from" }, { color: COLOR.s2, label: "tested on" }, { color: "rgba(120,114,100,0.2)", label: "not used" }]} />}
      visual={
        <div className="grid h-full grid-rows-2 gap-4">
          <Card
            icon={<Shuffle className="h-4 w-4 text-accent" />}
            title="Skipped days, every month"
            question="Can we predict the flights we didn't see, in a period we know?"
            ratio={main}
            color={COLOR.accent}
            delay={0.2}
            calendar={<FitCalendar data={data} mode="days" max={22} />}
            note="better than guessing — the headline result"
          />
          <Card
            icon={<CalendarRange className="h-4 w-4 text-ink-soft" />}
            title="A future period"
            question="Can we predict November and December from earlier months?"
            ratio={sec.ratio_to_base_rate}
            color={COLOR.soft}
            delay={0.45}
            calendar={<FitCalendar data={data} mode="forecast" max={22} />}
            note="better than guessing — still a real edge, much smaller"
          />
        </div>
      }
    />
  );
}
