import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import api from "@/lib/api";
import { Trophy, ArrowRight, CheckCircle } from "@phosphor-icons/react";

const REC_PILL = {
  strong_hire: "bg-brand-moss text-white border-brand-moss",
  hire: "bg-brand-moss/10 text-brand-moss border-brand-moss/30",
  borderline: "bg-signal-warning/10 text-signal-warning border-signal-warning/30",
  no_hire: "bg-signal-error/10 text-signal-error border-signal-error/30",
};
const REC_LABEL = { strong_hire: "Strong Hire", hire: "Hire", borderline: "Borderline", no_hire: "No Hire" };

const DEC_BADGE = {
  advance: { label: "Advanced", cls: "border-brand-moss/30 text-brand-moss" },
  reject:  { label: "Rejected", cls: "border-signal-error/30 text-signal-error" },
  hold:    { label: "On hold",  cls: "border-signal-warning/30 text-signal-warning" },
};

export default function Leaderboard({ caseId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/cases/${caseId}/leaderboard`).then((r) => setData(r.data)).finally(() => setLoading(false));
  }, [caseId]);

  if (loading) return null;
  if (!data || data.rows.length < 2) return null;

  const evaluated = data.rows.filter((r) => (r.final_score != null) || r.overall_score != null);
  if (evaluated.length < 2) return null;

  return (
    <section className="encore-card p-7" data-testid="leaderboard-panel">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Trophy weight="duotone" size={18} className="text-brand-sand" />
          <h2 className="font-display text-xl font-bold tracking-tight">Compare candidates</h2>
        </div>
        <span className="text-xs text-ink-soft">Ranked by overall score</span>
      </div>

      <motion.div
        className="space-y-2"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } }}
      >
        {data.rows.filter((r) => (r.final_score != null) || r.overall_score != null).map((row, i) => {
          const recCls = REC_PILL[row.recommendation] || "bg-canvas border-black/10 text-ink-soft";
          const dec = DEC_BADGE[row.decision];
          return (
            <motion.div
              key={row.assignment.id}
              variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link
                to={`/reports/${row.assignment.id}`}
                data-testid={`leaderboard-row-${row.assignment.id}`}
                className="flex items-center gap-4 p-4 rounded-lg border border-black/[0.06] hover:bg-black/[0.02] hover:border-black/[0.12] transition-all group"
              >
                <div className="font-display text-lg font-black text-ink-soft tabular-nums w-8">#{i + 1}</div>
                <div className="font-display text-2xl font-black tracking-tighter text-brand tabular-nums w-14">
                  {(row.final_score != null ? row.final_score : row.overall_score).toFixed(1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink truncate">{row.assignment.candidate_name || row.assignment.candidate_email}</p>
                  <p className="text-xs text-ink-soft truncate">{row.summary || row.assignment.candidate_email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {row.evaluation_status === "provisional" && (
                    <span
                      data-testid={`leaderboard-pending-${row.assignment.id}`}
                      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border border-signal-warning/35 bg-signal-warning/[0.08] text-signal-warning rounded-full px-2 py-0.5"
                      title="Pending your review"
                    >
                      Pending review
                    </span>
                  )}
                  {dec && (
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 ${dec.cls}`}>
                      <CheckCircle weight="fill" size={10} /> {dec.label}
                    </span>
                  )}
                  <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider border rounded-full px-2.5 py-1 ${recCls}`}>
                    {REC_LABEL[row.recommendation]}
                  </span>
                  <ArrowRight size={14} className="text-ink-soft transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
