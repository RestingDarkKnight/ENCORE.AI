import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Sparkle, FileText, Warning, ArrowRight, CheckCircle, Clock } from "@phosphor-icons/react";
import ReviewStatusPill from "@/components/ReviewStatusPill";

const DIFFICULTY_LABEL = {
  foundational: "Foundational",
  applied: "Applied",
  advanced: "Advanced",
  expert: "Expert",
};

export default function RoleDetail() {
  const { roleId } = useParams();
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
        api.get(`/cases/role/${roleId}`),
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
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink" data-testid="role-detail-back">
        <ArrowLeft size={14} /> Back to dashboard
      </Link>

      <header>
        <p className="encore-overline mb-2">{role.seniority} · {role.industry || "—"} · {DIFFICULTY_LABEL[role.difficulty_level]}</p>
        <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tighter leading-[1.05] mb-5">{role.job_title}</h1>

        <div className="grid md:grid-cols-2 gap-4 mt-6">
          {role.success_criteria && (
            <div className="encore-card p-5">
              <p className="encore-overline mb-2">Success looks like</p>
              <p className="text-sm text-ink">{role.success_criteria}</p>
            </div>
          )}
          {role.common_challenges && (
            <div className="encore-card p-5">
              <p className="encore-overline mb-2">Common challenges</p>
              <p className="text-sm text-ink">{role.common_challenges}</p>
            </div>
          )}
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
                ? "ENCORE is designing your case — choosing stakeholders, picking real constraints, drafting a rubric…"
                : "Claude drafts a sectioned work-simulation case with a weighted rubric. ~30–60 seconds."}
            </p>
          </div>
        </div>

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

        <button
          type="button"
          onClick={generate}
          disabled={generating || !claudeOk}
          data-testid="case-generate-button"
          className="mt-4 inline-flex items-center gap-2 bg-brand hover:bg-brand-hover disabled:opacity-50 text-white rounded-lg px-5 py-2.5 transition-all hover:-translate-y-0.5"
        >
          <Sparkle size={16} weight="bold" />
          <span className="font-medium text-sm">{generating ? "Drafting with Claude…" : "Generate case study"}</span>
        </button>
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
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <StatusPill status={c.status} />
                      <ReviewStatusPill status={c.review_status} />
                      <span className="inline-flex items-center gap-1 text-xs text-ink-soft">
                        <Clock size={12} /> ~{c.estimated_minutes} min
                      </span>
                      {c.grounded_on && (c.grounded_on.approved || c.grounded_on.constraints || c.grounded_on.rejected) ? (
                        <span className="text-[10px] text-brand-sand font-medium" title="Grounded on validated material">
                          ⚓ grounded · {c.grounded_on.approved}A · {c.grounded_on.constraints}C · {c.grounded_on.rejected}R
                        </span>
                      ) : null}
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
