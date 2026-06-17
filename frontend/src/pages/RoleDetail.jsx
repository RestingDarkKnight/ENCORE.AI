// RoleDetail.jsx — single unified page for role + case-design + drafted cases.
// The one-shot Claude generation is retired; the only path is the inline
// 6-agent workspace (GuidedWorkflow) which renders below the design card
// once the manager picks a mode, time, and (optional) notes.

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  ArrowLeft, Sparkle, FileText, Warning, ArrowRight, CheckCircle, Clock,
  Archive, ArrowCounterClockwise, PencilSimple, CaretDown, CaretUp,
} from "@phosphor-icons/react";
import KebabMenu from "@/components/KebabMenu";
import ModeTimeSelector from "@/components/ModeTimeSelector";
import GuidedWorkflow from "@/components/GuidedWorkflow";

const DIFFICULTY_LABEL = {
  foundational: "Foundational",
  applied: "Applied",
  advanced: "Advanced",
  expert: "Expert",
};

const MODE_LABEL = { screening: "Screening", takehome: "Take-home", interview: "Interview" };

export default function RoleDetail() {
  const { roleId } = useParams();
  const navigate = useNavigate();
  const [role, setRole] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [claudeOk, setClaudeOk] = useState(false);

  // Design-card state
  const [assessmentMode, setAssessmentMode] = useState(null);
  const [minutes, setMinutes] = useState(null);
  const [requireReasoning, setRequireReasoning] = useState(false);
  const [notes, setNotes] = useState("");
  const [designOpen, setDesignOpen] = useState(false); // when true, inline workflow renders
  const [expandedCaseId, setExpandedCaseId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [r, c, h] = await Promise.all([
        api.get(`/roles/${roleId}`),
        api.get(`/cases/role/${roleId}`, { params: { include_archived: false } }),
        api.get("/health").catch(() => null),
      ]);
      setRole(r.data);
      setCases(c.data);
      setClaudeOk(!!h?.data?.claude_configured);
    } finally {
      setLoading(false);
    }
  }, [roleId]);

  useEffect(() => { load(); }, [load]);

  // If there's already an in-progress workflow for this role, surface the
  // design card pre-opened so the manager resumes seamlessly.
  useEffect(() => {
    if (!role?.id) return;
    api.get(`/workflows/by-role/${role.id}`)
      .then((res) => {
        const open = (res.data || []).find((w) => w.status === "in_progress");
        if (open) {
          setDesignOpen(true);
          if (open.assessment_mode) setAssessmentMode(open.assessment_mode);
          if (open.estimated_minutes) setMinutes(open.estimated_minutes);
          if (typeof open.require_reasoning === "boolean") setRequireReasoning(open.require_reasoning);
          if (open.notes) setNotes(open.notes);
        }
      })
      .catch(() => { /* fail-soft */ });
  }, [role?.id]);

  const patchRole = async (updates) => {
    try {
      const { data } = await api.patch(`/roles/${roleId}`, updates);
      setRole(data);
      toast.success("Saved.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not save.");
    }
  };

  const onArchive = async () => {
    if (!window.confirm(`Archive "${role.job_title}"? It will be hidden from your dashboard. Cases stay accessible under All cases and can still be reviewed.`)) return;
    try {
      await api.post(`/roles/${roleId}/archive`);
      toast.success("Role archived.");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not archive.");
    }
  };

  const onUnarchive = async () => {
    try {
      const { data } = await api.post(`/roles/${roleId}/unarchive`);
      setRole(data);
      toast.success("Role restored.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not restore.");
    }
  };

  const canBegin = !!assessmentMode && !!minutes && !role?.archived && claudeOk;

  const onCaseFinalized = async (newCaseId) => {
    // Re-pull cases, collapse the workspace, optionally expand the new card.
    const c = await api.get(`/cases/role/${roleId}`, { params: { include_archived: false } });
    setCases(c.data);
    setDesignOpen(false);
    setExpandedCaseId(newCaseId);
    setAssessmentMode(null);
    setMinutes(null);
    setRequireReasoning(false);
    setNotes("");
    toast.success("Case study ready in drafted cases.");
  };

  const reviseCase = (c) => {
    // "Revise via agents" — pre-fills the design card with this case's mode/time
    // and re-opens the workspace. A fresh workflow is started (current MVP).
    setAssessmentMode(c.assessment_mode || "interview");
    setMinutes(c.estimated_minutes || null);
    setRequireReasoning(!!c.require_reasoning);
    setNotes("");
    setDesignOpen(true);
    setExpandedCaseId(null);
    // Smooth-scroll the design card into view
    setTimeout(() => {
      const el = document.querySelector('[data-testid="design-card"]');
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  if (loading) return <div className="text-center text-ink-soft py-16">Loading role&hellip;</div>;
  if (!role) return <div className="text-center text-ink-soft py-16">Role not found.</div>;

  return (
    <div className="space-y-10" data-testid="role-detail-page">
      <div className="flex items-center justify-between gap-3">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink" data-testid="role-detail-back">
          <ArrowLeft size={14} /> Back to dashboard
        </Link>
        <KebabMenu
          testid="role-detail-kebab"
          items={
            role.archived
              ? [{ label: "Restore role", icon: ArrowCounterClockwise, onClick: onUnarchive, testid: "role-detail-unarchive" }]
              : [{ label: "Archive role", icon: Archive, onClick: onArchive, danger: true, testid: "role-detail-archive" }]
          }
        />
      </div>

      {role.archived && (
        <div className="encore-card p-4 bg-black/[0.03] border-black/10 flex items-center justify-between gap-4 flex-wrap" data-testid="role-archived-banner">
          <div className="flex items-center gap-3">
            <Archive weight="duotone" size={20} className="text-ink-soft" />
            <p className="text-sm text-ink-soft">This role is archived. It&rsquo;s hidden from your dashboard but cases remain accessible.</p>
          </div>
          <button
            type="button"
            onClick={onUnarchive}
            data-testid="role-archived-banner-restore"
            className="inline-flex items-center gap-1.5 text-sm font-medium border border-black/15 hover:border-black/30 hover:bg-black/[0.02] rounded-lg px-3 py-1.5"
          >
            <ArrowCounterClockwise size={13} /> Restore
          </button>
        </div>
      )}

      <header>
        <p className="encore-overline mb-2">{role.seniority} &middot; {role.industry || "—"} &middot; {DIFFICULTY_LABEL[role.difficulty_level]} &middot; <span className="text-brand-sand">register: {role.language_register || "standard"}</span></p>
        <EditableField
          value={role.job_title}
          onSave={(v) => patchRole({ job_title: v })}
          testid="role-detail-job-title"
          className="font-display text-4xl sm:text-5xl font-black tracking-tighter leading-[1.05] mb-5"
          placeholder="Untitled role"
        />

        <div className="grid md:grid-cols-2 gap-4 mt-6">
          <div className="encore-card p-5">
            <p className="encore-overline mb-2">Success looks like</p>
            <EditableField
              value={role.success_criteria}
              onSave={(v) => patchRole({ success_criteria: v })}
              testid="role-detail-success-criteria"
              multiline
              className="text-sm text-ink"
              placeholder="Describe what success in this role looks like…"
            />
          </div>
          <div className="encore-card p-5">
            <p className="encore-overline mb-2">Common challenges</p>
            <EditableField
              value={role.common_challenges}
              onSave={(v) => patchRole({ common_challenges: v })}
              testid="role-detail-common-challenges"
              multiline
              className="text-sm text-ink"
              placeholder="What does this role typically struggle with?"
            />
          </div>
        </div>

        {(role.technical_skills?.length > 0 || role.soft_skills?.length > 0) && (
          <div className="flex flex-col gap-3 mt-5">
            {role.technical_skills?.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="encore-overline">Technical</span>
                {role.technical_skills.map((s) => (
                  <span key={s} className="bg-brand/5 text-brand rounded-full px-3 py-1 text-xs font-medium">{s}</span>
                ))}
              </div>
            )}
            {role.soft_skills?.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="encore-overline">Soft</span>
                {role.soft_skills.map((s) => (
                  <span key={s} className="bg-brand-moss/5 text-brand-moss rounded-full px-3 py-1 text-xs font-medium">{s}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      {/* Design card */}
      <section className="encore-card p-7" data-testid="design-card">
        <div className="flex items-start gap-4 mb-5">
          <div className="h-10 w-10 rounded-md bg-brand-sand/10 text-brand-sand flex items-center justify-center shrink-0">
            <Sparkle weight="duotone" size={20} />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight">Let&rsquo;s design a work-simulation case.</h2>
            <p className="text-sm text-ink-soft mt-1">
              Six agents will collaborate &mdash; Analyst, Theory Researcher, Architect, Generator, Critic, Polisher.
              You approve every step. Pick the funnel stage and a target duration to begin.
            </p>
          </div>
        </div>

        {!claudeOk && (
          <div className="flex items-start gap-3 bg-signal-warning/5 border border-signal-warning/20 rounded-lg p-4 mb-5" data-testid="claude-not-configured-warning">
            <Warning weight="fill" size={18} className="text-signal-warning shrink-0 mt-0.5" />
            <p className="text-sm text-ink">
              Claude isn&rsquo;t configured yet. Add <code className="font-mono text-xs px-1 py-0.5 bg-black/[0.04] rounded">ANTHROPIC_API_KEY</code> to the backend env and restart to enable the workflow.
            </p>
          </div>
        )}

        <ModeTimeSelector
          mode={assessmentMode}
          setMode={setAssessmentMode}
          minutes={minutes}
          setMinutes={setMinutes}
          requireReasoning={requireReasoning}
          setRequireReasoning={setRequireReasoning}
          disabled={role.archived || designOpen}
        />

        <label className="block text-sm font-medium text-ink-soft mb-1.5">Optional notes for the agents</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="e.g. emphasize trade-off reasoning around eventual consistency"
          disabled={designOpen}
          data-testid="design-notes-input"
          className="w-full bg-transparent border border-black/15 rounded-lg px-4 py-3 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all resize-none disabled:opacity-60"
        />

        <div className="flex items-center justify-between gap-2 mt-4 flex-wrap">
          <p className="text-xs text-ink-soft">
            {assessmentMode
              ? <>Selected: <strong className="text-ink">{MODE_LABEL[assessmentMode]}</strong>{minutes ? <> · <strong className="text-ink tabular-nums">{minutes} min</strong></> : <> · <em>pick a duration above</em></>}{requireReasoning ? " · + reasoning" : ""}</>
              : "Pick a mode to get started."}
          </p>
          {!designOpen ? (
            <button
              type="button"
              onClick={() => setDesignOpen(true)}
              disabled={!canBegin}
              data-testid="design-begin-button"
              className="inline-flex items-center gap-2 bg-ink hover:bg-ink/85 disabled:opacity-40 disabled:cursor-not-allowed text-canvas rounded-lg px-5 py-2.5 transition-all hover:-translate-y-0.5"
            >
              <Sparkle size={16} weight="bold" />
              <span className="font-medium text-sm">Begin with the Analyst</span>
              <ArrowRight size={14} weight="bold" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setDesignOpen(false)}
              data-testid="design-collapse-button"
              className="btn-quiet text-sm"
            >
              Collapse workspace
            </button>
          )}
        </div>
      </section>

      {/* Inline 6-agent workspace */}
      <AnimatePresence>
        {designOpen && (
          <motion.section
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            data-testid="inline-guided-section"
          >
            <GuidedWorkflow
              role={role}
              initialMode={assessmentMode || "interview"}
              initialReasoning={requireReasoning}
              initialMinutes={minutes}
              initialNotes={notes}
              onFinalized={onCaseFinalized}
            />
          </motion.section>
        )}
      </AnimatePresence>

      {/* Cases list */}
      <section>
        <h2 className="font-display text-2xl font-bold tracking-tight mb-5">Drafted cases</h2>
        {cases.length === 0 ? (
          <div className="encore-card p-10 text-center text-ink-soft" data-testid="cases-empty-state">
            <FileText weight="duotone" size={26} className="mx-auto text-brand mb-2" />
            No case studies yet for this role.
          </div>
        ) : (
          <div className="space-y-3">
            {cases.map((c) => (
              <DraftedCaseRow
                key={c.id}
                caseDoc={c}
                expanded={expandedCaseId === c.id}
                onToggle={() => setExpandedCaseId((cur) => (cur === c.id ? null : c.id))}
                onRevise={() => reviseCase(c)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ============== Drafted case row ============== */
function DraftedCaseRow({ caseDoc, expanded, onToggle, onRevise }) {
  const c = caseDoc;
  const reduce = useReducedMotion();
  return (
    <div className="encore-card overflow-hidden" data-testid={`case-row-${c.id}`}>
      <button
        type="button"
        onClick={onToggle}
        data-testid={`case-row-toggle-${c.id}`}
        className="w-full text-left p-6 hover:bg-black/[0.015] transition-colors"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <StatusPill status={c.status} />
              {c.assessment_mode && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border border-brand/30 bg-brand/[0.05] text-brand rounded-full px-2 py-0.5">
                  {MODE_LABEL[c.assessment_mode] || c.assessment_mode}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-xs text-ink-soft">
                <Clock size={12} /> ~{c.estimated_minutes} min
              </span>
              <span className="text-xs text-ink-soft">&middot; {c.sections?.length || 0} sections &middot; {c.rubric?.length || 0} rubric dimensions</span>
            </div>
            <h3 className="font-display text-lg font-bold tracking-tight mb-2">{c.title}</h3>
            <p className="text-sm text-ink-soft line-clamp-2">{c.scenario_text}</p>
          </div>
          {expanded
            ? <CaretUp size={14} className="text-ink-soft mt-1 shrink-0" />
            : <CaretDown size={14} className="text-ink-soft mt-1 shrink-0" />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="border-t border-black/[0.06] bg-canvas/40"
            data-testid={`case-row-expanded-${c.id}`}
          >
            <div className="p-6 space-y-5">
              <div>
                <p className="encore-overline mb-2">Scenario</p>
                <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{c.scenario_text}</p>
              </div>

              <div>
                <p className="encore-overline mb-2">Sections ({c.sections?.length || 0})</p>
                <div className="space-y-2.5">
                  {(c.sections || []).map((s, i) => (
                    <div key={s.id} className="border border-black/[0.06] rounded-lg p-4">
                      <p className="text-[11px] text-ink-soft mb-0.5">Section {i + 1}</p>
                      <h4 className="font-display font-bold tracking-tight mb-1">{s.title}</h4>
                      <p className="text-sm text-ink mb-2">{s.intro}</p>
                      <ol className="list-decimal list-inside text-sm text-ink space-y-1">
                        {(s.questions || []).map((q, j) => <li key={j}>{q}</li>)}
                      </ol>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="encore-overline mb-2">Rubric ({c.rubric?.length || 0} dimensions &middot; weights sum to 100)</p>
                <ul className="space-y-2">
                  {(c.rubric || []).map((r) => (
                    <li key={r.id} className="text-sm">
                      <strong>{r.name}</strong> <span className="text-ink-soft text-xs">— {r.weight}%</span>
                      <p className="text-xs text-ink-soft mt-0.5">{r.description}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-black/[0.06] flex-wrap">
                <button
                  type="button"
                  onClick={onRevise}
                  data-testid={`case-row-revise-${c.id}`}
                  className="btn-quiet text-sm"
                  title="Re-open the 6-agent workspace at the same mode + duration"
                >
                  <Sparkle size={13} weight="duotone" /> Revise via agents
                </button>
                <Link
                  to={`/cases/${c.id}`}
                  data-testid={`case-row-open-${c.id}`}
                  className="btn-primary text-sm"
                >
                  Open editor <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusPill({ status }) {
  const cfg = {
    draft: { label: "Draft", cls: "bg-canvas border-black/10 text-ink-soft" },
    approved: { label: "Approved", cls: "bg-brand-moss/5 border-brand-moss/20 text-brand-moss", icon: CheckCircle },
    archived: { label: "Archived", cls: "bg-black/5 border-black/10 text-ink-soft" },
  }[status] || { label: status, cls: "bg-canvas border-black/10 text-ink-soft" };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 ${cfg.cls}`}>
      {Icon && <Icon weight="fill" size={10} />}
      {cfg.label}
    </span>
  );
}

// EditableField — click-to-edit inline text used for role title and free-text fields.
function EditableField({ value, onSave, multiline = false, className = "", placeholder = "", testid }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(value || ""); }, [value]);

  const commit = async () => {
    if (draft === (value || "")) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(draft); } finally { setSaving(false); setEditing(false); }
  };

  if (editing) {
    const common = {
      autoFocus: true,
      value: draft,
      onChange: (e) => setDraft(e.target.value),
      onBlur: commit,
      "data-testid": testid,
      className: `w-full bg-canvas border border-brand/40 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand/20 outline-none ${className}`,
      disabled: saving,
    };
    if (multiline) {
      return (
        <textarea
          {...common}
          rows={Math.max(3, (draft || "").split("\n").length)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setDraft(value || ""); setEditing(false); }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
          }}
        />
      );
    }
    return (
      <input
        {...common}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setDraft(value || ""); setEditing(false); }
          if (e.key === "Enter") commit();
        }}
      />
    );
  }

  const isEmpty = !value || value.length === 0;
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      data-testid={testid ? `${testid}-trigger` : undefined}
      title="Click to edit"
      className={`group/edit text-left w-full hover:bg-black/[0.02] -mx-2 px-2 py-1 rounded-md transition-colors ${className}`}
    >
      {isEmpty ? <span className="text-ink-soft italic">{placeholder}</span> : <span className="whitespace-pre-wrap">{value}</span>}
      <PencilSimple size={12} className="inline-block ml-2 opacity-0 group-hover/edit:opacity-50 transition-opacity align-middle" />
    </button>
  );
}
