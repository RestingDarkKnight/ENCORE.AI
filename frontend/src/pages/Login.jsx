import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Compass, ArrowRight } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Login() {
  const [email, setEmail] = useState("demo.manager@encore.ai");
  const [password, setPassword] = useState("Encore-Phase1-2026!");
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      const to = location.state?.from || "/dashboard";
      navigate(to, { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.detail || "Sign-in failed. Please check your credentials.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-canvas">
      {/* Left: form */}
      <div className="flex items-center justify-center p-8 md:p-16">
        <div className="w-full max-w-md animate-fade-in-up">
          <Link to="/" className="flex items-center gap-2.5 mb-12" data-testid="brand-link">
            <div className="h-9 w-9 rounded-md bg-brand flex items-center justify-center text-white">
              <Compass weight="duotone" size={20} />
            </div>
            <span className="font-display font-black text-xl tracking-tight">ENCORE</span>
          </Link>

          <p className="encore-overline mb-3">Hiring Manager Sign-in</p>
          <h1 className="text-4xl sm:text-5xl font-display font-black tracking-tighter leading-[1.05] mb-3">
            Welcome back.
          </h1>
          <p className="text-ink-soft mb-10 max-w-sm">
            Step into the studio where you craft work-simulation cases that reveal how candidates truly think.
          </p>

          <form onSubmit={onSubmit} className="space-y-5" data-testid="login-form">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink-soft mb-1.5">
                Work email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="login-email-input"
                className="w-full bg-transparent border border-black/15 rounded-lg px-4 py-3 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ink-soft mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="login-password-input"
                className="w-full bg-transparent border border-black/15 rounded-lg px-4 py-3 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              data-testid="login-submit-button"
              className="group w-full inline-flex items-center justify-between bg-brand hover:bg-brand-hover disabled:opacity-60 text-white rounded-lg px-5 py-3 transition-all hover:-translate-y-0.5 shadow-sm"
            >
              <span className="font-medium">{busy ? "Signing in…" : "Sign in"}</span>
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </button>
          </form>

          <p className="mt-8 text-sm text-ink-soft">
            No account yet?{" "}
            <Link to="/signup" className="text-brand hover:text-brand-hover underline-offset-4 hover:underline" data-testid="link-to-signup">
              Create one
            </Link>
          </p>
        </div>
      </div>

      {/* Right: brand panel */}
      <div className="hidden md:block relative overflow-hidden border-l border-black/[0.06]">
        <img
          src="https://images.unsplash.com/photo-1497366754035-f200968a6e72?crop=entropy&cs=srgb&fm=jpg&q=85"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-90"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-brand/80 via-brand/40 to-transparent" />
        <div className="relative h-full flex flex-col justify-end p-12 text-white">
          <p className="encore-overline text-white/70 mb-4">From the field</p>
          <blockquote className="font-display text-3xl font-bold leading-tight tracking-tight max-w-md">
            “We stopped guessing in interviews. ENCORE shows us how a person actually thinks.”
          </blockquote>
          <p className="mt-4 text-sm text-white/70">— Director of Engineering, Series B fintech</p>
        </div>
      </div>
    </div>
  );
}
