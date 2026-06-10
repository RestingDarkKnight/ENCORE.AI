import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Plus, Briefcase, Sparkle, CheckCircle, ArrowRight } from "@phosphor-icons/react";

function StatCard({ label, value, icon: Icon, testid }) {
  return (
    <div className="encore-card p-6" data-testid={testid}>
      <div className="flex items-center justify-between mb-4">
        <p className="encore-overline">{label}</p>
        <div className="h-8 w-8 rounded-md bg-brand/5 text-brand flex items-center justify-center">
          <Icon weight="duotone" size={18} />
        </div>
      </div>
      <p className="font-display text-4xl font-black tracking-tighter text-ink">{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const { manager } = useAuth();
  const [roles, setRoles] = useState([]);
  const [approvedCount, setApprovedCount] = useState(0);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [rolesRes, healthRes] = await Promise.all([
          api.get("/roles"),
          api.get("/health").catch(() => null),
        ]);
        setRoles(rolesRes.data);
        setHealth(healthRes?.data ?? null);

        // Count approved cases across all roles
        const counts = await Promise.all(
          rolesRes.data.map((r) =>
            api.get(`/cases/role/${r.id}`).then((r2) => r2.data.filter((c) => c.status === "approved").length).catch(() => 0)
          )
        );
        setApprovedCount(counts.reduce((a, b) => a + b, 0));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalCases = roles.reduce((sum, r) => sum + (r.case_count || 0), 0);

  return (
    <div className="space-y-10" data-testid="dashboard-page">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div>
          <p className="encore-overline mb-2">Hiring Studio</p>
          <h1 className="text-4xl sm:text-5xl font-display font-black tracking-tighter leading-[1.05]">
            Welcome, {manager?.full_name?.split(" ")[0] || "Manager"}.
          </h1>
          <p className="text-ink-soft mt-3 max-w-xl">
            Describe a role. ENCORE drafts a realistic work-simulation case with a scoring rubric. You approve, share, evaluate.
          </p>
        </div>
        <Link
          to="/roles/new"
          data-testid="dashboard-new-role-button"
          className="group inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white rounded-lg px-5 py-3 transition-all hover:-translate-y-0.5 shadow-sm self-start md:self-auto"
        >
          <Plus size={16} weight="bold" />
          <span className="font-medium">New role</span>
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
        </Link>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Roles created" value={loading ? "—" : roles.length} icon={Briefcase} testid="stat-roles" />
        <StatCard label="Cases generated" value={loading ? "—" : totalCases} icon={Sparkle} testid="stat-cases" />
        <StatCard label="Approved" value={loading ? "—" : approvedCount} icon={CheckCircle} testid="stat-approved" />
      </section>

      <section data-testid="claude-status-section" className="encore-card p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="encore-overline mb-1">AI Engine</p>
            <h2 className="font-display text-xl font-bold tracking-tight">
              Claude {health?.model || "claude-opus-4-8"}
            </h2>
            <p className="text-sm text-ink-soft mt-1">
              {health?.claude_configured
                ? "Connected and ready for case generation & evaluation."
                : "Awaiting ANTHROPIC_API_KEY — add it server-side to enable live generation."}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider border ${
              health?.claude_configured
                ? "border-signal-success/30 bg-signal-success/5 text-signal-success"
                : "border-signal-warning/30 bg-signal-warning/5 text-signal-warning"
            }`}
            data-testid="claude-status-pill"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${health?.claude_configured ? "bg-signal-success" : "bg-signal-warning"}`} />
            {health?.claude_configured ? "Connected" : "Awaiting key"}
          </span>
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="font-display text-2xl font-bold tracking-tight">Your roles</h2>
          <Link to="/roles" className="text-sm text-ink-soft hover:text-ink" data-testid="dashboard-view-all-roles">
            View all
          </Link>
        </div>

        {loading ? (
          <div className="encore-card p-10 text-center text-ink-soft">Loading roles…</div>
        ) : roles.length === 0 ? (
          <div className="encore-card p-12 text-center" data-testid="dashboard-empty-state">
            <div className="mx-auto h-12 w-12 rounded-full bg-brand/5 text-brand flex items-center justify-center mb-4">
              <Briefcase weight="duotone" size={22} />
            </div>
            <h3 className="font-display text-xl font-bold tracking-tight mb-2">No roles yet</h3>
            <p className="text-ink-soft max-w-md mx-auto mb-6">
              Add your first role to draft an AI-generated case study tailored to its responsibilities.
            </p>
            <Link
              to="/roles/new"
              data-testid="empty-state-new-role-button"
              className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white rounded-lg px-5 py-2.5 transition-all hover:-translate-y-0.5"
            >
              <Plus size={16} weight="bold" />
              <span className="font-medium">Create your first role</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.slice(0, 6).map((role) => (
              <Link
                key={role.id}
                to={`/roles/${role.id}`}
                data-testid={`role-card-${role.id}`}
                className="encore-card p-6 hover:-translate-y-0.5 transition-all hover:shadow-md group"
              >
                <p className="encore-overline mb-2">{role.seniority} · {role.difficulty_level}</p>
                <h3 className="font-display text-lg font-bold tracking-tight mb-1 group-hover:text-brand transition-colors">
                  {role.job_title}
                </h3>
                {role.industry && <p className="text-sm text-ink-soft mb-3">{role.industry}</p>}
                <div className="flex items-center justify-between text-xs text-ink-soft pt-3 border-t border-black/[0.05]">
                  <span>{role.case_count} case{role.case_count === 1 ? "" : "s"}</span>
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-10">
          <h2 className="font-display text-2xl font-bold tracking-tight mb-5">Recent candidate activity</h2>
          <div className="encore-card p-8 text-center text-ink-soft" data-testid="candidate-activity-empty">
            <p className="text-sm">Assignments and submissions will appear here once you start inviting candidates.</p>
            <p className="text-xs mt-1 opacity-70">Coming in Phase 2.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
