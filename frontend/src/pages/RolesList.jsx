// RolesList.jsx — full list of roles for the manager.
// Adds per-card kebab menu (Archive / Unarchive) and a "Show archived" toggle.
// Uses optimistic refresh after archive actions.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Plus, Briefcase, ArrowRight, Archive, ArrowCounterClockwise } from "@phosphor-icons/react";
import KebabMenu from "@/components/KebabMenu";

export default function RolesList() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/roles", { params: { include_archived: showArchived } });
      setRoles(data);
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => { load(); }, [load]);

  const onArchive = async (role) => {
    if (!window.confirm(`Archive "${role.job_title}"? It will be hidden from your active list. You can restore it any time.`)) return;
    try {
      await api.post(`/roles/${role.id}/archive`);
      toast.success("Role archived.");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not archive role.");
    }
  };

  const onUnarchive = async (role) => {
    try {
      await api.post(`/roles/${role.id}/unarchive`);
      toast.success("Role restored.");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not restore role.");
    }
  };

  return (
    <div className="space-y-8" data-testid="roles-list-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="encore-overline mb-2">Roles</p>
          <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tighter">All roles</h1>
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-ink-soft cursor-pointer select-none" data-testid="roles-list-archived-toggle-label">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              data-testid="roles-list-archived-toggle"
              className="h-3.5 w-3.5 rounded border-black/20 text-brand focus:ring-brand/20"
            />
            Show archived
          </label>
          <Link
            to="/roles/new"
            data-testid="roles-list-new-button"
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white rounded-lg px-4 py-2.5 transition-all hover:-translate-y-0.5"
          >
            <Plus size={16} weight="bold" />
            <span className="font-medium text-sm">New role</span>
          </Link>
        </div>
      </header>

      {loading ? (
        <div className="encore-card p-10 text-center text-ink-soft">Loading…</div>
      ) : roles.length === 0 ? (
        <div className="encore-card p-12 text-center" data-testid="roles-list-empty">
          <Briefcase weight="duotone" size={28} className="mx-auto text-brand mb-3" />
          <p className="text-ink-soft">
            {showArchived ? "No archived roles." : "No roles yet. Create your first one to draft a tailored case."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map((role) => (
            <div key={role.id} className="relative">
              <Link
                to={`/roles/${role.id}`}
                data-testid={`roles-list-item-${role.id}`}
                className={`encore-card p-6 hover:-translate-y-0.5 transition-all hover:shadow-md group block ${
                  role.archived ? "opacity-75" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="encore-overline">{role.seniority} · {role.difficulty_level}</p>
                  {role.archived && (
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-black/[0.05] text-ink-soft rounded-full px-2 py-0.5">
                      Archived
                    </span>
                  )}
                </div>
                <h3 className="font-display text-lg font-bold tracking-tight mb-1 group-hover:text-brand transition-colors pr-9">
                  {role.job_title}
                </h3>
                {role.industry && <p className="text-sm text-ink-soft mb-3">{role.industry}</p>}
                <div className="flex items-center justify-between text-xs text-ink-soft pt-3 border-t border-black/[0.05]">
                  <span>{role.case_count} case{role.case_count === 1 ? "" : "s"}</span>
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
              <div className="absolute right-3 top-3">
                <KebabMenu
                  testid={`roles-list-kebab-${role.id}`}
                  items={
                    role.archived
                      ? [
                          {
                            label: "Restore role",
                            icon: ArrowCounterClockwise,
                            onClick: () => onUnarchive(role),
                            testid: `roles-list-unarchive-${role.id}`,
                          },
                        ]
                      : [
                          {
                            label: "Archive role",
                            icon: Archive,
                            onClick: () => onArchive(role),
                            danger: true,
                            testid: `roles-list-archive-${role.id}`,
                          },
                        ]
                  }
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
