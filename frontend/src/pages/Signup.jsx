import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Compass, ArrowRight } from "@phosphor-icons/react";
import { toast } from "sonner";
import GoogleAuthButton from "@/components/GoogleAuthButton";

export default function Signup() {
  const [form, setForm] = useState({ full_name: "", email: "", company: "", password: "" });
  const [busy, setBusy] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await signup(form);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.detail || "Sign-up failed.";
      toast.error(typeof msg === "string" ? msg : "Sign-up failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-canvas">
      <div className="w-full max-w-md animate-fade-in-up">
        <Link to="/" className="flex items-center gap-2.5 mb-10">
          <div className="h-9 w-9 rounded-md bg-brand flex items-center justify-center text-white">
            <Compass weight="duotone" size={20} />
          </div>
          <span className="font-display font-black text-xl tracking-tight">ENCORE</span>
        </Link>

        <p className="encore-overline mb-3">Create your studio</p>
        <h1 className="text-4xl sm:text-5xl font-display font-black tracking-tighter leading-[1.05] mb-3">
          Start hiring on judgment, not trivia.
        </h1>
        <p className="text-ink-soft mb-10">It takes a minute. No credit card.</p>

        <div className="mb-6">
          <GoogleAuthButton label="Sign up with Google" />
        </div>

        <div className="flex items-center gap-3 mb-6 text-[11px] uppercase tracking-wider text-ink-soft">
          <span className="flex-1 h-px bg-black/10" />
          <span>or use your email</span>
          <span className="flex-1 h-px bg-black/10" />
        </div>

        <form onSubmit={onSubmit} className="space-y-5" data-testid="signup-form">
          {[
            { id: "full_name", label: "Full name", type: "text" },
            { id: "email", label: "Work email", type: "email" },
            { id: "company", label: "Company (optional)", type: "text" },
            { id: "password", label: "Password (min 8 characters)", type: "password" },
          ].map((f) => (
            <div key={f.id}>
              <label htmlFor={f.id} className="block text-sm font-medium text-ink-soft mb-1.5">
                {f.label}
              </label>
              <input
                id={f.id}
                type={f.type}
                value={form[f.id]}
                onChange={update(f.id)}
                required={f.id !== "company"}
                data-testid={`signup-${f.id.replace("_", "-")}-input`}
                className="w-full bg-transparent border border-black/15 rounded-lg px-4 py-3 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all"
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={busy}
            data-testid="signup-submit-button"
            className="group w-full inline-flex items-center justify-between bg-brand hover:bg-brand-hover disabled:opacity-60 text-white rounded-lg px-5 py-3 transition-all hover:-translate-y-0.5 shadow-sm"
          >
            <span className="font-medium">{busy ? "Creating…" : "Create account"}</span>
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </button>
        </form>

        <p className="mt-8 text-sm text-ink-soft">
          Already have an account?{" "}
          <Link to="/login" className="text-brand hover:text-brand-hover underline-offset-4 hover:underline" data-testid="link-to-login">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
