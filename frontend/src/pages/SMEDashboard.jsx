import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Compass, ArrowRight, SignOut, Hourglass, CheckCircle, XCircle, ClipboardText } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";

export default function SMEDashboard() {
  const { manager, logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState({ pending: [], recent: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/sme/queue").then((r) => setData(r.data)).finally(() => setLoading(false));
  }, []);

  const handleLogout = () => { logout(); navigate("/login"); };

  return (
    <div className="min-h-screen bg-canvas text-ink" data-testid="sme-dashboard">
      <header className="encore-glass-header">
        <div className="mx-auto max-w-6xl px-6 lg:px-10 h-16 flex items-center justify-between">
          <Link to="/sme" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-brand flex items-center justify-center text-white">
              <Compass weight="duotone" size={18} />
            </div>
            <span className="font-display font-black text-lg tracking-tight">ENCORE</span>
            <span className="hidden md:inline encore-overline ml-3">SME Review</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs text-ink-soft">{manager?.full_name} · Reviewer</span>
            <button onClick={handleLogout} data-testid="sme-logout" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink px-2 py-1 rounded-md hover:bg-black/[0.04]">
              <SignOut size={14} /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 lg:px-10 py-10 space-y-10">
        <header>
          <p className="encore-overline mb-2">Review queue</p>
          <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tighter leading-[1.05]">Cases awaiting your judgment.</h1>
          <p className="text-ink-soft mt-3 max-w-xl">Score each case against the seven-dimension quality rubric. Approved cases join the validated library; rejections become guard-rails for future generations.</p>
        </header>

        {loading ? (
          <div className="encore-card p-10 text-center text-ink-soft">Loading queue…</div>
        ) : (
          <>
            <section>
              <h2 className="font-display text-2xl font-bold tracking-tight mb-4">Pending ({data.pending.length})</h2>
              {data.pending.length === 0 ? (
                <div className="encore-card p-10 text-center" data-testid="sme-pending-empty">
                  <ClipboardText weight="duotone" size={26} className="mx-auto text-brand mb-2" />
                  <p className="text-ink-soft text-sm">Nothing pending right now. New cases will appear here as managers generate them.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.pending.map((c) => (
                    <Link
                      key={c.id}
                      to={`/sme/cases/${c.id}`}
                      data-testid={`sme-queue-item-${c.id}`}
                      className="encore-card p-5 flex items-start justify-between gap-4 hover:-translate-y-0.5 transition-all hover:shadow-md group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border border-signal-warning/30 bg-signal-warning/5 text-signal-warning rounded-full px-2 py-0.5">
                            <Hourglass weight="fill" size={10} /> Pending
                          </span>
                          {c.domain_key && <span className="text-[10px] font-mono text-ink-soft truncate">{c.domain_key}</span>}
                        </div>
                        <h3 className="font-display text-lg font-bold tracking-tight group-hover:text-brand transition-colors">{c.title}</h3>
                        <p className="text-sm text-ink-soft line-clamp-2 mt-1">{c.scenario_text}</p>
                      </div>
                      <ArrowRight size={16} className="text-ink-soft mt-1 transition-transform group-hover:translate-x-1 shrink-0" />
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {data.recent.length > 0 && (
              <section>
                <h2 className="font-display text-2xl font-bold tracking-tight mb-4">Recently reviewed</h2>
                <div className="space-y-2">
                  {data.recent.map((c) => (
                    <div key={c.id} className="encore-card p-4 flex items-center gap-3" data-testid={`sme-recent-${c.id}`}>
                      {c.review_status === "approved" ? (
                        <CheckCircle weight="fill" size={16} className="text-brand-moss" />
                      ) : (
                        <XCircle weight="fill" size={16} className="text-signal-error" />
                      )}
                      <span className="font-medium text-sm flex-1 truncate">{c.title}</span>
                      <span className="text-[10px] font-mono text-ink-soft">{c.domain_key}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
