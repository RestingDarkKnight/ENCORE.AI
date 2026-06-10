import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Plus, Briefcase, Sparkle, CheckCircle, ArrowRight, UsersThree, ChartBar, ScanSmiley,
} from "@phosphor-icons/react";
import BadgeStrip from "@/components/BadgeStrip";

function MomentumCard({ label, value, target, icon: Icon, testid, accent = "brand" }) {
  const safeTarget = Math.max(1, target);
  const pct = Math.min(1, value / safeTarget);
  const stroke = "#1A2E35";
  return (
    <div className="encore-card p-6 flex items-center gap-5" data-testid={testid}>
      <div className="relative h-16 w-16 shrink-0">
        <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
          <circle cx="18" cy="18" r="15.915" fill="none" stroke="rgba(10,15,26,0.08)" strokeWidth="3" />
          <motion.circle
            cx="18" cy="18" r="15.915" fill="none"
            stroke={stroke} strokeWidth="3" strokeLinecap="round"
            strokeDasharray="100"
            initial={{ strokeDashoffset: 100 }}
            animate={{ strokeDashoffset: 100 - pct * 100 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon weight="duotone" size={18} className={`text-${accent}`} />
        </div>
      </div>
      <div className="min-w-0">
        <p className="encore-overline mb-1">{label}</p>
        <p className="font-display text-3xl font-black tracking-tighter leading-none">{value}</p>
        {target > 1 && (
          <p className="text-[11px] text-ink-soft mt-1">
            {value < target ? `Next milestone at ${target}` : "Milestone reached"}
          </p>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { manager } = useAuth();
  const [roles, setRoles] = useState([]);
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [rolesRes, statsRes, healthRes] = await Promise.all([
          api.get("/roles"),
          api.get("/stats/manager").catch(() => ({ data: null })),
          api.get("/health").catch(() => null),
        ]);
        setRoles(rolesRes.data);
        setStats(statsRes.data);
        setHealth(healthRes?.data ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Compute next-milestone targets
  const target = (count, breakpoints = [1, 3, 5, 10]) => {
    const next = breakpoints.find((b) => count < b);
    return next ?? breakpoints[breakpoints.length - 1];
  };

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

      {/* Momentum rings */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="momentum-section">
        <MomentumCard label="Roles created" value={stats?.roles ?? 0} target={target(stats?.roles ?? 0)} icon={Briefcase} testid="stat-roles" />
        <MomentumCard label="Cases generated" value={stats?.cases ?? 0} target={target(stats?.cases ?? 0, [1, 3, 5, 10])} icon={Sparkle} testid="stat-cases" />
        <MomentumCard label="Candidates scored" value={stats?.evaluated ?? 0} target={target(stats?.evaluated ?? 0, [1, 5, 10, 25])} icon={ChartBar} testid="stat-evaluated" />
        <MomentumCard label="Decisions made" value={stats?.decisions ?? 0} target={target(stats?.decisions ?? 0, [1, 5, 10, 25])} icon={CheckCircle} testid="stat-decisions" />
      </section>

      {/* Badges */}
      {stats?.badges && <BadgeStrip badges={stats.badges} />}

      {/* AI engine status */}
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
          <div className="encore-card p-10 text-center text-ink-soft" data-testid="dashboard-loading">Loading roles…</div>
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

        {/* Candidate activity */}
        <div className="mt-10">
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="font-display text-2xl font-bold tracking-tight">Candidate activity</h2>
            {stats?.invited > 0 && (
              <span className="text-xs text-ink-soft">{stats.invited} invited · {stats.submitted} submitted · {stats.evaluated} scored</span>
            )}
          </div>
          {!stats?.invited ? (
            <div className="encore-card p-10 text-center" data-testid="candidate-activity-empty">
              <div className="mx-auto h-12 w-12 rounded-full bg-brand-moss/5 text-brand-moss flex items-center justify-center mb-4">
                <UsersThree weight="duotone" size={22} />
              </div>
              <h3 className="font-display text-lg font-bold tracking-tight mb-1">No candidates invited yet</h3>
              <p className="text-sm text-ink-soft max-w-md mx-auto mb-5">
                Approve a case, then send the unique link to candidates from inside the case page.
              </p>
              {roles.length > 0 ? (
                <Link to={`/roles/${roles[0].id}`} data-testid="empty-state-go-to-case" className="inline-flex items-center gap-2 text-sm font-medium border border-black/15 hover:border-black/30 hover:bg-black/[0.02] rounded-lg px-4 py-2">
                  Open a case <ArrowRight size={13} />
                </Link>
              ) : (
                <Link to="/roles/new" className="inline-flex items-center gap-2 text-sm font-medium border border-black/15 hover:border-black/30 hover:bg-black/[0.02] rounded-lg px-4 py-2">
                  Create your first role <ArrowRight size={13} />
                </Link>
              )}
            </div>
          ) : (
            <div className="encore-card p-6 flex items-center gap-4 flex-wrap" data-testid="candidate-activity-summary">
              <div className="flex items-center gap-2 text-sm">
                <ScanSmiley weight="duotone" size={18} className="text-brand-moss" />
                <span className="text-ink">
                  {stats.advanced > 0
                    ? <>You&rsquo;ve advanced <strong>{stats.advanced}</strong> candidate{stats.advanced === 1 ? "" : "s"} so far.</>
                    : <>{stats.submitted} candidate{stats.submitted === 1 ? "" : "s"} have submitted. Open a case to see scored reports.</>}
                </span>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
