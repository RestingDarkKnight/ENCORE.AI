// ReviewPanel.jsx — Phase H Slice 4 grading review gate.
//
// Rendered on /reports/:assignmentId when an evaluation exists. Until it is
// finalized, the candidate's row is excluded from leaderboards / aggregate
// stats and the shared-report link returns 404. The manager can:
//   - Override per-dimension scores (free-text override note)
//   - Override per-reasoning-question grades
//   - Add per-section comments the candidate will see in their report
//   - Override the final recommendation
//   - Finalize (lock) — or, once finalized, reopen to edit again
//
// The backend recomputes `final_score` on every PATCH and on finalize, blending
// the (possibly overridden) rubric scores with the deterministic objective layer.

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  ShieldCheck, LockSimple, LockSimpleOpen, FloppyDisk, ArrowsClockwise,
  CaretDown, CaretUp, Sliders, ChatCircleText,
} from "@phosphor-icons/react";
import api from "@/lib/api";

const REC_OPTIONS = [
  { value: "strong_hire", label: "Strong Hire" },
  { value: "hire", label: "Hire" },
  { value: "borderline", label: "Borderline" },
  { value: "no_hire", label: "No Hire" },
];

export default function ReviewPanel({ evaluation, caseDoc, onChange }) {
  const [open, setOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [overrides, setOverrides] = useState(evaluation.manager_overrides || {});
  const [overrideNote, setOverrideNote] = useState(evaluation.override_note || "");
  const [sectionComments, setSectionComments] = useState(evaluation.section_comments || {});
  const [reasoningGrades, setReasoningGrades] = useState(
    Array.isArray(evaluation.reasoning_grades) ? evaluation.reasoning_grades : [],
  );
  const [finalRec, setFinalRec] = useState(evaluation.final_recommendation || evaluation.recommendation || "borderline");

  useEffect(() => {
    setOverrides(evaluation.manager_overrides || {});
    setOverrideNote(evaluation.override_note || "");
    setSectionComments(evaluation.section_comments || {});
    setReasoningGrades(Array.isArray(evaluation.reasoning_grades) ? evaluation.reasoning_grades : []);
    setFinalRec(evaluation.final_recommendation || evaluation.recommendation || "borderline");
  }, [evaluation.id]);

  const finalized = evaluation.status === "finalized";

  // Compute a live preview of the final score using the overrides
  const livePreview = useMemo(() => {
    const scores = evaluation.scores || [];
    if (!scores.length) return null;
    const totalW = scores.reduce((acc, s) => acc + (s.weight || 0), 0) || 100;
    const rubricAvg = scores.reduce((acc, s) => acc + ((overrides[s.dimension_id] ?? s.score) || 0) * (s.weight || 0), 0) / totalW;
    const det = evaluation.deterministic_score;
    if (det && (det.objective_max || 0) > 0) {
      const detOn5 = (det.objective_pct || 0) / 20.0;
      return Number((0.7 * rubricAvg + 0.3 * detOn5).toFixed(2));
    }
    return Number(rubricAvg.toFixed(2));
  }, [evaluation.scores, evaluation.deterministic_score, overrides]);

  const patch = async (extras = {}) => {
    setSaving(true);
    try {
      const body = {
        manager_overrides: overrides,
        override_note: overrideNote,
        section_comments: sectionComments,
        reasoning_grades: reasoningGrades,
        final_recommendation: finalRec,
        ...extras,
      };
      const { data } = await api.patch(`/evaluations/${evaluation.id}`, body);
      onChange(data);
      return data;
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not save changes.");
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const finalize = async () => {
    try {
      await patch();
      const { data } = await api.post(`/evaluations/${evaluation.id}/finalize`);
      onChange(data);
      toast.success("Evaluation finalized — candidate can now see their report.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not finalize.");
    }
  };

  const reopen = async () => {
    try {
      const { data } = await api.post(`/evaluations/${evaluation.id}/reopen`);
      onChange(data);
      toast.success("Evaluation reopened — make your edits then finalize again.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not reopen.");
    }
  };

  return (
    <section
      data-testid="review-panel"
      data-status={evaluation.status}
      className={`encore-card overflow-hidden ${finalized ? "border-brand-moss/30" : "border-signal-warning/35"}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="review-panel-toggle"
        className="w-full text-left p-5 flex items-center justify-between gap-4 hover:bg-black/[0.015] transition-colors"
      >
        <div className="flex items-center gap-3 flex-wrap">
          {finalized ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider border border-brand-moss/30 bg-brand-moss/[0.08] text-brand-moss rounded-full px-2.5 py-1">
              <LockSimple weight="fill" size={11} /> Finalized
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider border border-signal-warning/35 bg-signal-warning/[0.08] text-signal-warning rounded-full px-2.5 py-1">
              <ShieldCheck weight="fill" size={11} /> Pending your review
            </span>
          )}
          <h2 className="font-display text-lg font-bold tracking-tight">Grading review</h2>
          {livePreview != null && (
            <span className="text-sm text-ink-soft">
              Final score preview: <strong className="font-display text-ink tabular-nums">{livePreview.toFixed(1)}</strong>
              <span className="text-xs"> / 5</span>
            </span>
          )}
        </div>
        {open ? <CaretUp size={14} className="text-ink-soft" /> : <CaretDown size={14} className="text-ink-soft" />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="border-t border-black/[0.06]"
          >
            <div className="p-6 space-y-6">
              {!finalized && (
                <p className="text-sm text-ink-soft" data-testid="review-panel-explainer">
                  This evaluation is <strong className="text-ink">provisional</strong>. Until you finalize, the
                  candidate&rsquo;s shared report stays hidden and this row is excluded from leaderboards and aggregate
                  stats. Override any score you disagree with, jot per-section comments for the candidate, then click
                  <strong className="text-ink"> Finalize</strong>.
                </p>
              )}

              {/* ---- Per-dimension overrides ---- */}
              <div>
                <p className="encore-overline mb-2 inline-flex items-center gap-1"><Sliders size={11} /> Score overrides</p>
                <div className="space-y-2">
                  {(evaluation.scores || []).map((s) => {
                    const overridden = overrides[s.dimension_id] != null && overrides[s.dimension_id] !== s.score;
                    const cur = overrides[s.dimension_id] != null ? overrides[s.dimension_id] : s.score;
                    return (
                      <div key={s.dimension_id} className="grid grid-cols-12 gap-3 items-center border border-black/[0.06] rounded-lg p-3" data-testid={`review-dim-${s.dimension_id}`}>
                        <div className="col-span-12 md:col-span-5">
                          <p className="text-sm font-medium">{s.name} <span className="text-[10px] text-ink-soft">({s.weight}%)</span></p>
                          <p className="text-xs text-ink-soft mt-0.5 italic">&ldquo;{s.quote || "—"}&rdquo;</p>
                        </div>
                        <div className="col-span-8 md:col-span-5">
                          <input
                            type="range"
                            min={1}
                            max={5}
                            step={0.5}
                            value={cur}
                            disabled={finalized}
                            onChange={(e) => setOverrides({ ...overrides, [s.dimension_id]: Number(e.target.value) })}
                            data-testid={`review-dim-${s.dimension_id}-slider`}
                            className="w-full accent-brand"
                          />
                          <div className="flex justify-between text-[10px] text-ink-soft tabular-nums">
                            <span>1</span><span>3</span><span>5</span>
                          </div>
                        </div>
                        <div className="col-span-4 md:col-span-2 text-right">
                          <span className={`font-display text-xl font-black tabular-nums ${overridden ? "text-brand" : "text-ink"}`}>
                            {Number(cur).toFixed(1)}
                          </span>
                          {overridden && (
                            <p className="text-[10px] text-brand">was {s.score.toFixed(1)}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ---- Reasoning grades ---- */}
              {reasoningGrades.length > 0 && (
                <div>
                  <p className="encore-overline mb-2">Reasoning grades (objective &ldquo;Why?&rdquo; follow-ups)</p>
                  <div className="space-y-2">
                    {reasoningGrades.map((g, i) => (
                      <div key={g.question_key} className="border border-black/[0.06] rounded-lg p-3" data-testid={`review-reasoning-${g.question_key}`}>
                        <p className="text-[11px] text-ink-soft mb-1">Question key: <span className="font-mono">{g.question_key}</span></p>
                        <p className="text-xs text-ink-soft italic mb-2">&ldquo;{g.quote || "—"}&rdquo;</p>
                        <p className="text-xs text-ink mb-2">{g.justification || "—"}</p>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.1}
                            value={g.score ?? 0}
                            disabled={finalized}
                            onChange={(ev) => {
                              const v = Number(ev.target.value);
                              const next = [...reasoningGrades];
                              next[i] = { ...g, score: v, overridden: true };
                              setReasoningGrades(next);
                            }}
                            data-testid={`review-reasoning-${g.question_key}-slider`}
                            className="flex-1 accent-brand-sand"
                          />
                          <span className="font-display text-base font-bold tabular-nums w-10 text-right">{Number(g.score ?? 0).toFixed(1)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ---- Section comments ---- */}
              {caseDoc?.sections?.length > 0 && (
                <div>
                  <p className="encore-overline mb-2 inline-flex items-center gap-1"><ChatCircleText size={11} /> Section comments (visible to candidate)</p>
                  <div className="space-y-2">
                    {caseDoc.sections.map((sec) => (
                      <div key={sec.id} className="border border-black/[0.06] rounded-lg p-3">
                        <p className="text-xs font-medium mb-1.5">{sec.title}</p>
                        <textarea
                          value={sectionComments[sec.id] || ""}
                          onChange={(e) => setSectionComments({ ...sectionComments, [sec.id]: e.target.value })}
                          rows={2}
                          placeholder="e.g. Strong on root-cause analysis but rushed the verification step."
                          disabled={finalized}
                          data-testid={`review-section-comment-${sec.id}`}
                          className="w-full bg-canvas border border-black/12 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-brand/20 outline-none resize-y disabled:opacity-60"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ---- Override note + final recommendation ---- */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="encore-overline mb-1.5">Override rationale (internal)</p>
                  <textarea
                    value={overrideNote}
                    onChange={(e) => setOverrideNote(e.target.value)}
                    rows={3}
                    disabled={finalized}
                    placeholder="Why are you adjusting the LLM's scores?"
                    data-testid="review-override-note"
                    className="w-full bg-canvas border border-black/12 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-brand/20 outline-none resize-y disabled:opacity-60"
                  />
                </div>
                <div>
                  <p className="encore-overline mb-1.5">Final recommendation</p>
                  <div className="flex flex-wrap gap-1.5">
                    {REC_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        disabled={finalized}
                        onClick={() => setFinalRec(o.value)}
                        data-testid={`review-rec-${o.value}`}
                        className={`text-[11px] font-semibold rounded-full px-3 py-1.5 border transition-colors ${
                          finalRec === o.value
                            ? "border-ink bg-ink text-canvas"
                            : "border-black/15 hover:border-black/30 hover:bg-black/[0.02]"
                        } disabled:opacity-60`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ---- Action bar ---- */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-black/[0.06] flex-wrap">
                {finalized ? (
                  <button
                    type="button"
                    onClick={reopen}
                    disabled={saving}
                    data-testid="review-reopen-button"
                    className="btn-quiet text-sm"
                  >
                    <LockSimpleOpen size={13} /> Reopen for editing
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => patch().then(() => toast.success("Saved as provisional."))}
                      disabled={saving}
                      data-testid="review-save-button"
                      className="btn-quiet text-sm"
                    >
                      {saving ? <ArrowsClockwise size={13} className="animate-spin" /> : <FloppyDisk size={13} />} Save draft
                    </button>
                    <button
                      type="button"
                      onClick={finalize}
                      disabled={saving}
                      data-testid="review-finalize-button"
                      className="btn-primary text-sm"
                    >
                      <LockSimple size={13} weight="bold" /> Finalize evaluation
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
