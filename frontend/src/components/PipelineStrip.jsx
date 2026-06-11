// PipelineStrip.jsx — 4-stage orientation strip on the Dashboard.
// Stages: Define role → Generate case → Invite candidates → Review reports.
// Computes the next best action from manager stats and renders a single CTA.
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

  // Find the first incomplete stage = "next best action"
  const nextIdx = STAGES.findIndex((st) => !st.isDone(stats));
  const allDone = nextIdx === -1;
  const activeStage = allDone ? null : STAGES[nextIdx];
  const cta =
    activeStage &&
    (typeof activeStage.cta === "function"
      ? activeStage.cta(stats, firstRoleId)
      : activeStage.cta);

  return (
    <section data-testid="pipeline-strip" className="encore-card p-6 sm:p-7">
      <div className="flex items-start justify-between gap-6 flex-wrap mb-6">
        <div className="min-w-0">
          <p className="encore-overline mb-1.5">Your pipeline</p>
          <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight">
            {allDone ? "Pipeline is humming." : "Next: " + activeStage.label.toLowerCase()}
          </h2>
          <p className="text-sm text-ink-soft mt-1.5 max-w-md">
            {allDone
              ? "You\u2019ve shipped the full loop end-to-end. Keep iterating, calibrating, and inviting."
              : activeStage.desc}
          </p>
        </div>
        {!allDone && cta && (
          <Link
            to={cta.to}
            data-testid="pipeline-next-cta"
            className="group inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white rounded-lg px-4 py-2.5 transition-all hover:-translate-y-0.5 shadow-sm whitespace-nowrap"
          >
            <span className="font-medium text-sm">{cta.label}</span>
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
          </Link>
        )}
      </div>

      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" data-testid="pipeline-stages">
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
              transition={{ duration: 0.35, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
              className={`relative flex items-start gap-3 rounded-lg border p-4 ${
                done
                  ? "border-brand-moss/25 bg-brand-moss/[0.04]"
                  : active
                  ? "border-brand/40 bg-brand/[0.04]"
                  : "border-black/10 bg-canvas/40"
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
    </section>
  );
}
