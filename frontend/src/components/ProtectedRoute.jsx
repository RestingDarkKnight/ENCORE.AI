import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import AppShell from "@/components/AppShell";

export default function ProtectedRoute({ children }) {
  const { manager, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="auth-loading">
        <div className="encore-overline">Loading…</div>
      </div>
    );
  }
  if (!manager) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <AppShell>{children}</AppShell>;
}
