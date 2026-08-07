import "@/App.css";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Toaster } from "sonner";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import AuthCallback from "@/pages/AuthCallback";
import Dashboard from "@/pages/Dashboard";
import RolesList from "@/pages/RolesList";
import CreateRole from "@/pages/CreateRole";
import RoleDetail from "@/pages/RoleDetail";
import CaseDetail from "@/pages/CaseDetail";
import GuidedCase from "@/pages/GuidedCase";
import ReportView from "@/pages/ReportView";
import Reports from "@/pages/Reports";
import CompareCandidates from "@/pages/CompareCandidates";
import SharedReport from "@/pages/SharedReport";
import TakeCase from "@/pages/TakeCase";
import ProtectedRoute from "@/components/ProtectedRoute";
import PageTransition from "@/components/PageTransition";

function Root() {
  const { manager, loading } = useAuth();
  if (loading) return null;
  return manager ? <Navigate to="/dashboard" replace /> : <Landing />;
}

// Scroll to top on route change — keeps page transitions readable
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }, [pathname]);
  return null;
}

// Wrap each route element so AnimatePresence can transition between them
const wrap = (el) => <PageTransition>{el}</PageTransition>;

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={wrap(<Root />)} />
        <Route path="/login" element={wrap(<Login />)} />
        <Route path="/signup" element={wrap(<Signup />)} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/take/:token" element={wrap(<TakeCase />)} />
        <Route path="/r/:shareToken" element={wrap(<SharedReport />)} />
        <Route path="/dashboard" element={<ProtectedRoute>{wrap(<Dashboard />)}</ProtectedRoute>} />
        <Route path="/roles" element={<ProtectedRoute>{wrap(<RolesList />)}</ProtectedRoute>} />
        <Route path="/roles/new" element={<ProtectedRoute>{wrap(<CreateRole />)}</ProtectedRoute>} />
        <Route path="/roles/:roleId" element={<ProtectedRoute>{wrap(<RoleDetail />)}</ProtectedRoute>} />
        <Route path="/cases/:caseId" element={<ProtectedRoute>{wrap(<CaseDetail />)}</ProtectedRoute>} />
        <Route path="/roles/:roleId/cases/new-guided" element={<ProtectedRoute>{wrap(<GuidedCase />)}</ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute>{wrap(<Reports />)}</ProtectedRoute>} />
        <Route path="/reports/compare/:caseId" element={<ProtectedRoute>{wrap(<CompareCandidates />)}</ProtectedRoute>} />
        <Route path="/reports/:assignmentId" element={<ProtectedRoute>{wrap(<ReportView />)}</ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <ScrollToTop />
          <AnimatedRoutes />
          <Toaster position="top-right" closeButton expand={false} />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
