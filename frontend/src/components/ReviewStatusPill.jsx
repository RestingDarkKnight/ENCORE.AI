import { CheckCircle, Hourglass, XCircle } from "@phosphor-icons/react";

const CFG = {
  pending_review: { label: "Pending SME review", cls: "border-signal-warning/30 bg-signal-warning/5 text-signal-warning", icon: Hourglass },
  approved:       { label: "SME approved",        cls: "border-brand-moss/30 bg-brand-moss/5 text-brand-moss",         icon: CheckCircle },
  rejected:       { label: "SME rejected",        cls: "border-signal-error/30 bg-signal-error/5 text-signal-error",   icon: XCircle },
};

export default function ReviewStatusPill({ status, className = "" }) {
  if (!status) return null;
  const cfg = CFG[status];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <span
      data-testid={`review-status-${status}`}
      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 ${cfg.cls} ${className}`}
    >
      <Icon weight="fill" size={10} /> {cfg.label}
    </span>
  );
}
