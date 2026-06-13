import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft, Sparkle, ArrowsClockwise, ThumbsUp, ThumbsDown, PauseCircle,
  Quotes, CheckCircle, Warning, FileText, Microphone, Trophy, Clock, Lightning,
  CaretLeft, CaretRight, Share, Copy, Check, X as XIcon, EyeSlash, Eye, Printer,
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
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - c * pct }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-xl font-black text-ink leading-none tabular-nums">{value.toFixed(1)}</span>
        <span className="text-[9px] text-ink-soft uppercase tracking-wider mt-0.5">/ {max}</span>
      </div>
    </div>
  );
}

export default function ReportView() {
  const { assignmentId } = useParams();
  const [searchParams] = useSearchParams();
  const fromCase = searchParams.get("case");
  const navigate = useNavigate();
  const [data, setData] = useState({ assignment: null, response: null, case: null, evaluation: null, decision: null });
  const [siblings, setSiblings] = useState([]); // assignment_ids in same case, sorted by score
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

      // Load siblings for prev/next nav — only when arriving from Reports Hub
      if (fromCase) {
        try {
          const { data: report } = await api.get(`/reports/case/${fromCase}`);
          setSiblings(report.rows.map((r) => r.assignment_id));
        } catch { /* noop */ }
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not load report.");
    } finally {
      setLoading(false);
    }
  }, [assignmentId, fromCase]);

  useEffect(() => { load(); }, [load]);

  // ---------- Share state ----------
  const [shareOpen, setShareOpen] = useState(false);
  const [shareData, setShareData] = useState(null); // { share_token, share_url, show_initials_only }
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!assignmentId) return;
    (async () => {
      try {
        const { data } = await api.get(`/reports/${assignmentId}/share`);
        setShareData(data || null);
      } catch { /* noop */ }
    })();
  }, [assignmentId]);

  const generateShare = async (initialsOnly = true) => {
    setShareBusy(true);
    try {
      const { data: s } = await api.post(`/reports/${assignmentId}/share`, { show_initials_only: initialsOnly });
      setShareData(s);
      toast.success("Share link ready.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn\u2019t create share link.");
    } finally {
      setShareBusy(false);
    }
  };

  const revokeShare = async () => {
    if (!window.confirm("Revoke this share link? Anyone with the URL will lose access.")) return;
    setShareBusy(true);
    try {
      await api.delete(`/reports/${assignmentId}/share`);
      setShareData(null);
      toast.success("Share link revoked.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn\u2019t revoke.");
    } finally {
      setShareBusy(false);
    }
  };

  const copyShareUrl = async () => {
    if (!shareData) return;
    const fullUrl = `${window.location.origin}${shareData.share_url}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn\u2019t copy to clipboard.");
    }
  };

  // ---------- Outcomes captured on this candidate ----------
  const [outcomes, setOutcomes] = useState([]);
  useEffect(() => {
    if (!assignmentId) return;
    (async () => {
      try {
        const { data } = await api.get(`/outcomes/by-assignment/${assignmentId}`);
        setOutcomes(data || []);
      } catch { /* noop */ }
    })();
  }, [assignmentId]);

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

  if (loading) return <div className="text-center text-ink-soft py-16">Loading report&hellip;</div>;
  if (!data.assignment) return <div className="text-center text-ink-soft py-16">Report not found.</div>;

  const { assignment: a, response: r, case: c, evaluation: e, decision } = data;
  const recCfg = e ? REC[e.recommendation] : null;

  // Prev/next neighbour computation
  const curIdx = siblings.indexOf(assignmentId);
  const prevId = curIdx > 0 ? siblings[curIdx - 1] : null;
  const nextId = curIdx >= 0 && curIdx < siblings.length - 1 ? siblings[curIdx + 1] : null;

  return (
    <div className="max-w-5xl mx-auto space-y-10" id="shared-report-printable" data-testid="report-view">
      {/* Breadcrumb + prev/next */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <nav className="flex items-center gap-1.5 text-sm text-ink-soft flex-wrap" data-testid="report-breadcrumb">
          {fromCase ? (
            <>
              <Link to="/reports" className="hover:text-ink">Reports</Link>
              <CaretRight size={11} className="text-ink-muted" />
              <Link to="/reports" onClick={(ev) => { ev.preventDefault(); navigate(-1); }} className="hover:text-ink">{c?.title || "Case"}</Link>
              <CaretRight size={11} className="text-ink-muted" />
              <span className="text-ink truncate max-w-[12rem]">{a.candidate_name || a.candidate_email}</span>
            </>
          ) : (
            <Link to={`/cases/${a.case_id}`} className="inline-flex items-center gap-1.5 hover:text-ink" data-testid="report-back">
              <ArrowLeft size={14} /> Back to case
            </Link>
          )}
        </nav>
        {siblings.length > 1 && (
          <div className="flex items-center gap-1" data-testid="report-siblings-nav">
            <button
              type="button"
              onClick={() => prevId && navigate(`/reports/${prevId}?case=${fromCase}`)}
              disabled={!prevId}
              data-testid="report-prev-candidate"
              className="inline-flex items-center gap-1 text-xs font-medium border border-black/15 hover:border-black/30 hover:bg-black/[0.02] disabled:opacity-40 disabled:hover:bg-transparent rounded-lg px-2.5 py-1.5 transition-colors"
              title="Previous candidate"
            >
              <CaretLeft size={12} /> Prev
            </button>
            <span className="text-xs text-ink-soft tabular-nums px-2">
              {curIdx + 1} / {siblings.length}
            </span>
            <button
              type="button"
              onClick={() => nextId && navigate(`/reports/${nextId}?case=${fromCase}`)}
              disabled={!nextId}
              data-testid="report-next-candidate"
              className="inline-flex items-center gap-1 text-xs font-medium border border-black/15 hover:border-black/30 hover:bg-black/[0.02] disabled:opacity-40 disabled:hover:bg-transparent rounded-lg px-2.5 py-1.5 transition-colors"
              title="Next candidate"
            >
              Next <CaretRight size={12} />
            </button>
          </div>
        )}
        {/* Share + Print actions — always available when an evaluation exists */}
        {e && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              data-testid="report-share-button"
              className="inline-flex items-center gap-1.5 text-xs font-medium border border-black/15 hover:border-black/30 hover:bg-black/[0.02] rounded-lg px-2.5 py-1.5 transition-colors"
            >
              <Share size={12} /> Share
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              data-testid="report-print-button"
              className="inline-flex items-center gap-1.5 text-xs font-medium border border-black/15 hover:border-black/30 hover:bg-black/[0.02] rounded-lg px-2.5 py-1.5 transition-colors"
            >
              <Printer size={12} /> PDF
            </button>
          </div>
        )}
      </div>

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
          ) : a.status === "submitted" ? (
            <button
              type="button"
              onClick={runEvaluation}
              disabled={evaluating}
              data-testid="report-run-evaluation"
              className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover disabled:opacity-50 text-white rounded-lg px-4 py-2.5 transition-all hover:-translate-y-0.5"
            >
              <Sparkle size={14} weight="bold" />
              <span className="font-medium text-sm">{evaluating ? "Scoring against the rubric…" : "Evaluate with Claude"}</span>
            </button>
          ) : null}
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
            <motion.div
              className="space-y-4"
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } } }}
            >
              {e.scores.map((s) => (
                <motion.div
                  key={s.dimension_id}
                  variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  <DimensionCard score={s} anchors={anchorByDim[s.dimension_id]} />
                </motion.div>
              ))}
            </motion.div>
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
      {r && a.status === "submitted" && (
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

      {/* Captured 30/90-day outcomes */}
      {outcomes.length > 0 && (
        <section className="encore-card p-7" data-testid="outcomes-section">
          <p className="encore-overline mb-1">Post-hire outcomes</p>
          <h2 className="font-display text-xl font-bold tracking-tight">How this hire is doing</h2>
          <div className="mt-4 grid sm:grid-cols-2 gap-3" data-testid="outcomes-list">
            {outcomes.map((o) => (
              <div key={o.id} className="border border-black/[0.06] rounded-lg p-4" data-testid={`outcome-${o.window}`}>
                <p className="encore-overline mb-1">{o.window === "30d" ? "30-day check-in" : "90-day check-in"}</p>
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-display font-black text-lg tabular-nums text-brand">{o.performing}/5</span>
                  <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 ${o.would_hire_again ? "border-brand-moss/30 text-brand-moss" : "border-signal-error/30 text-signal-error"}`}>
                    {o.would_hire_again ? "Would hire again" : "Would not"}
                  </span>
                </div>
                {o.comment && <p className="text-sm text-ink mt-2 leading-relaxed">{o.comment}</p>}
                <p className="text-[10px] text-ink-soft mt-2">Recorded {new Date(o.recorded_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Share modal */}
      {shareOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/30 backdrop-blur-sm" data-testid="share-modal">
          <div className="bg-white rounded-xl shadow-lift max-w-md w-full p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="encore-overline mb-1">Share this report</p>
                <h3 className="font-display text-xl font-bold tracking-tight">Read-only public link</h3>
              </div>
              <button onClick={() => setShareOpen(false)} className="p-1 hover:bg-black/[0.04] rounded-md text-ink-soft" data-testid="share-modal-close">
                <XIcon size={16} />
              </button>
            </div>

            {shareData ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <input
                    readOnly
                    value={`${window.location.origin}${shareData.share_url}`}
                    data-testid="share-url-input"
                    className="flex-1 bg-canvas border border-black/10 rounded-lg px-3 py-2 text-xs font-mono text-ink-soft focus:ring-2 focus:ring-brand/20 outline-none"
                  />
                  <button
                    type="button"
                    onClick={copyShareUrl}
                    data-testid="share-copy-button"
                    className="btn-quiet text-sm px-3 py-2"
                  >
                    {copied ? <Check size={13} className="text-brand-moss" /> : <Copy size={13} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>

                <label className="flex items-start gap-2 cursor-pointer mb-5">
                  <input
                    type="checkbox"
                    checked={!!shareData.show_initials_only}
                    onChange={(ev) => generateShare(ev.target.checked)}
                    disabled={shareBusy}
                    data-testid="share-initials-toggle"
                    className="mt-0.5 h-3.5 w-3.5 rounded border-black/20 text-brand focus:ring-brand/20"
                  />
                  <span className="text-sm text-ink leading-snug">
                    <span className="inline-flex items-center gap-1">
                      {shareData.show_initials_only ? <EyeSlash size={12} /> : <Eye size={12} />}
                      Show candidate as initials only
                    </span>
                    <span className="block text-xs text-ink-soft">When ON, the public page replaces the candidate&rsquo;s name with their initials.</span>
                  </span>
                </label>

                <div className="flex items-center justify-between gap-2 pt-4 border-t border-black/[0.05]">
                  <button
                    type="button"
                    onClick={revokeShare}
                    disabled={shareBusy}
                    data-testid="share-revoke-button"
                    className="text-xs font-medium text-signal-error hover:text-signal-error/80 disabled:opacity-50"
                  >
                    Revoke link
                  </button>
                  <a
                    href={shareData.share_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="share-open-link"
                    className="btn-quiet text-sm px-3 py-1.5"
                  >
                    Preview
                  </a>
                </div>
              </>
            ) : (
              <div>
                <p className="text-sm text-ink-soft mb-5">Generate a tokenized URL that opens this report with no login required. Revoke any time.</p>
                <button
                  type="button"
                  onClick={() => generateShare(true)}
                  disabled={shareBusy}
                  data-testid="share-generate-button"
                  className="btn-primary w-full justify-center"
                >
                  <Share size={14} weight="bold" /> {shareBusy ? "Generating\u2026" : "Generate share link"}
                </button>
              </div>
            )}
          </div>
        </div>
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
