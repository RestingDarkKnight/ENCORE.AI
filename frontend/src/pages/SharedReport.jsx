// SharedReport.jsx — public, no-auth read-only view of a candidate's report.
// Mounted at /r/:shareToken. Honors `show_initials_only` server-side.
// Includes a "Download PDF" button that triggers window.print() against a
// dedicated @media print stylesheet for a clean one-pager.

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Compass, Printer, Quotes, Trophy, Warning, CheckCircle } from "@phosphor-icons/react";
import api from "@/lib/api";

const REC = {
  strong_hire: { label: "Strong Hire", cls: "bg-brand-moss text-white border-brand-moss" },
  hire: { label: "Hire", cls: "bg-brand-moss/10 text-brand-moss border-brand-moss/30" },
  borderline: { label: "Borderline", cls: "bg-signal-warning/10 text-signal-warning border-signal-warning/30" },
  no_hire: { label: "No Hire", cls: "bg-signal-error/10 text-signal-error border-signal-error/30" },
};

export default function SharedReport() {
  const { shareToken } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/shared/report/${shareToken}`);
        setData(data);
      } catch (e) {
        setErr(e?.response?.data?.detail || "This share link is no longer valid.");
      } finally {
        setLoading(false);
      }
    })();
  }, [shareToken]);

  if (loading) return <FullPage><p className="text-ink-soft">Loading report&hellip;</p></FullPage>;
  if (err) return <FullPage><p className="text-ink-soft">{err}</p></FullPage>;
  if (!data) return null;

  const rec = REC[data.recommendation];

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* No-print top bar */}
      <header className="border-b border-black/[0.05] bg-white print:hidden" data-testid="shared-report-header">
        <div className="mx-auto max-w-4xl px-6 lg:px-10 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-md bg-brand flex items-center justify-center text-white">
              <Compass weight="duotone" size={15} />
            </div>
            <span className="font-display font-black text-sm tracking-tight">ENCORE</span>
            <span className="hidden sm:inline encore-overline ml-2">Shared report</span>
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            data-testid="shared-report-print"
            className="btn-quiet text-sm"
          >
            <Printer size={14} weight="duotone" /> Download PDF
          </button>
        </div>
      </header>

      <main id="shared-report-printable" className="mx-auto max-w-3xl px-6 lg:px-10 py-10 space-y-section">
        {/* Header */}
        <section className="encore-card p-7 print:shadow-none print:border-0">
          <p className="encore-overline mb-2">{data.role_title}</p>
          <h1 className="font-display text-3xl font-black tracking-tighter mb-1">{data.case_title}</h1>
          <p className="text-ink-soft text-sm">Candidate: <span className="font-medium text-ink">{data.candidate_display}</span>{data.submitted_at && (<>&nbsp;&middot;&nbsp;Submitted {new Date(data.submitted_at).toLocaleDateString()}</>)}</p>
          <div className="mt-5 flex items-center gap-5 flex-wrap">
            {data.overall_score != null && (
              <div className="flex items-center gap-4">
                <ScoreRing value={data.overall_score} />
                <div>
                  <p className="encore-overline">Overall score</p>
                  <p className="font-display text-3xl font-black tabular-nums leading-none">{data.overall_score.toFixed(1)}<span className="text-ink-soft text-base ml-1">/ 5</span></p>
                </div>
              </div>
            )}
            {rec && (
              <span className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider border rounded-full px-3 py-1.5 ${rec.cls}`}>
                <CheckCircle weight="fill" size={12} /> {rec.label}
              </span>
            )}
          </div>
          {data.summary && (
            <p className="mt-5 text-sm text-ink leading-relaxed border-l-2 border-brand-sand/40 pl-4">{data.summary}</p>
          )}
        </section>

        {/* Dimension scores */}
        {data.scores?.length > 0 && (
          <section data-testid="shared-report-scores">
            <h2 className="font-display text-2xl font-bold tracking-tight mb-5">Scoring breakdown</h2>
            <div className="space-y-4">
              {data.scores.map((s, i) => (
                <DimensionRow key={i} s={s} />
              ))}
            </div>
          </section>
        )}

        {/* Strengths + concerns */}
        <section className="grid md:grid-cols-2 gap-4 print:grid-cols-2">
          {data.strengths?.length > 0 && (
            <div className="encore-card p-5 print:shadow-none print:border print:border-black/10">
              <p className="encore-overline mb-2 inline-flex items-center gap-1.5"><Trophy weight="fill" size={11} className="text-brand-moss" /> Strengths</p>
              <ul className="text-sm space-y-1.5 list-disc list-inside text-ink">
                {data.strengths.map((s, i) => (<li key={i}>{s}</li>))}
              </ul>
            </div>
          )}
          {data.concerns?.length > 0 && (
            <div className="encore-card p-5 print:shadow-none print:border print:border-black/10">
              <p className="encore-overline mb-2 inline-flex items-center gap-1.5"><Warning weight="fill" size={11} className="text-signal-warning" /> Concerns</p>
              <ul className="text-sm space-y-1.5 list-disc list-inside text-ink">
                {data.concerns.map((s, i) => (<li key={i}>{s}</li>))}
              </ul>
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="pt-8 mt-section border-t border-black/[0.06] text-center text-xs text-ink-soft">
          Assessed with <span className="font-display font-bold text-ink">ENCORE</span> &middot; Hiring on judgment. Not trivia.
        </footer>
      </main>
    </div>
  );
}

function ScoreRing({ value }) {
  const pct = Math.max(0, Math.min(1, value / 5));
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
        <circle cx="18" cy="18" r="15.915" fill="none" stroke="rgba(10,15,26,0.08)" strokeWidth="3" />
        <motion.circle
          cx="18" cy="18" r="15.915" fill="none"
          stroke="#1A2E35" strokeWidth="3" strokeLinecap="round"
          strokeDasharray="100"
          initial={{ strokeDashoffset: 100 }}
          animate={{ strokeDashoffset: 100 - pct * 100 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
    </div>
  );
}

function DimensionRow({ s }) {
  const pct = (s.score / 5) * 100;
  return (
    <div className="encore-card p-5 print:shadow-none print:border print:border-black/10">
      <div className="flex items-baseline justify-between mb-2">
        <p className="font-medium text-ink">{s.name}</p>
        <p className="font-display font-black tabular-nums text-brand">{s.score.toFixed(1)}<span className="text-ink-soft text-xs ml-1">/ 5</span></p>
      </div>
      <div className="relative h-1.5 bg-black/[0.06] rounded-full overflow-hidden mb-3">
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-brand to-brand-moss"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      {s.quote && (
        <blockquote className="text-sm italic text-ink-soft border-l-2 border-brand-sand/40 pl-3 mb-2">
          <Quotes weight="fill" size={10} className="text-brand-sand inline-block mr-1" />
          {s.quote}
        </blockquote>
      )}
      {s.justification && <p className="text-sm text-ink leading-relaxed">{s.justification}</p>}
    </div>
  );
}

function FullPage({ children }) {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-6">
      {children}
    </div>
  );
}
