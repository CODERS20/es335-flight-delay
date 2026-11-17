import { motion } from "framer-motion";
import type { Bundle } from "../lib/data";
import { COLOR, FEATURE_LABEL, MODEL_LABEL } from "../lib/labels";
import { EASE } from "../lib/motion";
import { Chapter, DataTable, DrawerSection } from "../ui/kit";

const fmt = (n: number) => n.toLocaleString("en-US");

function Scale({ data }: { data: Bundle }) {
  const { p3, p4 } = data;
  const foldRows = p3.folds[0].fit_rows;
  const big = 172;
  const small = big * Math.sqrt(foldRows / p4.trained_on_rows);
  const texture =
    "repeating-linear-gradient(0deg, rgba(0,0,0,0.084) 0 1px, transparent 1px 8px), repeating-linear-gradient(90deg, rgba(0,0,0,0.084) 0 1px, transparent 1px 8px)";
  return (
    <div className="flex items-end justify-center gap-12">
      <div className="text-center">
        <motion.div
          className="mx-auto rounded-lg border border-s1/50"
          style={{ width: small, height: small, background: `${texture}, rgba(42,120,214,0.35)` }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, duration: 0.6, ease: EASE }}
        />
        <p className="mt-3 font-mono text-[15px] font-semibold">{fmt(foldRows)}</p>
        <p className="text-[11px] text-ink-muted">each cross-validation fit</p>
      </div>
      <motion.svg width="56" height="20" viewBox="0 0 56 20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="mb-16">
        <path d="M2 10 H48 M40 3 L50 10 L40 17" stroke={COLOR.accent} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </motion.svg>
      <div className="text-center">
        <motion.div
          className="mx-auto rounded border border-s3/60"
          style={{ width: big, height: big, background: `${texture}, rgba(27,175,122,0.35)` }}
          initial={{ width: small, height: small, opacity: 0.4 }}
          animate={{ width: big, height: big, opacity: 1 }}
          transition={{ delay: 1.0, duration: 1.2, ease: EASE }}
        />
        <p className="mt-3 font-mono text-[15px] font-semibold text-[#0B7A43]">{fmt(p4.trained_on_rows)}</p>
        <p className="text-[11px] text-ink-muted">the final model — every training row</p>
      </div>
    </div>
  );
}

function Importance({ data }: { data: Bundle }) {
  const rows = [...data.p4.importance].sort((a, b) => b.drop_in_score - a.drop_in_score);
  const max = Math.max(...rows.map((r) => r.drop_in_score));
  return (
    <div className="flex h-full flex-col justify-between">
      {rows.map((r, i) => {
        const pos = r.drop_in_score > 0.0005;
        return (
          <div key={r.feature} className="grid grid-cols-[120px_1fr_70px] items-center gap-3">
            <span className="truncate text-[12.5px] text-ink-soft">{FEATURE_LABEL[r.feature] ?? r.feature}</span>
            <div className="h-[16px] rounded-full bg-ink/[0.035]">
              {pos ? (
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: COLOR.s3 }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(r.drop_in_score / max) * 100}%` }}
                  transition={{ delay: 1.6 + i * 0.07, duration: 0.8, ease: EASE }}
                />
              ) : null}
            </div>
            <span className={`tabular text-right font-mono text-[11.5px] ${pos ? "text-ink-soft" : "text-ink-muted"}`}>
              {pos ? `−${r.drop_in_score.toFixed(3)}` : "no signal"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function Retrain({ data }: { data: Bundle }) {
  const { p3, p4 } = data;
  const top = [...p4.importance].sort((a, b) => b.drop_in_score - a.drop_in_score)[0];
  return (
    <Chapter
      step="07"
      kicker="Train · Final fit"
      title={<>Retrain on everything</>}
      takeaway={
        <>
          Cross-validation held a fifth of the days back every round. Once the settings are chosen,
          there's no reason to: the winner is refitted on <b className="text-ink">all {fmt(p4.trained_on_rows)} training flights</b> —
          nothing re-tuned.
        </>
      }
      stats={[
        { label: "Rows", value: p4.trained_on_rows / 1e6, format: (v) => `${v.toFixed(2)}M`, accent: true },
        { label: "More data", value: p4.trained_on_rows / p3.folds[0].fit_rows, format: (v) => `${v.toFixed(0)}×`, hint: "than any single fold" },
        { label: "Days", value: p4.trained_on_days, format: (v) => Math.round(v).toString() },
      ]}
      points={[
        <>Model: <b className="text-ink">{MODEL_LABEL[p4.chosen_model]}</b>, settings frozen exactly as cross-validation chose them.</>,
        <><b className="text-ink">{FEATURE_LABEL[top.feature]}</b> carries the most signal: shuffle it and the score drops most.</>,
      ]}
      drawer={{
        title: "The final model",
        body: (
          <>
            <DrawerSection title="What was frozen">
              <DataTable
                head={["", ""]}
                rows={[
                  ["Model", MODEL_LABEL[p4.chosen_model]],
                  ...Object.entries(p4.settings).map(([k, v]) => [k, String(v)]),
                  ["Decision cut-off", p4.threshold.toFixed(4)],
                  ["Training rows", fmt(p4.trained_on_rows)],
                ]}
              />
            </DrawerSection>
            <DrawerSection title="Feature importance (shuffle one column, measure the drop)">
              <DataTable
                head={["Feature", "Drop", "± std"]}
                rows={[...p4.importance]
                  .sort((a, b) => b.drop_in_score - a.drop_in_score)
                  .map((r) => [FEATURE_LABEL[r.feature] ?? r.feature, r.drop_in_score.toFixed(4), r.std.toFixed(4)])}
                caption="Measured on days a probe copy of the model was not fitted on. A value at or below zero means shuffling the column did not hurt: the model was not using it."
              />
            </DrawerSection>
          </>
        ),
      }}
      visualTitle="More data, same settings"
      visual={
        <div className="grid h-full grid-rows-[auto_1fr] gap-6">
          <Scale data={data} />
          <div className="flex min-h-0 flex-col border-t border-line pt-5">
            <p className="mb-1 text-[13px] font-semibold">What the model leans on</p>
            <p className="mb-4 text-[11.5px] text-ink-muted">How far the score falls when each input is scrambled</p>
            <div className="min-h-0 flex-1">
              <Importance data={data} />
            </div>
          </div>
        </div>
      }
    />
  );
}
