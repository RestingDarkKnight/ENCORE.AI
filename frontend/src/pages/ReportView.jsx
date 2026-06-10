import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft, Sparkle, ArrowsClockwise, ThumbsUp, ThumbsDown, PauseCircle,
  Quotes, CheckCircle, Warning, FileText, Microphone, Trophy, Clock, Lightning,
} from "@phosphor-icons/react";
import api, { API_BASE } from "@/lib/api";

const REC = {
  strong_hire: { label: "Strong Hire", cls: "bg-brand-moss text-white border-brand-moss" },
  hire: { label: "Hire", cls: "bg-brand-moss/10 text-brand-moss border-brand-moss/30" },
  borderline: { label: "Borderline", cls: "bg-signal-warning/10 text-signal-warning border-signal-warning/30" },
  no_hire: { label: "No Hire", cls: "bg-signal-error/10 text-signal-error border-signal-error/30" },
};

const DECISIONS = [
  { id: "advance", label: "Advance", icon: ThumbsUp, cls: "border-brand-moss/30 hover:bg-brand-moss/5 text-brand-moss" },
  { id: "hold",    label: "Hold",    icon: PauseCircle, cls: "border-signal-warning/30 hover:bg-signal-warning/5 text-signal-warning" },
  { id: "reject",  label: "Reject",  icon: ThumbsDown, cls: "border-signal-error/30 hover:bg-signal-error/5 text-signal-error" },
];

function ScoreRing({ value, max = 5, size = 72, stroke = 6 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(10,15,26,0.08)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="#1A2E35" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          animate={{ strokeDashoffset: c - c * pct }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-xl font-black text-ink leading-none">{value.toFixed(1)}</span>
        <span className="text-[9px] text-ink-soft uppercase tracking-wider mt-0.5">/ {max}</span>
      </div>
    </div>
  );
}

export default function ReportView() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState({ assignment: null, response: null, case: null, evaluation: null, decision: null });
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [decisionNote, setDecisionNote] = useState("");

  const token = localStorage.getItem("encore.token");

  const load = useCallback(async () => {
    try {
      const a = (await api.get(`/assignments/${assignmentId}`)).data;
      const [respRes, caseRes, evalRes] = await Promise.all([
        api.get(`/responses/by-assignment/${assignmentId}`).catch(() => ({ data: null })),
        api.get(`/cases/${a.case_id}`),
        api.get(`/responses/by-assignment/${assignmentId}/evaluation`).catch(() => ({ data: null })),
      ]);
      const decision = respRes.data?.id
        ? (await api.get(`/decisions/by-response/${respRes.data.id}`).catch(() => ({ data: null }))).data
        : null;
      setData({ assignment: a, response: respRes.data, case: caseRes.data, evaluation: evalRes.data, decision });
      if (decision?.note) setDecisionNote(decision.note);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not load report.");
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => { load(); }, [load]);

  const runEvaluation = async () => {
    setEvaluating(true);
    try {
      const { data: e } = await api.post(`/responses/by-assignment/${assignmentId}/evaluate`);
      setData((d) => ({ ...d, evaluation: e }));
      toast.success("Evaluation complete.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Evaluation failed.");
    } finally {
      setEvaluating(false);
    }
  };

  const recordDecision = async (outcome) => {
    if (!data.response) return;
    try {
      const { data: d } = await api.post("/decisions", {
        response_id: data.response.id,
        outcome,
        note: decisionNote,
      });
      setData((prev) => ({ ...prev, decision: d }));
      toast.success(`Marked ${outcome}.`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not save decision.");
    }
  };

  // Map dimension_id to its anchors from the case rubric
  const anchorByDim = useMemo(() => {
    const map = {};
    (data.case?.rubric || []).forEach((d) => { map[d.id] = d.anchors; });
    return map;
  }, [data.case]);

  if (loading) return <div className="text-center text-ink-soft py-16">Loading report…</div>;
  if (!data.assignment) return <div className="text-center text-ink-soft py-16">Report not found.</div>;

  const { assignment: a, response: r, case: c, evaluation: e, decision } = data;
  const recCfg = e ? REC[e.recommendation] : null;

  return (
    <div className="max-w-5xl mx-auto space-y-10" data-testid="report-view">
      <Link to={`/cases/${a.case_id}`} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink" data-testid="report-back">
        <ArrowLeft size={14} /> Back to case
      </Link>

      {/* Header */}
      <header className="encore-card p-7">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="encore-overline mb-2">{c?.title}</p>
            <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tighter leading-[1.05]">
              {a.candidate_name || a.candidate_email}
            </h1>
            <p className="text-sm text-ink-soft mt-1">{a.candidate_email}</p>
            <div className="flex items-center gap-3 mt-4 text-xs text-ink-soft">
              <span className="inline-flex items-center gap-1"><Clock size={12} /> Submitted {a.submitted_at ? new Date(a.submitted_at).toLocaleString() : "—"}</span>
              {r?.time_taken_seconds != null && (
                <span className="inline-flex items-center gap-1"><Lightning size={12} /> {Math.round(r.time_taken_seconds / 60)} min taken</span>
              )}
            </div>
          </div>
          {e ? (
            <div className="flex items-center gap-5">
              <ScoreRing value={e.overall_score} />
              <span className={`inline-flex items-center text-sm font-bold uppercase tracking-wider border rounded-full px-4 py-2 ${recCfg.cls}`} data-testid="recommendation-pill">
                {recCfg.label}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={runEvaluation}
              disabled={evaluating || a.status !== "submitted"}
              data-testid="report-run-evaluation"
              className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover disabled:opacity-50 text-white rounded-lg px-4 py-2.5 transition-all hover:-translate-y-0.5"
            >
              <Sparkle size={14} weight="bold" />
              <span className="font-medium text-sm">{evaluating ? "Evaluating…" : "Evaluate with Claude"}</span>
            </button>
          )}
        </div>
      </header>

      {/* Not yet evaluated state */}
      {!e && a.status === "submitted" && (
        <section className="encore-card p-6 flex items-start gap-3" data-testid="not-evaluated-banner">
          <Warning weight="fill" size={18} className="text-signal-warning mt-0.5 shrink-0" />
          <p className="text-sm text-ink">
            This response hasn&rsquo;t been evaluated yet. Click <strong>Evaluate with Claude</strong> above to score it against the rubric.
            Evaluation usually takes 30–60 seconds. If the ANTHROPIC_API_KEY isn&rsquo;t set yet, you&rsquo;ll see a clear error.
          </p>
        </section>
      )}
      {a.status !== "submitted" && (
        <section className="encore-card p-6 flex items-start gap-3">
          <Warning weight="fill" size={18} className="text-signal-warning mt-0.5 shrink-0" />
          <p className="text-sm text-ink">The candidate hasn&rsquo;t submitted yet. The report unlocks after submission.</p>
        </section>
      )}

      {/* Evaluation */}
      {e && (
        <>
          {/* Summary */}
          <section className="encore-card p-7" data-testid="report-summary">
            <p className="encore-overline mb-2">Summary</p>
            <p className="text-ink leading-relaxed">{e.summary}</p>
            {e.model_used && <p className="text-xs text-ink-soft mt-3">Scored by {e.model_used}</p>}
          </section>

          {/* Strengths / concerns */}
          <section className="grid md:grid-cols-2 gap-4">
            <div className="encore-card p-6" data-testid="report-strengths">
              <p className="encore-overline mb-3 text-brand-moss flex items-center gap-1.5"><CheckCircle weight="duotone" size={14} /> Strengths</p>
              <ul className="space-y-2">
                {e.strengths.map((s, i) => (
                  <li key={i} className="text-sm text-ink flex gap-2"><span className="text-brand-moss mt-1">●</span><span>{s}</span></li>
                ))}
              </ul>
            </div>
            <div className="encore-card p-6" data-testid="report-concerns">
              <p className="encore-overline mb-3 text-signal-warning flex items-center gap-1.5"><Warning weight="duotone" size={14} /> Concerns</p>
              <ul className="space-y-2">
                {e.concerns.map((s, i) => (
                  <li key={i} className="text-sm text-ink flex gap-2"><span className="text-signal-warning mt-1">●</span><span>{s}</span></li>
                ))}
              </ul>
            </div>
          </section>

          {/* Per-dimension scores */}
          <section data-testid="report-dimensions">
            <h2 className="font-display text-2xl font-bold tracking-tight mb-5">Scoring breakdown</h2>
            <div className="space-y-4">
              {e.scores.map((s) => (
                <DimensionCard key={s.dimension_id} score={s} anchors={anchorByDim[s.dimension_id]} />
              ))}
            </div>
          </section>
        </>
      )}

      {/* Candidate work + audio */}
      {r && c && (
        <section data-testid="report-candidate-work">
          <h2 className="font-display text-2xl font-bold tracking-tight mb-5">Candidate&rsquo;s work</h2>
          <div className="space-y-4">
            {c.sections.map((sec, sidx) => (
              <div key={sec.id} className="encore-card p-6">
                <p className="encore-overline mb-1">Section {sidx + 1}</p>
                <h3 className="font-display font-bold tracking-tight">{sec.title}</h3>
                <div className="space-y-4 mt-4">
                  {sec.questions.map((q, qIdx) => {
                    const key = `${sec.id}::${qIdx}`;
                    const ans = r.answers?.[key];
                    const aud = r.audio?.[key];
                    return (
                      <div key={qIdx} className="border-l-2 border-black/[0.08] pl-4">
                        <p className="text-xs text-ink-soft mb-1">Q{qIdx + 1}: {q}</p>
                        {ans ? (
                          <p className="text-sm text-ink whitespace-pre-wrap mt-1">{ans}</p>
                        ) : !aud ? (
                          <p className="text-xs italic text-ink-soft mt-1">(no written answer)</p>
                        ) : null}
                        {aud && (
                          <div className="mt-2 flex items-center gap-3 flex-wrap" data-testid={`report-audio-${sec.id}-${qIdx}`}>
                            <span className="inline-flex items-center gap-1 text-xs text-brand-moss font-medium"><Microphone size={12} /> Voice answer</span>
                            <audio
                              controls
                              src={`${API_BASE}/responses/by-assignment/${a.id}/audio/${sec.id}/${qIdx}?t=${encodeURIComponent(token || "")}`}
                              preload="none"
                              className="h-7"
                            />
                            {aud.transcript && (
                              <details className="text-xs w-full mt-1">
                                <summary className="cursor-pointer text-ink-soft hover:text-ink">Transcript</summary>
                                <p className="mt-2 text-ink whitespace-pre-wrap bg-canvas border border-black/[0.06] rounded-lg p-3">{aud.transcript}</p>
                              </details>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Decision */}
      {r && (
        <section className="encore-card p-7" data-testid="decision-section">
          <p className="encore-overline mb-1 flex items-center gap-1.5"><Trophy size={12} /> Decision</p>
          <h2 className="font-display text-xl font-bold tracking-tight">What&rsquo;s the call?</h2>
          <textarea
            value={decisionNote}
            onChange={(ev) => setDecisionNote(ev.target.value)}
            placeholder="Optional note for your future self (or your team)."
            rows={2}
            data-testid="decision-note"
            className="w-full mt-4 bg-canvas border border-black/15 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all resize-none text-sm"
          />
          <div className="flex flex-wrap gap-3 mt-4">
            {DECISIONS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => recordDecision(d.id)}
                data-testid={`decision-${d.id}`}
                className={`inline-flex items-center gap-2 border rounded-lg px-4 py-2 text-sm font-medium transition-all hover:-translate-y-0.5 ${d.cls} ${decision?.outcome === d.id ? "ring-2 ring-offset-1 ring-current" : ""}`}
              >
                <d.icon size={14} weight={decision?.outcome === d.id ? "fill" : "regular"} />
                {d.label}
                {decision?.outcome === d.id && <CheckCircle weight="fill" size={12} />}
              </button>
            ))}
          </div>
          {decision && (
            <p className="text-xs text-ink-soft mt-3">
              Last recorded: <strong className="text-ink">{decision.outcome}</strong> · {new Date(decision.decided_at).toLocaleString()}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function DimensionCard({ score, anchors }) {
  const pct = (score.score / 5) * 100;
  return (
    <div className="encore-card p-6" data-testid={`dimension-${score.dimension_id}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <p className="encore-overline mb-1">Weight {score.weight}%</p>
          <h3 className="font-display text-lg font-bold tracking-tight">{score.name}</h3>
        </div>
        <ScoreRing value={score.score} size={64} stroke={5} />
      </div>

      {/* Anchor strip */}
      {anchors && (
        <div className="relative h-2 bg-black/[0.06] rounded-full overflow-hidden mb-4">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-y-0 left-0 bg-brand"
          />
          {[1, 3, 5].map((m) => (
            <span key={m} className="absolute top-0 bottom-0 w-px bg-white/50" style={{ left: `${(m / 5) * 100}%` }} />
          ))}
        </div>
      )}

      <p className="text-sm text-ink leading-relaxed">{score.justification}</p>

      {score.quote && (
        <blockquote className="mt-4 border-l-4 border-brand-sand bg-brand-sand/[0.05] rounded-r-lg pl-4 pr-4 py-3">
          <div className="flex items-start gap-2">
            <Quotes weight="fill" size={14} className="text-brand-sand mt-0.5 shrink-0" />
            <p className="text-sm italic text-ink leading-relaxed">{score.quote}</p>
          </div>
        </blockquote>
      )}
    </div>
  );
}
