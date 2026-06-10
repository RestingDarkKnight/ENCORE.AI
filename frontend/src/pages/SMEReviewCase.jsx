import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import api from "@/lib/api";
import { ArrowLeft, CheckCircle, XCircle, Warning, ShieldWarning } from "@phosphor-icons/react";

const DIMENSIONS = [
  { id: "discrimination_power",   label: "Discrimination power",  hint: "Would strong and weak candidates produce visibly different answers?" },
  { id: "job_fidelity",           label: "Job-fidelity / realism", hint: "Does it mirror a real on-the-job situation?" },
  { id: "anchored_openness",      label: "Anchored openness",     hint: "Open-ended but with real constraints?" },
  { id: "judgment_over_recall",   label: "Judgment over recall",  hint: "Demands decisions and reasoning, not definitions?" },
  { id: "technical_accuracy",     label: "Technical accuracy",    hint: "Every fact, number, defect, standard correct?" },
  { id: "difficulty_calibration", label: "Difficulty calibration", hint: "Pitched to the role's seniority?" },
  { id: "rubric_quality",         label: "Rubric quality",        hint: "Is the case's own rubric clear and consistent?" },
];

export default function SMEReviewCase() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState({ case: null, review: null });
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState(Object.fromEntries(DIMENSIONS.map((d) => [d.id, 3])));
  const [fabFlag, setFabFlag] = useState(false);
  const [notes, setNotes] = useState("");
  const [verdict, setVerdict] = useState("approved");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/sme/cases/${caseId}`);
      setData(data);
      if (data.review) {
        setScores({ ...data.review.scores });
        setFabFlag(!!data.review.fabricated_specs_flag);
        setNotes(data.review.notes || "");
        setVerdict(data.review.verdict);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not load case.");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  const total = useMemo(() => DIMENSIONS.reduce((s, d) => s + (scores[d.id] || 0), 0), [scores]);
  const avg = (total / DIMENSIONS.length).toFixed(1);
  const effectiveVerdict = fabFlag ? "rejected" : verdict;

  const submit = async () => {
    if (effectiveVerdict === "rejected" && notes.trim().length < 5) {
      toast.error("Please add notes explaining why you're rejecting — they feed future generations.");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/sme/cases/${caseId}/review`, {
        scores,
        fabricated_specs_flag: fabFlag,
        verdict,
        notes,
      });
      toast.success(effectiveVerdict === "approved" ? "Approved. Added to the library." : "Rejected with notes. Saved for grounding.");
      navigate("/sme");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not save review.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="text-center text-ink-soft py-16">Loading case…</div>;
  if (!data.case) return <div className="text-center text-ink-soft py-16">Case not found.</div>;
  const c = data.case;

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <main className="mx-auto max-w-5xl px-6 lg:px-10 py-10 space-y-10" data-testid="sme-review-page">
        <Link to="/sme" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink" data-testid="sme-review-back">
          <ArrowLeft size={14} /> Back to queue
        </Link>

        {/* Case */}
        <section>
          <p className="encore-overline mb-2">{c.domain_key || "—"} · ~{c.estimated_minutes} min</p>
          <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tighter leading-[1.05]">{c.title}</h1>
          <div className="encore-card p-6 mt-5">
            <p className="encore-overline mb-2">Scenario</p>
            <p className="text-ink leading-relaxed whitespace-pre-wrap">{c.scenario_text}</p>
          </div>
          <div className="mt-5 space-y-3">
            {c.sections.map((s, idx) => (
              <details key={s.id} className="encore-card p-5 group">
                <summary className="cursor-pointer list-none flex items-center justify-between">
                  <span><span className="encore-overline mr-2">Section {idx + 1}</span><span className="font-display font-bold">{s.title}</span></span>
                  <span className="text-xs text-ink-soft">{s.questions.length} questions</span>
                </summary>
                <p className="text-sm text-ink-soft mt-3">{s.intro}</p>
                <ol className="mt-3 list-decimal list-inside text-sm text-ink space-y-1">
                  {s.questions.map((q, i) => <li key={i}>{q}</li>)}
                </ol>
              </details>
            ))}
          </div>
        </section>

        {/* Scoring panel */}
        <section className="encore-card p-7" data-testid="sme-scoring-panel">
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="font-display text-2xl font-bold tracking-tight">Score against the quality rubric</h2>
            <span className="text-sm text-ink-soft">Average: <span className="font-display font-black text-brand">{avg}</span> / 5</span>
          </div>

          <div className="space-y-5">
            {DIMENSIONS.map((d) => (
              <div key={d.id} data-testid={`sme-dim-${d.id}`}>
                <div className="flex items-baseline justify-between mb-2">
                  <div>
                    <p className="font-medium text-ink">{d.label}</p>
                    <p className="text-xs text-ink-soft">{d.hint}</p>
                  </div>
                  <span className="font-display text-lg font-black text-brand tabular-nums">{scores[d.id]}</span>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setScores((s) => ({ ...s, [d.id]: n }))}
                      data-testid={`sme-dim-${d.id}-score-${n}`}
                      className={`flex-1 h-9 rounded-md text-sm font-medium border transition-all ${
                        scores[d.id] >= n
                          ? "bg-brand text-white border-brand"
                          : "bg-transparent text-ink-soft border-black/15 hover:border-black/30"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Hard reject flag */}
          <div className="mt-6 border-t border-black/[0.06] pt-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={fabFlag}
                onChange={(e) => setFabFlag(e.target.checked)}
                data-testid="sme-fabricated-flag"
                className="mt-1 h-4 w-4 accent-[#964545]"
              />
              <div>
                <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                  <ShieldWarning weight="fill" size={14} className="text-signal-error" />
                  This case contains fabricated or impossible specs
                </span>
                <p className="text-xs text-ink-soft mt-0.5">Forces a rejection regardless of other scores. Use when any fact, number, or technical detail is wrong or invented.</p>
              </div>
            </label>
          </div>

          {/* Verdict + notes */}
          <div className="mt-6 border-t border-black/[0.06] pt-5">
            <p className="encore-overline mb-3">Verdict</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                type="button"
                onClick={() => setVerdict("approved")}
                disabled={fabFlag}
                data-testid="sme-verdict-approved"
                className={`p-3 rounded-lg border text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                  effectiveVerdict === "approved" && !fabFlag
                    ? "bg-brand-moss text-white border-brand-moss"
                    : "bg-transparent text-ink border-black/15 hover:border-black/30 disabled:opacity-40"
                }`}
              >
                <CheckCircle weight={effectiveVerdict === "approved" && !fabFlag ? "fill" : "regular"} size={14} /> Approve
              </button>
              <button
                type="button"
                onClick={() => setVerdict("rejected")}
                data-testid="sme-verdict-rejected"
                className={`p-3 rounded-lg border text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                  effectiveVerdict === "rejected"
                    ? "bg-signal-error text-white border-signal-error"
                    : "bg-transparent text-ink border-black/15 hover:border-black/30"
                }`}
              >
                <XCircle weight={effectiveVerdict === "rejected" ? "fill" : "regular"} size={14} /> Reject
              </button>
            </div>

            {fabFlag && (
              <p className="text-xs inline-flex items-center gap-1.5 text-signal-error mb-3" data-testid="sme-force-reject-banner">
                <Warning weight="fill" size={12} /> Fabricated-specs flag is on — this case will be rejected regardless of verdict.
              </p>
            )}

            <label className="block text-sm font-medium text-ink-soft mb-1.5">Notes {effectiveVerdict === "rejected" && <span className="text-signal-error">(required for rejections — these feed future generations)</span>}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder={effectiveVerdict === "rejected" ? "What's wrong, specifically? e.g. 'invents tolerance values not given'; 'asks for textbook definition'." : "Optional: anything you want the manager or future SMEs to know."}
              data-testid="sme-notes-input"
              className="w-full bg-canvas border border-black/15 rounded-lg px-4 py-3 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all resize-none text-sm"
            />

            <button
              type="button"
              onClick={submit}
              disabled={busy}
              data-testid="sme-submit-review"
              className="mt-5 inline-flex items-center gap-2 bg-brand hover:bg-brand-hover disabled:opacity-60 text-white rounded-lg px-6 py-2.5 transition-all hover:-translate-y-0.5"
            >
              <span className="font-medium text-sm">{busy ? "Saving…" : `Submit review (${effectiveVerdict})`}</span>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
