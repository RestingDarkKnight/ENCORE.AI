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
import ProtectedRoute from "@/components/ProtectedRoute";

function Root() {
  const { manager, loading } = useAuth();
  if (loading) return null;
  return manager ? <Navigate to="/dashboard" replace /> : <Landing />;
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
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/roles" element={<ProtectedRoute><RolesList /></ProtectedRoute>} />
            <Route path="/roles/new" element={<ProtectedRoute><CreateRole /></ProtectedRoute>} />
            <Route path="/roles/:roleId" element={<ProtectedRoute><RoleDetail /></ProtectedRoute>} />
            <Route path="/cases/:caseId" element={<ProtectedRoute><CaseDetail /></ProtectedRoute>} />
            <Route path="/reports/:assignmentId" element={<ProtectedRoute><ReportView /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-right" richColors closeButton />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
