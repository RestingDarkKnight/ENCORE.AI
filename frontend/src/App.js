import "@/App.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Dashboard from "@/pages/Dashboard";
import RolesList from "@/pages/RolesList";
import CreateRole from "@/pages/CreateRole";
import RoleDetail from "@/pages/RoleDetail";
import CaseDetail from "@/pages/CaseDetail";
import ReportView from "@/pages/ReportView";
import TakeCase from "@/pages/TakeCase";
import SMEDashboard from "@/pages/SMEDashboard";
import SMEReviewCase from "@/pages/SMEReviewCase";
import ConstraintsAdmin from "@/pages/ConstraintsAdmin";
import AppShell from "@/components/AppShell";
import ProtectedRoute from "@/components/ProtectedRoute";

function Root() {
  const { manager, loading } = useAuth();
  if (loading) return null;
  if (!manager) return <Landing />;
  return manager.role === "sme" ? <Navigate to="/sme" replace /> : <Navigate to="/dashboard" replace />;
}

function SMEOnly({ children }) {
  const { manager, loading } = useAuth();
  if (loading) return null;
  if (!manager) return <Navigate to="/login" replace />;
  if (manager.role !== "sme") return <Navigate to="/dashboard" replace />;
  return children;
}

function ManagerOnlyShell({ children }) {
  const { manager, loading } = useAuth();
  if (loading) return null;
  if (!manager) return <Navigate to="/login" replace />;
  if (manager.role === "sme") return <Navigate to="/sme" replace />;
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Root />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/take/:token" element={<TakeCase />} />
            {/* SME-only */}
            <Route path="/sme" element={<SMEOnly><SMEDashboard /></SMEOnly>} />
            <Route path="/sme/cases/:caseId" element={<SMEOnly><SMEReviewCase /></SMEOnly>} />
            {/* Manager-only */}
            <Route path="/dashboard" element={<ManagerOnlyShell><Dashboard /></ManagerOnlyShell>} />
            <Route path="/roles" element={<ManagerOnlyShell><RolesList /></ManagerOnlyShell>} />
            <Route path="/roles/new" element={<ManagerOnlyShell><CreateRole /></ManagerOnlyShell>} />
            <Route path="/roles/:roleId" element={<ManagerOnlyShell><RoleDetail /></ManagerOnlyShell>} />
            <Route path="/cases/:caseId" element={<ManagerOnlyShell><CaseDetail /></ManagerOnlyShell>} />
            <Route path="/reports/:assignmentId" element={<ManagerOnlyShell><ReportView /></ManagerOnlyShell>} />
            <Route path="/constraints" element={<ManagerOnlyShell><ConstraintsAdmin /></ManagerOnlyShell>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-right" richColors closeButton />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
