// CompareCandidates.jsx — side-by-side comparison of 2–3 candidates within one case.
// Reuses /reports/case/{case_id}. Allows recording a decision inline per column.

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft, Trophy, Warning, CheckCircle, ThumbsUp, ThumbsDown, PauseCircle, Quotes,
} from "@phosphor-icons/react";
import api from "@/lib/api";

const REC = {
  strong_hire: { label: "Strong Hire", cls: "bg-brand-moss text-white border-brand-moss" },
  hire: { label: "Hire", cls: "bg-brand-moss/10 text-brand-moss border-brand-moss/30" },
  borderline: { label: "Borderline", cls: "bg-signal-warning/10 text-signal-warning border-signal-warning/30" },
  no_hire: { label: "No Hire", cls: "bg-signal-error/10 text-signal-error border-signal-error/30" },
};
const DEC = [
  { id: "advance", label: "Advance", icon: ThumbsUp, cls: "border-brand-moss/30 hover:bg-brand-moss/5 text-brand-moss" },
  { id: "hold",    label: "Hold",    icon: PauseCircle, cls: "border-signal-warning/30 hover:bg-signal-warning/5 text-signal-warning" },
  { id: "reject",  label: "Reject",  icon: ThumbsDown, cls: "border-signal-error/30 hover:bg-signal-error/5 text-signal-error" },
];

export default function CompareCandidates() {
  const { caseId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ids = (params.get("ids") || "").split(",").filter(Boolean);
  const [report, setReport] = useState(null);
  const [decisions, setDecisions] = useState({}); // assignment_id → outcome

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/reports/case/${caseId}`);
        setReport(data);
        // Seed decisions from rows
        const seed = {};
        for (const r of data.rows) {
          if (r.decision) seed[r.assignment_id] = r.decision;
        }
        setDecisions(seed);
      } catch (e) {
        toast.error(e?.response?.data?.detail || "Couldn\u2019t load comparison.");
      }
    })();
  }, [caseId]);

  const columns = useMemo(() => {
    if (!report) return [];
    return ids.map((id) => report.rows.find((r) => r.assignment_id === id)).filter(Boolean);
  }, [report, ids]);

  // Build aligned dimension axis from the rubric (so even if a row has missing dims, the layout matches)
  const dimensionAxis = useMemo(() => {
    if (!report) return [];
    return report.rubric.map((r) => ({ id: r.id, name: r.name, weight: r.weight }));
  }, [report]);

  const recordDecision = async (row, outcome) => {
    try {
      // Look up response_id via report (we don't have it directly — fall back to fetching by-assignment)
      const respResp = await api.get(`/responses/by-assignment/${row.assignment_id}`);
      await api.post("/decisions", { response_id: respResp.data.id, outcome, note: "" });
      setDecisions((d) => ({ ...d, [row.assignment_id]: outcome }));
      toast.success(`${row.candidate_name || row.candidate_email}: ${outcome}.`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn\u2019t save decision.");
    }
  };

  if (!report) return <div className="text-center text-ink-soft py-16">Loading comparison&hellip;</div>;
  if (columns.length < 2) {
    return (
      <div className="encore-card p-10 text-center max-w-xl mx-auto">
        <p className="text-ink-soft mb-4">Pick at least 2 candidates from a case to compare.</p>
        <Link to="/reports" className="btn-primary">Back to Reports</Link>
      </div>
    );
  }

  const colWidth = `minmax(0, 1fr)`;
  const gridTemplate = `260px ${columns.map(() => colWidth).join(" ")}`;

  return (
    <div className="max-w-6xl mx-auto space-y-section" data-testid="compare-candidates-page">
      <button
        type="button"
        onClick={() => navigate(`/reports`)}
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
        data-testid="compare-back"
      >
        <ArrowLeft size={14} /> Back to Reports
      </button>

      <header>
        <p className="encore-overline mb-2">Comparison</p>
        <h1 className="text-display-2 font-display font-black">{report.case_title}</h1>
        <p className="text-ink-soft mt-1 text-sm">
          {columns.length} candidate{columns.length === 1 ? "" : "s"} side-by-side &middot; aligned on the same rubric axis
        </p>
      </header>

      {/* Top row: overall + recommendation + decision actions */}
      <section className="encore-card p-6 overflow-x-auto" data-testid="compare-top-row">
        <div className="grid gap-5 items-start" style={{ gridTemplateColumns: gridTemplate, minWidth: 720 }}>
          <div className="encore-overline pt-2">Overall</div>
          {columns.map((c) => (
            <div key={c.assignment_id} data-testid={`compare-col-${c.assignment_id}`}>
              <p className="font-display text-base font-bold tracking-tight truncate mb-1">{c.candidate_name || c.candidate_email}</p>
              <p className="text-[10px] text-ink-soft truncate mb-3">{c.candidate_email}</p>
              <div className="flex items-center gap-3 mb-3">
                <OverallRing value={c.overall_score} />
                {c.recommendation && (
                  <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 ${REC[c.recommendation].cls}`}>
                    {REC[c.recommendation].label}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5" data-testid={`compare-decisions-${c.assignment_id}`}>
                {DEC.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => recordDecision(c, d.id)}
                    data-testid={`compare-decide-${d.id}-${c.assignment_id}`}
                    className={`inline-flex items-center gap-1 border rounded-md px-2 py-1 text-[11px] font-medium transition-all ${d.cls} ${decisions[c.assignment_id] === d.id ? "ring-2 ring-offset-1 ring-current" : ""}`}
                  >
                    <d.icon size={11} weight={decisions[c.assignment_id] === d.id ? "fill" : "regular"} />
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Dimension rows */}
      <section data-testid="compare-dimensions">
        <h2 className="font-display text-display-3 font-bold mb-5">Dimension breakdown</h2>
        <div className="encore-card p-6 overflow-x-auto">
          <div className="space-y-5" style={{ minWidth: 720 }}>
            {dimensionAxis.map((dim, i) => (
              <div key={dim.id} className="grid items-center gap-5" style={{ gridTemplateColumns: gridTemplate }}>
                <div className="pr-2">
                  <p className="text-sm font-medium text-ink">{dim.name}</p>
                  <p className="text-[10px] text-ink-soft">Weight {dim.weight}%</p>
                </div>
                {columns.map((c) => {
                  const s = c.scores.find((x) => x.dimension_id === dim.id);
                  const pct = s ? (s.score / 5) * 100 : 0;
                  return (
                    <div key={c.assignment_id}>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-[10px] text-ink-soft tabular-nums">{s ? `${s.score.toFixed(1)} / 5` : "—"}</span>
                      </div>
                      <div className="relative h-2 bg-black/[0.06] rounded-full overflow-hidden">
                        <motion.div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-brand to-brand-moss"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.7, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Strengths + concerns */}
      <section data-testid="compare-narratives">
        <h2 className="font-display text-display-3 font-bold mb-5">Top strength &amp; concern</h2>
        <div className="encore-card p-6 overflow-x-auto">
          <div className="grid gap-5 items-start" style={{ gridTemplateColumns: gridTemplate, minWidth: 720 }}>
            <div className="encore-overline pt-1">Per candidate</div>
            {columns.map((c) => (
              <div key={c.assignment_id} className="space-y-3">
                {c.strengths?.length > 0 && (
                  <div>
                    <p className="encore-overline mb-1 inline-flex items-center gap-1.5"><Trophy weight="fill" size={10} className="text-brand-moss" /> Strength</p>
                    <p className="text-sm text-ink leading-snug">{c.strengths[0]}</p>
                  </div>
                )}
                {c.concerns?.length > 0 && (
                  <div>
                    <p className="encore-overline mb-1 inline-flex items-center gap-1.5"><Warning weight="fill" size={10} className="text-signal-warning" /> Concern</p>
                    <p className="text-sm text-ink leading-snug">{c.concerns[0]}</p>
                  </div>
                )}
                {!c.strengths?.length && !c.concerns?.length && (
                  <p className="text-xs text-ink-soft">No evaluation yet.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function OverallRing({ value }) {
  const has = value != null;
  const pct = has ? value / 5 : 0;
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
        <circle cx="18" cy="18" r="15.915" fill="none" stroke="rgba(10,15,26,0.08)" strokeWidth="3" />
        {has && (
          <motion.circle
            cx="18" cy="18" r="15.915" fill="none"
            stroke="#1A2E35" strokeWidth="3" strokeLinecap="round"
            strokeDasharray="100"
            initial={{ strokeDashoffset: 100 }}
            animate={{ strokeDashoffset: 100 - pct * 100 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-display text-sm font-black leading-none tabular-nums">{has ? value.toFixed(1) : "—"}</span>
      </div>
    </div>
  );
}
