import { motion } from "framer-motion";
import { Trophy, Lock, Sparkle } from "@phosphor-icons/react";

export default function BadgeStrip({ badges }) {
  if (!badges?.length) return null;
  const earned = badges.filter((b) => b.earned);
  const next = badges.find((b) => !b.earned && b.progress > 0) || badges.find((b) => !b.earned);

  return (
    <section className="encore-card p-6" data-testid="badge-strip">
      <div className="flex items-baseline justify-between mb-4">
        <p className="encore-overline flex items-center gap-1.5"><Trophy weight="duotone" size={12} className="text-brand-sand" /> Milestones</p>
        <span className="text-xs text-ink-soft">{earned.length} of {badges.length} earned</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-4" data-testid="badge-strip-earned">
        {earned.length === 0 ? (
          <p className="text-xs text-ink-soft italic">Your first milestones appear here as you set up your first role and case.</p>
        ) : (
          earned.map((b) => (
            <motion.span
              key={b.id}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              title={`${b.description}${b.earned_at ? ` · ${new Date(b.earned_at).toLocaleDateString()}` : ""}`}
              data-testid={`badge-${b.id}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-brand-moss/[0.06] text-brand-moss border border-brand-moss/20 rounded-full px-3 py-1.5"
            >
              <Sparkle weight="fill" size={10} className="text-brand-sand" />
              {b.label}
            </motion.span>
          ))
        )}
      </div>

      {next && (
        <div className="border-t border-black/[0.05] pt-4 flex items-center gap-3" data-testid="badge-next">
          <Lock size={14} className="text-ink-soft shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-ink truncate">Next: <span className="text-ink-soft">{next.label}</span></p>
            <p className="text-[11px] text-ink-soft truncate">{next.description}</p>
          </div>
          {next.progress > 0 && (
            <div className="w-24 h-1 bg-black/[0.06] rounded-full overflow-hidden shrink-0">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${next.progress * 100}%` }}
                transition={{ duration: 0.8 }}
                className="h-full bg-brand-moss"
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
