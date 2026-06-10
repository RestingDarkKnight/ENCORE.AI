import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Compass, SignOut, User } from "@phosphor-icons/react";

export default function AppShell({ children }) {
  const { manager, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isSME = manager?.role === "sme";

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="encore-glass-header" data-testid="app-header">
        <div className="mx-auto max-w-7xl px-6 lg:px-10 h-16 flex items-center justify-between">
          <Link to={isSME ? "/sme" : "/dashboard"} className="flex items-center gap-2.5" data-testid="brand-home-link">
            <div className="h-8 w-8 rounded-md bg-brand flex items-center justify-center text-white">
              <Compass weight="duotone" size={18} />
            </div>
            <span className="font-display font-black text-lg tracking-tight">ENCORE</span>
            <span className="hidden md:inline encore-overline ml-3">Hiring Assessment Studio</span>
          </Link>

          <nav className="flex items-center gap-1">
            <NavLink
              to="/dashboard"
              data-testid="nav-dashboard"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive ? "text-ink bg-black/[0.04]" : "text-ink-soft hover:text-ink"
                }`
              }
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/roles"
              data-testid="nav-roles"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive ? "text-ink bg-black/[0.04]" : "text-ink-soft hover:text-ink"
                }`
              }
            >
              Roles
            </NavLink>
            <NavLink
              to="/constraints"
              data-testid="nav-constraints"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive ? "text-ink bg-black/[0.04]" : "text-ink-soft hover:text-ink"
                }`
              }
            >
              Constraints
            </NavLink>
            <div className="mx-2 h-5 w-px bg-black/10" />
            <div className="flex items-center gap-2 pl-1" data-testid="manager-pill">
              <div className="h-7 w-7 rounded-full bg-brand/10 text-brand flex items-center justify-center">
                <User weight="duotone" size={14} />
              </div>
              <div className="hidden sm:block leading-tight">
                <div className="text-xs font-medium text-ink">{manager?.full_name}</div>
                <div className="text-[10px] text-ink-soft">{manager?.email}</div>
              </div>
              <button
                onClick={handleLogout}
                data-testid="logout-button"
                className="ml-2 inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink transition-colors px-2 py-1 rounded-md hover:bg-black/[0.04]"
                title="Sign out"
              >
                <SignOut size={14} />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 lg:px-10 py-10">{children}</main>
    </div>
  );
}
