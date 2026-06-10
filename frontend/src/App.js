import "@/App.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Dashboard from "@/pages/Dashboard";
import RolesList from "@/pages/RolesList";
import CreateRole from "@/pages/CreateRole";
import RoleDetail from "@/pages/RoleDetail";
import CaseDetail from "@/pages/CaseDetail";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/roles" element={<ProtectedRoute><RolesList /></ProtectedRoute>} />
            <Route path="/roles/new" element={<ProtectedRoute><CreateRole /></ProtectedRoute>} />
            <Route path="/roles/:roleId" element={<ProtectedRoute><RoleDetail /></ProtectedRoute>} />
            <Route path="/cases/:caseId" element={<ProtectedRoute><CaseDetail /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          <Toaster position="top-right" richColors closeButton />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
