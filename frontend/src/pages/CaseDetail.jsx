import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle, Lock, PencilSimple, ArrowsClockwise, Sparkle, Warning, LockOpen, Clock,
  Archive, ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import InvitePanel from "@/components/InvitePanel";
import Leaderboard from "@/components/Leaderboard";
import KebabMenu from "@/components/KebabMenu";

/**
 * Inline editable text — single line (heading) or multi-line.
 * Saves on blur or Enter (single-line). Esc cancels.
 */
function EditableText({ value, onSave, multiline = false, className = "", placeholder = "", testid }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);

  const commit = async () => {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      setDraft(value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    if (multiline) {
      return (
        <textarea
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setDraft(value); setEditing(false); }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
          }}
          rows={Math.max(3, draft.split("\n").length)}
          data-testid={testid}
          className={`w-full bg-canvas border border-brand/40 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand/20 outline-none ${className}`}
        />
      );
    }
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
          if (e.key === "Enter") commit();
        }}
        data-testid={testid}
        className={`w-full bg-canvas border border-brand/40 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-brand/20 outline-none ${className}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      data-testid={testid ? `${testid}-edit` : undefined}
      className={`group/edit text-left w-full hover:bg-black/[0.02] -mx-2 px-2 py-1 rounded-md transition-colors relative ${className}`}
      title="Click to edit"
      disabled={saving}
    >
      <span>{value || <span className="text-ink-soft">{placeholder}</span>}</span>
      <PencilSimple size={12} className="inline-block ml-2 opacity-0 group-hover/edit:opacity-50 transition-opacity align-middle" />
    </button>
  );
}

export default function CaseDetail() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const [c, setCase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const [justApproved, setJustApproved] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/cases/${caseId}`);
      setCase(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not load case.");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  const isApproved = c?.status === "approved";
  const totalWeight = useMemo(
    () => (c?.rubric || []).reduce((s, r) => s + (Number(r.weight) || 0), 0),
    [c?.rubric]
  );

  // Patch helper
  const patch = async (updates) => {
    const { data } = await api.patch(`/cases/${caseId}`, updates);
    setCase(data);
  };

  const updateSection = async (sectionId, updates) => {
    const newSections = c.sections.map((s) => (s.id === sectionId ? { ...s, ...updates } : s));
    await patch({ sections: newSections });
  };
  const updateQuestion = async (sectionId, qIdx, val) => {
    const newSections = c.sections.map((s) => {
      if (s.id !== sectionId) return s;
      const qs = [...s.questions];
      qs[qIdx] = val;
      return { ...s, questions: qs };
    });
    await patch({ sections: newSections });
  };
  const addQuestion = async (sectionId) => {
    const newSections = c.sections.map((s) => {
      if (s.id !== sectionId) return s;
      return { ...s, questions: [...s.questions, "New question — click to edit"] };
    });
    await patch({ sections: newSections });
  };
  const removeQuestion = async (sectionId, qIdx) => {
    const newSections = c.sections.map((s) => {
      if (s.id !== sectionId) return s;
      const qs = s.questions.filter((_, i) => i !== qIdx);
      return { ...s, questions: qs };
    });
    await patch({ sections: newSections });
  };
  const updateRubric = async (dimId, updates) => {
    const newRubric = c.rubric.map((r) => (r.id === dimId ? { ...r, ...updates } : r));
    await patch({ rubric: newRubric });
  };
  const updateAnchor = async (dimId, anchor, val) => {
    const newRubric = c.rubric.map((r) =>
      r.id === dimId ? { ...r, anchors: { ...r.anchors, [anchor]: val } } : r
    );
    await patch({ rubric: newRubric });
  };

  const onApprove = async () => {
    setBusyKey("approve");
    try {
      const { data } = await api.post(`/cases/${caseId}/approve`);
      setCase(data);
      setJustApproved(true);
      toast.success("Case approved and locked.");
      setTimeout(() => setJustApproved(false), 2500);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to approve.");
    } finally {
      setBusyKey(null);
    }
  };

  const onReopen = async () => {
    setBusyKey("reopen");
    try {
      const { data } = await api.post(`/cases/${caseId}/reopen`);
      setCase(data);
      toast.success("Case reopened for editing.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to reopen.");
    } finally {
      setBusyKey(null);
    }
  };

  const onRegenerateAll = async () => {
    if (!window.confirm("Regenerate the entire case? Your inline edits will be replaced.")) return;
    setBusyKey("regen-all");
    try {
      const { data } = await api.post(`/cases/${caseId}/regenerate`);
      setCase(data);
      toast.success("Case regenerated.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Regeneration failed.");
    } finally {
      setBusyKey(null);
    }
  };

  const onRegenerateSection = async (sectionId) => {
    setBusyKey(`regen-${sectionId}`);
    try {
      const { data } = await api.post(`/cases/${caseId}/regenerate-section`, { section_id: sectionId, notes: "" });
      setCase(data);
      toast.success("Section regenerated.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Section regen failed.");
    } finally {
      setBusyKey(null);
    }
  };

  const onArchive = async () => {
    if (!window.confirm(`Archive "${c.title}"? It will be hidden from the role's case list. Candidate data is preserved and you can restore it any time.`)) return;
    try {
      await api.post(`/cases/${caseId}/archive`);
      toast.success("Case archived.");
      navigate(`/roles/${c.role_id}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not archive case.");
    }
  };

  const onUnarchive = async () => {
    try {
      const { data } = await api.post(`/cases/${caseId}/unarchive`);
      setCase(data);
      toast.success("Case restored to draft.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not restore case.");
    }
  };

  if (loading) return <div className="text-center text-ink-soft py-16">Loading case…</div>;
  if (!c) return <div className="text-center text-ink-soft py-16">Case not found.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-10" data-testid="case-detail-page">
      <div className="flex items-center justify-between">
        <Link to={`/roles/${c.role_id}`} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink" data-testid="case-detail-back">
          <ArrowLeft size={14} /> Back to role
        </Link>

        <div className="flex items-center gap-2">
          {isApproved ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider border border-brand-moss/30 bg-brand-moss/5 text-brand-moss rounded-full px-3 py-1.5">
                <Lock weight="fill" size={12} /> Approved & locked
              </span>
              <button
                type="button"
                onClick={onReopen}
                disabled={busyKey === "reopen"}
                data-testid="case-reopen-button"
                className="inline-flex items-center gap-1.5 text-xs font-medium border border-black/15 hover:border-black/30 hover:bg-black/[0.02] rounded-lg px-3 py-1.5"
              >
                <LockOpen size={12} /> Reopen
              </button>
            </>
          ) : c.status === "archived" ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider border border-black/15 bg-black/[0.04] text-ink-soft rounded-full px-3 py-1.5" data-testid="case-archived-pill">
              <Archive weight="fill" size={12} /> Archived
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={onRegenerateAll}
                disabled={busyKey === "regen-all"}
                data-testid="case-regenerate-all-button"
                className="inline-flex items-center gap-1.5 text-xs font-medium border border-black/15 hover:border-black/30 hover:bg-black/[0.02] rounded-lg px-3 py-1.5"
              >
                <ArrowsClockwise size={12} className={busyKey === "regen-all" ? "animate-spin" : ""} />
                {busyKey === "regen-all" ? "Regenerating…" : "Regenerate"}
              </button>
              <button
                type="button"
                onClick={onApprove}
                disabled={busyKey === "approve"}
                data-testid="case-approve-button"
                className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white rounded-lg px-4 py-2 transition-all hover:-translate-y-0.5 disabled:opacity-60"
              >
                <CheckCircle weight="bold" size={14} />
                <span className="font-medium text-sm">{busyKey === "approve" ? "Approving…" : "Approve & lock"}</span>
              </button>
            </>
          )}
          <KebabMenu
            testid="case-detail-kebab"
            items={
              c.status === "archived"
                ? [{ label: "Restore case", icon: ArrowCounterClockwise, onClick: onUnarchive, testid: "case-detail-unarchive" }]
                : [{ label: "Archive case", icon: Archive, onClick: onArchive, danger: true, testid: "case-detail-archive" }]
            }
          />
        </div>
      </div>

      {c.status === "archived" && (
        <div className="encore-card p-4 bg-black/[0.03] border-black/10 flex items-center justify-between gap-4 flex-wrap" data-testid="case-archived-banner">
          <div className="flex items-center gap-3">
            <Archive weight="duotone" size={20} className="text-ink-soft" />
            <p className="text-sm text-ink-soft">This case is archived and won&rsquo;t appear in the role&rsquo;s active list. Candidate responses and reports are preserved.</p>
          </div>
          <button
            type="button"
            onClick={onUnarchive}
            data-testid="case-archived-banner-restore"
            className="inline-flex items-center gap-1.5 text-sm font-medium border border-black/15 hover:border-black/30 hover:bg-black/[0.02] rounded-lg px-3 py-1.5"
          >
            <ArrowCounterClockwise size={13} /> Restore to draft
          </button>
        </div>
      )}

      <AnimatePresence>
        {justApproved && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            className="encore-card p-5 border-brand-moss/30 bg-brand-moss/[0.04] flex items-center gap-3"
            data-testid="case-approved-celebration"
          >
            <CheckCircle weight="duotone" size={24} className="text-brand-moss" />
            <div>
              <p className="font-display font-bold tracking-tight text-brand-moss">Locked in.</p>
              <p className="text-sm text-ink-soft">This case is ready to assign to candidates in Phase 2.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Title + scenario */}
      <section data-testid="case-title-section">
        <p className="encore-overline mb-2 flex items-center gap-2">
          <Sparkle weight="duotone" size={12} className="text-brand-sand" />
          {c.model_used || "claude"} · {c.sections.length} sections · {c.rubric.length} rubric dimensions · <Clock size={12} className="inline" /> ~{c.estimated_minutes} min
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tighter leading-[1.05] mb-6">
          {isApproved ? c.title : (
            <EditableText
              value={c.title}
              onSave={(v) => patch({ title: v })}
              testid="case-title"
              className="font-display text-3xl sm:text-4xl font-black tracking-tighter leading-[1.05]"
              placeholder="Untitled case"
            />
          )}
        </h1>

        <div className="encore-card p-7">
          <p className="encore-overline mb-3">Scenario</p>
          {isApproved ? (
            <p className="text-ink leading-relaxed whitespace-pre-wrap">{c.scenario_text}</p>
          ) : (
            <EditableText
              value={c.scenario_text}
              onSave={(v) => patch({ scenario_text: v })}
              multiline
              testid="case-scenario"
              className="text-ink leading-relaxed whitespace-pre-wrap"
            />
          )}
        </div>
      </section>

      {/* Sections */}
      <section data-testid="case-sections-section">
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="font-display text-2xl font-bold tracking-tight">Sections</h2>
          <p className="text-xs text-ink-soft">Click any text to edit.</p>
        </div>
        <motion.div
          className="space-y-5"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } }}
        >
          {c.sections.map((s, idx) => (
            <motion.div
              key={s.id}
              variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="encore-card p-7"
              data-testid={`section-${s.id}`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1">
                  <p className="encore-overline mb-2">Section {idx + 1}</p>
                  {isApproved ? (
                    <h3 className="font-display text-xl font-bold tracking-tight">{s.title}</h3>
                  ) : (
                    <EditableText
                      value={s.title}
                      onSave={(v) => updateSection(s.id, { title: v })}
                      testid={`section-${s.id}-title`}
                      className="font-display text-xl font-bold tracking-tight"
                    />
                  )}
                </div>
                {!isApproved && (
                  <button
                    type="button"
                    onClick={() => onRegenerateSection(s.id)}
                    disabled={busyKey === `regen-${s.id}`}
                    data-testid={`section-${s.id}-regenerate`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium border border-black/15 hover:border-black/30 hover:bg-black/[0.02] rounded-lg px-2.5 py-1.5 shrink-0"
                  >
                    <ArrowsClockwise size={11} className={busyKey === `regen-${s.id}` ? "animate-spin" : ""} />
                    {busyKey === `regen-${s.id}` ? "Regenerating…" : "Regenerate section"}
                  </button>
                )}
              </div>

              {isApproved ? (
                <p className="text-ink-soft text-sm mb-4 leading-relaxed">{s.intro}</p>
              ) : (
                <EditableText
                  value={s.intro}
                  onSave={(v) => updateSection(s.id, { intro: v })}
                  multiline
                  testid={`section-${s.id}-intro`}
                  className="text-ink-soft text-sm mb-4 leading-relaxed"
                />
              )}

              <ol className="space-y-3 mt-4 list-decimal list-inside marker:text-ink-soft marker:text-xs">
                {s.questions.map((q, qIdx) => (
                  <li key={qIdx} className="text-ink text-sm leading-relaxed pl-1 group/q" data-testid={`section-${s.id}-q-${qIdx}`}>
                    {isApproved ? (
                      <span>{q}</span>
                    ) : (
                      <span className="inline-flex items-start gap-2 w-full">
                        <span className="flex-1">
                          <EditableText
                            value={q}
                            onSave={(v) => updateQuestion(s.id, qIdx, v)}
                            multiline
                            testid={`section-${s.id}-q-${qIdx}-edit`}
                            className="text-ink text-sm leading-relaxed inline"
                          />
                        </span>
                        <button
                          type="button"
                          onClick={() => removeQuestion(s.id, qIdx)}
                          data-testid={`section-${s.id}-q-${qIdx}-remove`}
                          title="Remove question"
                          className="opacity-0 group-hover/q:opacity-60 hover:!opacity-100 text-[10px] text-signal-error transition-opacity shrink-0 mt-1"
                        >
                          ✕
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              {!isApproved && (
                <button
                  type="button"
                  onClick={() => addQuestion(s.id)}
                  data-testid={`section-${s.id}-add-question`}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand-hover border border-dashed border-brand/30 hover:border-brand/60 rounded-md px-3 py-1.5"
                >
                  + Add question
                </button>
              )}
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Invite candidates (Phase 2) */}
      <InvitePanel caseId={c.id} caseStatus={c.status} />

      {/* Compare candidates (Phase 3) */}
      <Leaderboard caseId={c.id} />

      {/* Rubric */}
      <section data-testid="case-rubric-section">
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="font-display text-2xl font-bold tracking-tight">Scoring rubric</h2>
          <span className={`text-xs ${Math.abs(totalWeight - 100) < 0.5 ? "text-brand-moss" : "text-signal-warning"}`} data-testid="rubric-weight-total">
            Total weight: {totalWeight.toFixed(0)}% {Math.abs(totalWeight - 100) < 0.5 ? "✓" : "(should equal 100)"}
          </span>
        </div>

        <div className="space-y-4">
          {c.rubric.map((r) => (
            <div key={r.id} className="encore-card p-6" data-testid={`rubric-${r.id}`}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  {isApproved ? (
                    <h3 className="font-display text-lg font-bold tracking-tight">{r.name}</h3>
                  ) : (
                    <EditableText
                      value={r.name}
                      onSave={(v) => updateRubric(r.id, { name: v })}
                      testid={`rubric-${r.id}-name`}
                      className="font-display text-lg font-bold tracking-tight"
                    />
                  )}
                  {isApproved ? (
                    <p className="text-sm text-ink-soft mt-1">{r.description}</p>
                  ) : (
                    <EditableText
                      value={r.description}
                      onSave={(v) => updateRubric(r.id, { description: v })}
                      multiline
                      testid={`rubric-${r.id}-description`}
                      className="text-sm text-ink-soft mt-1"
                    />
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="encore-overline mb-1">Weight</p>
                  {isApproved ? (
                    <p className="font-display text-xl font-bold text-brand">{r.weight}%</p>
                  ) : (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={r.weight}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setCase({ ...c, rubric: c.rubric.map((x) => (x.id === r.id ? { ...x, weight: v } : x)) });
                        }}
                        onBlur={(e) => updateRubric(r.id, { weight: Number(e.target.value) })}
                        data-testid={`rubric-${r.id}-weight`}
                        className="w-16 bg-transparent border border-black/15 rounded-md px-2 py-1 text-right font-display text-lg font-bold text-brand focus:ring-2 focus:ring-brand/20 outline-none"
                      />
                      <span className="text-ink-soft">%</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-3 mt-4">
                {[
                  { key: "one", label: "1 — Weak", color: "bg-signal-error/5 border-signal-error/15 text-signal-error" },
                  { key: "three", label: "3 — Solid", color: "bg-canvas border-black/10 text-ink-soft" },
                  { key: "five", label: "5 — Exceptional", color: "bg-brand-moss/5 border-brand-moss/20 text-brand-moss" },
                ].map((a) => (
                  <div key={a.key} className={`rounded-lg border p-3 ${a.color.split(" ").slice(0, 2).join(" ")}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${a.color.split(" ")[2]}`}>{a.label}</p>
                    {isApproved ? (
                      <p className="text-xs text-ink leading-relaxed">{r.anchors?.[a.key]}</p>
                    ) : (
                      <EditableText
                        value={r.anchors?.[a.key] || ""}
                        onSave={(v) => updateAnchor(r.id, a.key, v)}
                        multiline
                        testid={`rubric-${r.id}-anchor-${a.key}`}
                        className="text-xs text-ink leading-relaxed"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
