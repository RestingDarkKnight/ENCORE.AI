import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Plus, Briefcase, ArrowRight } from "@phosphor-icons/react";

export default function RolesList() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/roles").then((r) => setRoles(r.data)).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8" data-testid="roles-list-page">
      <header className="flex items-end justify-between gap-6">
        <div>
          <p className="encore-overline mb-2">Roles</p>
          <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tighter">All roles</h1>
        </div>
        <Link
          to="/roles/new"
          data-testid="roles-list-new-button"
          className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white rounded-lg px-4 py-2.5 transition-all hover:-translate-y-0.5"
        >
          <Plus size={16} weight="bold" />
          <span className="font-medium text-sm">New role</span>
        </Link>
      </header>

      {loading ? (
        <div className="encore-card p-10 text-center text-ink-soft">Loading…</div>
      ) : roles.length === 0 ? (
        <div className="encore-card p-12 text-center">
          <Briefcase weight="duotone" size={28} className="mx-auto text-brand mb-3" />
          <p className="text-ink-soft">No roles yet. Create your first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map((role) => (
            <Link
              key={role.id}
              to={`/roles/${role.id}`}
              data-testid={`roles-list-item-${role.id}`}
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
    </div>
  );
}
