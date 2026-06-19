// Reports.jsx — Manager Reports Hub.
// Top section: per-case summary cards (funnel + average score ring + recommendation distribution).
// Click a card → inline candidate mapping (ranked table) + dimension averages panel.
// Powered by /api/reports/summary and /api/reports/case/{case_id}.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";import api from "@/lib/api";
import {
  ChartLineUp, ArrowRight, ArrowLeft, Users, CheckCircle, Sparkle,
  Briefcase, PaperPlaneTilt, ChartBar, CaretRight, Trophy,
} from "@phosphor-icons/react";

const REC_LABEL = {
  strong_hire: "Strong Hire",
  hire: "Hire",
  borderline: "Borderline",
  no_hire: "No Hire",
};

const REC_COLOR = {
  strong_hire: "bg-brand-moss",
  hire: "bg-brand-moss/60",
  borderline: "bg-signal-warning/70",
  no_hire: "bg-score-weak",
};

const REC_PILL = {
  strong_hire: "bg-brand-moss text-white border-brand-moss",
  hire: "bg-brand-moss/10 text-brand-moss border-brand-moss/30",
  borderline: "bg-signal-warning/10 text-signal-warning border-signal-warning/30",
  no_hire: "bg-score-weak/10 text-score-weak border-score-weak/30",
};

const DEC_BADGE = {
  advance: { label: "Advanced", cls: "border-brand-moss/30 text-brand-moss" },
  reject: { label: "Rejected", cls: "border-score-weak/30 text-score-weak" },
  hold: { label: "On hold", cls: "border-signal-warning/30 text-signal-warning" },
};

export default function Reports() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCaseId, setSelectedCaseId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/reports/summary");
        setSummary(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="encore-card p-10 text-center text-ink-soft">Loading reports&hellip;</div>;
  }

  if (!summary || summary.cases.length === 0) {
    return <EmptyState />;
  }

  // Drill-down view
  if (selectedCaseId) {
    return (
      <CaseDrillDown
        caseId={selectedCaseId}
        onBack={() => setSelectedCaseId(null)}
      />
    );
  }

  // Summary view
  return (
    <div className="space-y-section" data-testid="reports-hub-page">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div>
          <p className="encore-overline mb-2">Reports Hub</p>
          <h1 className="text-display-2 font-display font-black">Every case. Every candidate.</h1>
          <p className="text-ink-soft mt-3 max-w-xl text-base">
            Performance across your work-simulation cases — funnel, averages, and the candidate-level detail behind each number.
          </p>
        </div>
        <div className="flex items-center gap-5 text-sm">
          <Stat label="Cases" value={summary.total_cases} />
          <Stat label="Candidates" value={summary.total_candidates} />
          <Stat label="Scored" value={summary.total_evaluated} />
        </div>
      </header>

      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-5"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
        data-testid="reports-summary-list"
      >
        {summary.cases.map((c) => (
          <motion.button
            key={c.case_id}
            variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => setSelectedCaseId(c.case_id)}
            data-testid={`reports-card-${c.case_id}`}
            className="encore-card encore-card-hover p-6 text-left group hover:-translate-y-0.5 transition-all"
          >
            <div className="flex items-start justify-between gap-5">
              <div className="min-w-0 flex-1">
                <p className="encore-overline mb-1.5 flex items-center gap-1.5">
                  <Briefcase weight="duotone" size={11} /> {c.role_title}
                </p>
                <h3 className="font-display text-xl font-bold tracking-tight mb-1 group-hover:text-brand transition-colors truncate">
                  {c.case_title}
                </h3>
                <Funnel invited={c.invited} submitted={c.submitted} evaluated={c.evaluated} />
                {c.pending_review > 0 && (
                  <span
                    data-testid={`case-pending-review-${c.case_id}`}
                    className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold uppercase tracking-wider border border-signal-warning/35 bg-signal-warning/[0.08] text-signal-warning rounded-full px-2 py-0.5"
                    title="Provisional evaluations awaiting your finalization"
                  >
                    {c.pending_review} pending review
                  </span>
                )}
              </div>
              <AverageRing value={c.avg_overall_score} />
            </div>
            <div className="mt-5 pt-5 border-t border-black/[0.05]">
              <p className="encore-overline mb-2">Recommendation mix</p>
              <RecDistribution dist={c.rec_distribution} total={c.evaluated} />
            </div>
            <div className="mt-4 flex items-center justify-end text-xs text-ink-soft">
              <span
                data-testid={`open-case-detail-${c.case_id}`}
                className="inline-flex items-center gap-1 group-hover:text-brand transition-colors"
              >
                Open detail <CaretRight weight="bold" size={12} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}

/* ----- Drill-down: candidate mapping + dimension breakdown ----- */
function CaseDrillDown({ caseId, onBack }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("score"); // score | submitted | status
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const { data } = await api.get(`/reports/case/${caseId}`);
        setReport(data);
      } finally {
        setLoading(false);
      }
    })();
  }, [caseId]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev; // cap at 3
      return [...prev, id];
    });
  };

  const sortedRows = useMemo(() => {
    if (!report) return [];
    const rows = [...report.rows];
    if (sortBy === "score") {
      rows.sort((a, b) => (b.overall_score ?? -1) - (a.overall_score ?? -1));
    } else if (sortBy === "submitted") {
      rows.sort((a, b) => (b.submitted_at || "").localeCompare(a.submitted_at || ""));
    } else {
      rows.sort((a, b) => (a.status || "").localeCompare(b.status || ""));
    }
    return rows;
  }, [report, sortBy]);

  // Dimension averages from evaluated rows only
  const dimensionAverages = useMemo(() => {
    if (!report) return [];
    const buckets = {};
    for (const r of report.rows) {
      for (const s of r.scores || []) {
        if (!buckets[s.dimension_id]) buckets[s.dimension_id] = { id: s.dimension_id, name: s.name, vals: [] };
        buckets[s.dimension_id].vals.push(s.score);
      }
    }
    return Object.values(buckets).map((b) => ({
      id: b.id,
      name: b.name,
      average: b.vals.length ? b.vals.reduce((a, x) => a + x, 0) / b.vals.length : 0,
    }));
  }, [report]);

  if (loading) {
    return <div className="encore-card p-10 text-center text-ink-soft">Loading case report&hellip;</div>;
  }
  if (!report) return null;

  return (
    <div className="space-y-section" data-testid="reports-case-drill">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink" data-testid="reports-drill-back">
        <ArrowLeft size={14} /> Back to all reports
      </button>

      <header>
        <p className="encore-overline mb-2 flex items-center gap-1.5">
          <Briefcase weight="duotone" size={11} /> {report.role_title}
        </p>
        <h1 className="text-display-2 font-display font-black">{report.case_title}</h1>
      </header>

      {/* Dimension averages */}
      {dimensionAverages.length > 0 && (
        <section data-testid="reports-dim-averages" className="encore-card p-6">
          <h2 className="font-display text-display-3 font-bold mb-5">Where candidates land, on average</h2>
          <div className="space-y-3">
            {dimensionAverages.map((d, i) => (
              <DimensionBar key={d.id} dim={d} delay={i * 0.08} />
            ))}
          </div>
        </section>
      )}

      {/* Candidate table */}
      <section>
        <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
          <h2 className="font-display text-display-3 font-bold">Candidate mapping</h2>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-ink-soft">Sort by</span>
            {["score", "submitted", "status"].map((k) => (
              <button
                key={k}
                onClick={() => setSortBy(k)}
                data-testid={`reports-sort-${k}`}
                className={`px-2.5 py-1 rounded-md border transition-colors ${
                  sortBy === k ? "bg-ink text-white border-ink" : "bg-white border-black/15 text-ink-soft hover:text-ink"
                }`}
              >
                {k === "score" ? "Score" : k === "submitted" ? "Submitted" : "Status"}
              </button>
            ))}
          </div>
        </div>

        <div className="encore-card overflow-hidden">
          <motion.div
            className="divide-y divide-black/[0.05]"
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
          >
            {sortedRows.map((row, idx) => {
              const isSelected = selectedIds.includes(row.assignment_id);
              const evaluated = row.overall_score != null;
              return (
                <motion.div
                  key={row.assignment_id}
                  variants={{ hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0 } }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className={`flex items-center gap-4 p-4 transition-colors ${isSelected ? "bg-brand/[0.04]" : "hover:bg-black/[0.02]"}`}
                  data-testid={`reports-row-${row.assignment_id}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={!evaluated || (!isSelected && selectedIds.length >= 3)}
                    onChange={() => toggleSelect(row.assignment_id)}
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`reports-row-select-${row.assignment_id}`}
                    aria-label="Select for comparison"
                    title={!evaluated ? "Only evaluated candidates can be compared" : selectedIds.length >= 3 && !isSelected ? "Maximum 3 candidates" : "Add to comparison"}
                    className="h-3.5 w-3.5 rounded border-black/20 text-brand focus:ring-brand/20 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <Link
                    to={`/reports/${row.assignment_id}?case=${caseId}`}
                    className="flex items-center gap-4 flex-1 min-w-0 group"
                  >
                    <span className="font-display text-sm font-black text-ink-soft tabular-nums w-8">#{idx + 1}</span>
                    <span className="font-display text-2xl font-black tracking-tighter text-brand tabular-nums w-14">
                      {row.overall_score != null ? row.overall_score.toFixed(1) : "—"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-ink truncate">{row.candidate_name || row.candidate_email}</p>
                      <p className="text-xs text-ink-soft truncate">
                        {row.submitted_at ? `Submitted ${new Date(row.submitted_at).toLocaleDateString()}` : `Invited ${row.invited_at ? new Date(row.invited_at).toLocaleDateString() : ""}`}
                        {" · "}
                        <StatusChip status={row.status} />
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {row.evaluation_status === "provisional" && (
                        <span
                          data-testid={`reports-row-pending-${row.assignment_id}`}
                          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border border-signal-warning/35 bg-signal-warning/[0.08] text-signal-warning rounded-full px-2 py-0.5"
                          title="Provisional — open to finalize"
                        >
                          Pending review
                        </span>
                      )}
                      {row.decision && DEC_BADGE[row.decision] && (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 ${DEC_BADGE[row.decision].cls}`}>
                          <CheckCircle weight="fill" size={10} /> {DEC_BADGE[row.decision].label}
                        </span>
                      )}
                      {row.recommendation && (
                        <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider border rounded-full px-2.5 py-1 ${REC_PILL[row.recommendation]}`}>
                          {REC_LABEL[row.recommendation]}
                        </span>
                      )}
                      <ArrowRight size={14} className="text-ink-soft transition-transform group-hover:translate-x-1" />
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* Floating compare CTA */}
      <AnimatePresence>
        {selectedIds.length >= 2 && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30"
            data-testid="reports-compare-cta-wrap"
          >
            <Link
              to={`/reports/compare/${caseId}?ids=${selectedIds.join(",")}`}
              data-testid="reports-compare-cta"
              className="btn-primary px-5 py-3 shadow-lift"
            >
              Compare {selectedIds.length} candidates <ArrowRight size={14} />
            </Link>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              data-testid="reports-compare-clear"
              className="ml-2 text-xs text-ink-soft hover:text-ink underline"
            >
              clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ----- Small components ----- */
function Stat({ label, value }) {
  return (
    <div className="text-right">
      <p className="encore-overline mb-0.5">{label}</p>
      <p className="font-display text-2xl font-black tabular-nums">{value}</p>
    </div>
  );
}

function Funnel({ invited, submitted, evaluated }) {
  return (
    <div className="flex items-center gap-3 mt-2 text-xs text-ink-soft" data-testid="reports-funnel">
      <span className="inline-flex items-center gap-1.5"><PaperPlaneTilt weight="duotone" size={13} /> <span className="tabular-nums">{invited}</span> invited</span>
      <span className="text-ink-muted">›</span>
      <span className="inline-flex items-center gap-1.5"><Users weight="duotone" size={13} /> <span className="tabular-nums">{submitted}</span> submitted</span>
      <span className="text-ink-muted">›</span>
      <span className="inline-flex items-center gap-1.5"><ChartBar weight="duotone" size={13} className="text-brand-moss" /> <span className="tabular-nums text-brand-moss font-medium">{evaluated}</span> scored</span>
    </div>
  );
}

function AverageRing({ value }) {
  const reduce = useReducedMotion();
  const has = value != null;
  const pct = has ? value / 5 : 0;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
        <circle cx="18" cy="18" r="15.915" fill="none" stroke="rgba(10,15,26,0.08)" strokeWidth="3" />
        {has && (
          <motion.circle
            cx="18" cy="18" r="15.915" fill="none"
            stroke="#1A2E35" strokeWidth="3" strokeLinecap="round"
            strokeDasharray="100"
            initial={reduce ? false : { strokeDashoffset: 100 }}
            animate={{ strokeDashoffset: 100 - pct * 100 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-base font-black leading-none tabular-nums">{has ? value.toFixed(1) : "—"}</span>
        <span className="text-[8px] text-ink-soft uppercase tracking-wider mt-0.5">avg</span>
      </div>
    </div>
  );
}

function RecDistribution({ dist, total }) {
  if (!total) return <p className="text-xs text-ink-soft">No scored candidates yet.</p>;
  const order = ["strong_hire", "hire", "borderline", "no_hire"];
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 rounded-full overflow-hidden bg-black/[0.04]">
        {order.map((k) => {
          const n = dist[k] || 0;
          const pct = (n / total) * 100;
          if (!pct) return null;
          return (
            <motion.span
              key={k}
              data-testid={`reports-rec-bar-${k}`}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className={REC_COLOR[k]}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-3 flex-wrap text-[10px]">
        {order.map((k) => (
          <span key={k} className="inline-flex items-center gap-1 text-ink-soft tabular-nums">
            <span className={`h-2 w-2 rounded-sm ${REC_COLOR[k]}`} /> {REC_LABEL[k]} <span className="font-medium text-ink">{dist[k] || 0}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function DimensionBar({ dim, delay = 0 }) {
  const pct = (dim.average / 5) * 100;
  return (
    <div data-testid={`reports-dim-${dim.id}`}>
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-sm font-medium text-ink">{dim.name}</p>
        <p className="text-sm font-display font-black tabular-nums text-brand">{dim.average.toFixed(2)}<span className="text-ink-soft text-[10px] ml-1">/ 5</span></p>
      </div>
      <div className="relative h-1.5 bg-black/[0.06] rounded-full overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-brand to-brand-moss"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

function StatusChip({ status }) {
  const cfg = {
    sent: { label: "Invited", cls: "text-ink-soft" },
    in_progress: { label: "In progress", cls: "text-signal-warning" },
    submitted: { label: "Submitted", cls: "text-brand-moss" },
  }[status] || { label: status, cls: "text-ink-soft" };
  return <span className={`font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

function EmptyState() {
  return (
    <div className="encore-card p-12 text-center max-w-xl mx-auto" data-testid="reports-empty">
      <div className="mx-auto h-12 w-12 rounded-full bg-brand-sand/10 text-brand-sand flex items-center justify-center mb-4">
        <Trophy weight="duotone" size={22} />
      </div>
      <h2 className="font-display text-2xl font-bold tracking-tight mb-2">No reports yet</h2>
      <p className="text-ink-soft mb-6">
        Once you invite a candidate and they submit, their scored report will land here alongside every other case&rsquo;s funnel and averages.
      </p>
      <Link to="/roles" className="btn-primary">
        <Sparkle weight="bold" size={14} /> Open a case to invite
      </Link>
    </div>
  );
}
