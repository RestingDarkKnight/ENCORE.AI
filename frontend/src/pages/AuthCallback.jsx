// AuthCallback.jsx — Emergent-managed Google Auth completes here.
// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
//
// Emergent redirects Google-authenticated users to `/auth/callback#session_id=<sid>`.
// This component extracts the session_id, exchanges it via our backend for a
// first-party JWT (identical to the password-login token), stores it in
// localStorage, then navigates the user to `/dashboard`.

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api, { tokenStore } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const raw = window.location.hash || "";
    // Fragment format: "#session_id=abc..." — parse defensively.
    const params = new URLSearchParams(raw.startsWith("#") ? raw.slice(1) : raw);
    const sessionId = params.get("session_id");

    if (!sessionId) {
      toast.error("Missing session id — please try signing in again.");
      navigate("/login", { replace: true });
      return;
    }

    (async () => {
      try {
        const { data } = await api.post("/auth/google/session", { session_id: sessionId });
        // Same storage as password login flow.
        tokenStore.set(data.access_token);
        localStorage.setItem("encore.manager", JSON.stringify(data.manager));
        // Rehydrate the AuthProvider so ProtectedRoute recognises the session immediately.
        await refresh();
        window.history.replaceState({}, document.title, "/dashboard");
        navigate("/dashboard", { replace: true });
        toast.success(`Welcome, ${data.manager.full_name}`);
      } catch (err) {
        toast.error(err?.response?.data?.detail || "Google sign-in failed. Please try again.");
        navigate("/login", { replace: true });
      }
    })();
  }, [navigate, refresh]);

  return (
    <div className="min-h-screen flex items-center justify-center text-ink-soft text-sm" data-testid="auth-callback-loading">
      Signing you in with Google&hellip;
    </div>
  );
}
