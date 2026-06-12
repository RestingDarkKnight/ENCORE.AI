// PipelineStrip.jsx — 4-stage orientation strip on the Dashboard.
// Stages: Define role → Generate case → Invite candidates → Review reports.
// A connector line draws left→right across the row on mount (sm+ screens).
// Active stage pulses. Computes the next best action from manager stats.
// Animations honour prefers-reduced-motion.

import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Briefcase,
  Sparkle,
  PaperPlaneTilt,
  ChartLineUp,
  CheckCircle,
  ArrowRight,
} from "@phosphor-icons/react";

const STAGES = [
  {
    id: "define",
    label: "Define role",
    icon: Briefcase,
    desc: "Tell ENCORE what the job actually looks like.",
    isDone: (s) => (s?.roles ?? 0) >= 1,
    cta: { label: "Create your first role", to: "/roles/new" },
  },
  {
    id: "generate",
    label: "Generate case",
    icon: Sparkle,
    desc: "Claude drafts a sectioned work-simulation with a rubric.",
    isDone: (s) => (s?.cases ?? 0) >= 1,
    cta: (s, firstRoleId) => ({
      label: firstRoleId ? "Open the role to generate" : "Open a role to generate",
      to: firstRoleId ? `/roles/${firstRoleId}` : "/roles",
    }),
  },
  {
    id: "invite",
    label: "Invite candidates",
    icon: PaperPlaneTilt,
    desc: "Approve a case, then share unique candidate links.",
    isDone: (s) => (s?.invited ?? 0) >= 1,
    cta: (s, firstRoleId) => ({
      label: "Approve a case & invite",
      to: firstRoleId ? `/roles/${firstRoleId}` : "/roles",
    }),
  },
  {
    id: "review",
    label: "Review reports",
    icon: ChartLineUp,
    desc: "Read scored reports and record hiring decisions.",
    isDone: (s) => (s?.evaluated ?? 0) >= 1,
    cta: (s, firstRoleId) => ({
      label: "Open a case to review",
      to: firstRoleId ? `/roles/${firstRoleId}` : "/roles",
    }),
  },
];

export default function PipelineStrip({ stats, firstRoleId }) {
  const reduceMotion = useReducedMotion();

  const nextIdx = STAGES.findIndex((st) => !st.isDone(stats));
  const allDone = nextIdx === -1;
  const activeStage = allDone ? null : STAGES[nextIdx];
  const cta =
    activeStage &&
    (typeof activeStage.cta === "function"
      ? activeStage.cta(stats, firstRoleId)
      : activeStage.cta);

  // Connector line — fills up to the latest completed (or active) stage
  const fillUpTo = allDone ? STAGES.length - 1 : Math.max(0, nextIdx);
  const fillPct = ((fillUpTo) / (STAGES.length - 1)) * 100;

  return (
    <section data-testid="pipeline-strip" className="encore-card p-7 sm:p-8">
      <div className="flex items-start justify-between gap-6 flex-wrap mb-7">
        <div className="min-w-0">
          <p className="encore-overline mb-1.5">Your pipeline</p>
          <h2 className="font-display text-display-3 font-bold">
            {allDone ? "Pipeline is humming." : "Next: " + activeStage.label.toLowerCase()}
          </h2>
          <p className="text-sm text-ink-soft mt-1.5 max-w-md leading-relaxed">
            {allDone
              ? "You\u2019ve shipped the full loop end-to-end. Keep iterating, calibrating, and inviting."
              : activeStage.desc}
          </p>
        </div>
        {!allDone && cta && (
          <Link to={cta.to} data-testid="pipeline-next-cta" className="btn-primary group whitespace-nowrap">
            <span>{cta.label}</span>
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
          </Link>
        )}
      </div>

      <div className="relative">
        {/* Connector track (visible from sm+ where stages are in a row) */}
        <div className="hidden sm:block absolute left-[5%] right-[5%] top-9 h-px bg-black/10" aria-hidden />
        <motion.div
          className="hidden sm:block absolute left-[5%] top-9 h-px bg-brand-moss origin-left"
          aria-hidden
          initial={reduceMotion ? false : { scaleX: 0 }}
          animate={{ scaleX: fillPct / 100 }}
          style={{ width: "90%" }}
          transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        />

        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 relative" data-testid="pipeline-stages">
          {STAGES.map((st, i) => {
            const done = st.isDone(stats);
            const active = i === nextIdx;
            const Icon = st.icon;
            return (
              <motion.li
                key={st.id}
                data-testid={`pipeline-stage-${st.id}`}
                data-stage-state={done ? "done" : active ? "active" : "pending"}
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className={`relative flex items-start gap-3 rounded-xl border p-4 bg-white/70 backdrop-blur-sm ${
                  done
                    ? "border-brand-moss/25"
                    : active
                    ? "border-brand/40 shadow-sm"
                    : "border-black/10"
                }`}
              >
                <div
                  className={`h-9 w-9 rounded-md flex items-center justify-center shrink-0 ${
                    done
                      ? "bg-brand-moss/15 text-brand-moss"
                      : active
                      ? "bg-brand/10 text-brand"
                      : "bg-black/[0.04] text-ink-soft"
                  }`}
                >
                  {done ? <CheckCircle weight="fill" size={18} /> : <Icon weight="duotone" size={18} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="encore-overline mb-0.5">Step {i + 1}</p>
                  <p
                    className={`text-sm font-semibold tracking-tight leading-snug ${
                      done ? "text-brand-moss" : active ? "text-ink" : "text-ink-soft"
                    }`}
                  >
                    {st.label}
                  </p>
                </div>
                {active && !reduceMotion && (
                  <motion.span
                    className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-brand"
                    animate={{ scale: [1, 1.35, 1], opacity: [1, 0.6, 1] }}
                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                  />
                )}
              </motion.li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
