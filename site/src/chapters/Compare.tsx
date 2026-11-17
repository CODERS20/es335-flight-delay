import { motion } from "framer-motion";
import type { Bundle, CvResult } from "../lib/data";
import { COLOR, MODEL_COLOR, MODEL_LABEL, useSize } from "../lib/labels";
import { EASE } from "../lib/motion";
import { Chapter, DataTable, DrawerSection } from "../ui/kit";

const FAMILIES = ["logistic_regression", "random_forest", "gradient_boosting"] as const;

const settingsText = (s: Record<string, unknown>) =>
  Object.entries(s)
    .filter(([k]) => k !== "class_weight" || s[k] !== null)
    .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`)
    .join(" · ");

function DotPlot({ data }: { data: Bundle }) {
  const { p3 } = data;
  const { ref, w, h } = useSize<HTMLDivElement>();
  const cands = p3.results.filter((r) => r.model !== "majority_baseline");
  const best = p3.best;
  const worst = cands.reduce((a, b) => (a.mean_score < b.mean_score ? a : b));

  const pad = { l: 56, r: 280, t: 24, b: 42 };
  const iw = Math.max(w - pad.l - pad.r, 10);
  const ih = Math.max(h - pad.t - pad.b, 10);
  const lo = p3.base_rate - 0.02;
  const hi = best.mean_score + best.std_score + 0.012;
  const y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo)) * ih;
  const colW = iw / FAMILIES.length;
  const ticks = [0.18, 0.2, 0.22, 0.24, 0.26, 0.28, 0.3, 0.32].filter((t) => t >= lo && t <= hi);

  const xFor = (r: CvResult) => {
    const fi = FAMILIES.indexOf(r.model as (typeof FAMILIES)[number]);
    const group = cands.filter((c) => c.model === r.model).sort((a, b) => a.mean_score - b.mean_score);
    const k = group.indexOf(r);
    const span = colW * 0.5;
    const off = group.length > 1 ? (k / (group.length - 1) - 0.5) * span : 0;
    return pad.l + colW * (fi + 0.5) + off;
  };

  const bx = pad.l + iw + 34;
  const isBest = (r: CvResult) => r === cands.find((c) => c.model === best.model && JSON.stringify(c.settings) === JSON.stringify(best.settings));

  return (
    <div ref={ref} className="absolute inset-0">
      {w > 0 ? (
        <svg width={w} height={h}>
          {/* grid */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} stroke={COLOR.line} strokeDasharray="3 5" />
              <text x={pad.l - 10} y={y(t) + 4} textAnchor="end" fontSize={11} fill={COLOR.muted} fontFamily="'JetBrains Mono', monospace">
                {t.toFixed(2)}
              </text>
            </g>
          ))}

          {/* family columns */}
          {FAMILIES.map((m, i) => (
            <g key={m}>
              <rect x={pad.l + colW * i + 8} y={pad.t} width={colW - 16} height={ih} rx={14} fill="rgba(0,0,0,0.0216)" />
              <text x={pad.l + colW * (i + 0.5)} y={pad.t + ih + 26} textAnchor="middle" fontSize={12.5} fill={MODEL_COLOR[m]} fontWeight={600}>
                {MODEL_LABEL[m]}
              </text>
            </g>
          ))}

          {/* baseline */}
          <motion.line
            x1={pad.l}
            x2={pad.l + iw}
            y1={y(p3.base_rate)}
            y2={y(p3.base_rate)}
            stroke={COLOR.soft}
            strokeDasharray="6 6"
            strokeWidth={1.5}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
          />
          <text x={pad.l + 8} y={y(p3.base_rate) - 8} fontSize={11.5} fill={COLOR.soft}>
            baseline — always guess "on time" ({p3.base_rate.toFixed(3)})
          </text>

          {/* candidates */}
          {cands.map((r, i) => {
            const cx = xFor(r);
            const win = isBest(r);
            return (
              <g key={i}>
                <motion.line
                  x1={cx}
                  x2={cx}
                  y1={y(r.mean_score - r.std_score)}
                  y2={y(r.mean_score + r.std_score)}
                  stroke={MODEL_COLOR[r.model]}
                  strokeWidth={2}
                  strokeLinecap="round"
                  opacity={0.5}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: 0.8 + i * 0.07, duration: 0.5 }}
                />
                <motion.circle
                  cx={cx}
                  r={win ? 9 : 6}
                  fill={MODEL_COLOR[r.model]}
                  stroke={win ? COLOR.accent : "#FFFFFF"}
                  strokeWidth={win ? 3 : 2}
                  initial={{ cy: pad.t - 20, opacity: 0 }}
                  animate={{ cy: y(r.mean_score), opacity: 1 }}
                  transition={{ delay: 0.5 + i * 0.07, type: "spring", stiffness: 140, damping: 14 }}
                >
                  <title>{`${MODEL_LABEL[r.model]} — ${settingsText(r.settings)}: ${r.mean_score.toFixed(4)} ± ${r.std_score.toFixed(4)}`}</title>
                </motion.circle>
                {win ? (
                  <motion.text
                    x={cx}
                    y={y(r.mean_score + r.std_score) - 12}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    fill={COLOR.accent}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.8 }}
                  >
                    WINNER {r.mean_score.toFixed(4)}
                  </motion.text>
                ) : null}
              </g>
            );
          })}

          {/* the two brackets that carry the point */}
          <Bracket
            x={bx}
            y1={y(best.mean_score)}
            y2={y(worst.mean_score)}
            color={COLOR.soft}
            delay={2.0}
            label={`${(best.mean_score - worst.mean_score).toFixed(3)}`}
            sub="between settings"
          />
          <Bracket
            x={bx + 132}
            y1={y(best.mean_score)}
            y2={y(p3.base_rate)}
            color={COLOR.accent}
            delay={2.5}
            label={`${(best.mean_score - p3.base_rate).toFixed(3)}`}
            sub="model vs no model"
          />
        </svg>
      ) : null}
    </div>
  );
}

function Bracket({
  x,
  y1,
  y2,
  color,
  delay,
  label,
  sub,
}: {
  x: number;
  y1: number;
  y2: number;
  color: string;
  delay: number;
  label: string;
  sub: string;
}) {
  const d = `M${x - 8},${y1} H${x} V${y2} H${x - 8}`;
  return (
    <g>
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={2}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay, duration: 0.8, ease: EASE }}
      />
      <motion.g initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: delay + 0.6 }}>
        <text x={x + 10} y={(y1 + y2) / 2 - 4} fontSize={17} fontWeight={700} fill={color} fontFamily="'JetBrains Mono', monospace">
          {label}
        </text>
        <text x={x + 10} y={(y1 + y2) / 2 + 13} fontSize={10.5} fill={COLOR.muted}>
          {sub}
        </text>
      </motion.g>
    </g>
  );
}

export default function Compare({ data }: { data: Bundle }) {
  const { p3 } = data;
  const cands = p3.results.filter((r) => r.model !== "majority_baseline");
  const share = p3.spread_between_candidates / p3.gap_to_baseline;
  return (
    <Chapter
      step="05"
      kicker="Train · Model selection"
      title={<>Twelve candidates, one winner</>}
      takeaway={
        <>
          Three kinds of model, four settings each, all scored on the same five folds.{" "}
          <b className="text-ink">Gradient boosting wins</b> — but notice how close everyone is
          compared with the gap to having no model at all.
        </>
      }
      stats={[
        { label: "Winner", value: p3.best.mean_score, format: (v) => v.toFixed(4), accent: true, hint: MODEL_LABEL[p3.best.model] },
        { label: "Choice matters", value: share * 100, format: (v) => `${v.toFixed(0)}%`, hint: "of what having a model at all is worth" },
      ]}
      points={[
        <>Winning settings: <span className="font-mono text-[12.5px] text-ink">{settingsText(p3.best.settings)}</span></>,
        <>Weighting rare delays up made logistic regression slightly <b className="text-ink">worse</b> — so we didn't use it.</>,
        <>The features, not the settings, are the real limit on this problem.</>,
      ]}
      drawer={{
        title: "Every candidate",
        body: (
          <DrawerSection title="Mean score over the five folds">
            <DataTable
              head={["Model", "Settings", "Curve area", "± std"]}
              rows={[...cands]
                .sort((a, b) => b.mean_score - a.mean_score)
                .map((r) => [
                  MODEL_LABEL[r.model],
                  <span className="font-sans text-[11px] text-ink-muted">{settingsText(r.settings)}</span>,
                  r.mean_score.toFixed(4),
                  r.std_score.toFixed(4),
                ])}
            />
          </DrawerSection>
        ),
      }}
      visualTitle="Every candidate, scored the same way"
      visualHint="Each dot is one set of settings; the line through it is the spread across the five folds. Higher is better."
      visual={<DotPlot data={data} />}
    />
  );
}
