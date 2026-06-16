import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  ArrowLeft, Sparkle, FileText, Warning, ArrowRight, CheckCircle, Clock,
  Archive, ArrowCounterClockwise, PencilSimple,
} from "@phosphor-icons/react";
import KebabMenu from "@/components/KebabMenu";
import GenerationTicker from "@/components/GenerationTicker";

const DIFFICULTY_LABEL = {
  foundational: "Foundational",
  applied: "Applied",
  advanced: "Advanced",
  expert: "Expert",
};

export default function RoleDetail() {
  const { roleId } = useParams();
  const navigate = useNavigate();
  const [role, setRole] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [claudeOk, setClaudeOk] = useState(false);
  const [notes, setNotes] = useState("");

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

  const generate = async () => {
    setGenerating(true);
    try {
      const { data } = await api.post("/cases/generate", { role_id: roleId, notes });
      setCases((cs) => [data, ...cs]);
      toast.success("Case study drafted.");
      setNotes("");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div className="text-center text-ink-soft py-16">Loading role…</div>;
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
        <p className="encore-overline mb-2">{role.seniority} · {role.industry || "—"} · {DIFFICULTY_LABEL[role.difficulty_level]}</p>
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

      {/* Case generation */}
      <section className={`encore-card p-7 ${generating ? "encore-tracing-beam" : ""}`} data-testid="case-generate-card">
        <div className="flex items-start gap-4 mb-5">
          <div className="h-10 w-10 rounded-md bg-brand-sand/10 text-brand-sand flex items-center justify-center shrink-0">
            <Sparkle weight="duotone" size={20} />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight">Generate case study with Claude</h2>
            <p className="text-sm text-ink-soft mt-1">
              {generating
                ? "Hang tight — the heavy lifting is happening server-side."
                : "Claude drafts a sectioned work-simulation case with a weighted rubric. ~30\u201360 seconds."}
            </p>
          </div>
        </div>

        <GenerationTicker active={generating} />

        {!claudeOk && (
          <div className="flex items-start gap-3 bg-signal-warning/5 border border-signal-warning/20 rounded-lg p-4 mb-5" data-testid="claude-not-configured-warning">
            <Warning weight="fill" size={18} className="text-signal-warning shrink-0 mt-0.5" />
            <p className="text-sm text-ink">
              Claude isn&rsquo;t configured yet. Add <code className="font-mono text-xs px-1 py-0.5 bg-black/[0.04] rounded">ANTHROPIC_API_KEY</code> to the backend env and restart to enable generation.
            </p>
          </div>
        )}

        <label className="block text-sm font-medium text-ink-soft mb-1.5">Optional notes for the model</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="e.g. emphasize trade-off reasoning around eventual consistency"
          data-testid="case-generate-notes-input"
          className="w-full bg-transparent border border-black/15 rounded-lg px-4 py-3 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all resize-none"
        />

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <button
            type="button"
            onClick={generate}
            disabled={generating || !claudeOk || role.archived}
            data-testid="case-generate-button"
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover disabled:opacity-50 text-white rounded-lg px-5 py-2.5 transition-all hover:-translate-y-0.5"
          >
            <Sparkle size={16} weight="bold" />
            <span className="font-medium text-sm">{generating ? "Drafting with Claude\u2026" : role.archived ? "Restore role to generate" : "Generate case study"}</span>
          </button>
          <Link
            to={`/roles/${role.id}/cases/new-guided`}
            data-testid="case-guided-button"
            className="btn-quiet text-sm"
            title="Six-agent workflow with memory — slower but with feedback at every step"
          >
            <Sparkle size={14} weight="duotone" /> Build guided (6-agent)
          </Link>
        </div>
      </section>

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
              <Link
                key={c.id}
                to={`/cases/${c.id}`}
                data-testid={`case-item-${c.id}`}
                className="encore-card p-6 hover:-translate-y-0.5 hover:shadow-md transition-all group block"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <StatusPill status={c.status} />
                      <span className="inline-flex items-center gap-1 text-xs text-ink-soft">
                        <Clock size={12} /> ~{c.estimated_minutes} min
                      </span>
                      <span className="text-xs text-ink-soft">· {c.sections?.length || 0} sections · {c.rubric?.length || 0} rubric dimensions</span>
                    </div>
                    <h3 className="font-display text-lg font-bold tracking-tight mb-2 group-hover:text-brand transition-colors">{c.title}</h3>
                    <p className="text-sm text-ink-soft line-clamp-2">{c.scenario_text}</p>
                  </div>
                  <ArrowRight size={16} className="text-ink-soft mt-1 transition-transform group-hover:translate-x-1 shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
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
// Single-line: commits on Enter or blur. Multiline: commits on blur or Cmd/Ctrl+Enter.
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
