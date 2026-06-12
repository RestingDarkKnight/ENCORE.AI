import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Copy, PaperPlaneTilt, Check, Envelope, ClockClockwise, CheckCircle, Hourglass, ChartBar } from "@phosphor-icons/react";

const STATUS_PILL = {
  sent: { label: "Invited", cls: "bg-canvas border-black/10 text-ink-soft", icon: PaperPlaneTilt },
  in_progress: { label: "In progress", cls: "bg-signal-warning/5 border-signal-warning/20 text-signal-warning", icon: Hourglass },
  submitted: { label: "Submitted", cls: "bg-brand-moss/5 border-brand-moss/20 text-brand-moss", icon: CheckCircle },
};

export default function InvitePanel({ caseId, caseStatus }) {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [timeLimit, setTimeLimit] = useState(180);
  const [copiedTok, setCopiedTok] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get(`/assignments/case/${caseId}`);
      setAssignments(data);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { refresh(); }, [refresh]);

  const invite = async (e) => {
    e.preventDefault();
    if (caseStatus !== "approved") {
      toast.error("Approve the case before inviting candidates.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/assignments", {
        case_id: caseId,
        candidate_email: email.trim(),
        candidate_name: name.trim() || null,
        time_limit_minutes: Number(timeLimit) || 180,
      });
      setEmail("");
      setName("");
      toast.success("Invitation created. Share the link below.");
      await refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not create invitation.");
    } finally {
      setBusy(false);
    }
  };

  const linkFor = (token) => `${window.location.origin}/take/${token}`;

  const copy = async (token) => {
    await navigator.clipboard.writeText(linkFor(token));
    setCopiedTok(token);
    toast.success("Link copied");
    setTimeout(() => setCopiedTok((t) => (t === token ? null : t)), 1800);
  };

  const disabled = caseStatus !== "approved";

  return (
    <section data-testid="invite-panel" className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl font-bold tracking-tight">Candidates</h2>
        <p className="text-xs text-ink-soft">{disabled ? "Approve the case to start inviting" : "Each invite generates a unique link"}</p>
      </div>

      <form onSubmit={invite} className={`encore-card p-6 ${disabled ? "opacity-60" : ""}`} data-testid="invite-form">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Candidate name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={disabled}
              placeholder="optional"
              data-testid="invite-name-input"
              className="w-full bg-transparent border border-black/15 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              disabled={disabled}
              placeholder="candidate@example.com"
              data-testid="invite-email-input"
              className="w-full bg-transparent border border-black/15 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Time limit (min)</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={timeLimit}
                onChange={(e) => setTimeLimit(e.target.value)}
                disabled={disabled}
                min={15}
                max={480}
                data-testid="invite-time-input"
                className="w-24 bg-transparent border border-black/15 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none"
              />
              <button
                type="submit"
                disabled={disabled || busy}
                data-testid="invite-submit-button"
                className="flex-1 inline-flex items-center justify-center gap-2 bg-brand hover:bg-brand-hover disabled:opacity-50 text-white rounded-lg px-4 py-2.5 transition-all hover:-translate-y-0.5"
              >
                <Envelope size={14} weight="bold" />
                <span className="font-medium text-sm">{busy ? "Inviting…" : "Invite"}</span>
              </button>
            </div>
          </div>
        </div>
      </form>

      {loading ? (
        <div className="encore-card p-6 text-center text-ink-soft text-sm">Loading invitations…</div>
      ) : assignments.length === 0 ? (
        <div className="encore-card p-8 text-center text-ink-soft text-sm" data-testid="assignments-empty">
          <ClockClockwise weight="duotone" size={22} className="mx-auto text-brand mb-2" />
          No candidates invited yet.
        </div>
      ) : (
        <div className="space-y-2">
          {assignments.map((a) => {
            const cfg = STATUS_PILL[a.status] || STATUS_PILL.sent;
            const Icon = cfg.icon;
            return (
              <div key={a.id} className="encore-card p-4 flex items-center gap-4 flex-wrap" data-testid={`assignment-${a.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-display font-bold text-ink">{a.candidate_name || a.candidate_email}</span>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 ${cfg.cls}`}>
                      <Icon weight="fill" size={10} /> {cfg.label}
                    </span>
                  </div>
                  <p className="text-xs text-ink-soft truncate">{a.candidate_email} · {a.time_limit_minutes}-min limit</p>
                </div>

                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  {a.status === "submitted" && (
                    <Link
                      to={`/reports/${a.id}`}
                      data-testid={`assignment-view-report-${a.id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium bg-brand text-white hover:bg-brand-hover rounded-lg px-3 py-1.5"
                    >
                      <ChartBar size={12} weight="bold" />
                      View report
                    </Link>
                  )}
                  <code className="text-[11px] font-mono bg-canvas border border-black/[0.06] rounded px-2 py-1 truncate max-w-[260px]" title={linkFor(a.token)}>
                    /take/{a.token.slice(0, 12)}…
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(a.token)}
                    data-testid={`assignment-copy-${a.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium border border-black/15 hover:border-black/30 hover:bg-black/[0.02] rounded-lg px-2.5 py-1.5"
                  >
                    {copiedTok === a.token ? <Check size={12} weight="bold" className="text-brand-moss" /> : <Copy size={12} />}
                    {copiedTok === a.token ? "Copied" : "Copy link"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
