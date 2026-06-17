// GuidedCase.jsx — six-agent case builder at /roles/:roleId/cases/new-guided.
//
// Persistent state lives server-side (POST /workflows). Each step is one
// Claude call; the user reviews and clicks Continue / Revise / Give input.
// Implements: progress strip, show-reasoning panel, call-budget indicator,
// honest agent labels, feedback routing on every action.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, ArrowsClockwise, Brain, Atom, Shapes, NotePencil,
  ShieldCheck, Sparkle, CheckCircle, CaretDown, CaretUp, CircleNotch, Lightning,
  Warning,
} from "@phosphor-icons/react";
import api from "@/lib/api";

const STEPS = [
  { n: 1, key: "analyst",           label: "Analyst",            verb: "reading the role",                 icon: Brain },
  { n: 2, key: "theory_researcher", label: "Theory Researcher",  verb: "grounding in domain knowledge",    icon: Atom },
  { n: 3, key: "architect",         label: "Architect",          verb: "proposing case shapes",            icon: Shapes },
  { n: 4, key: "generator",         label: "Generator",          verb: "writing the case + rubric",        icon: NotePencil },
  { n: 5, key: "critic",            label: "Critic",             verb: "evaluating against the standard",  icon: ShieldCheck },
  { n: 6, key: "polisher",          label: "Polisher",           verb: "applying revisions",               icon: Sparkle },
];

const MODE_LABEL = { screening: "Screening", takehome: "Take-home", interview: "Interview" };

export default function GuidedCase() {
  const { roleId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [role, setRole] = useState(null);
  const [wf, setWf] = useState(null);
  const [busy, setBusy] = useState(false);
  const [activeStep, setActiveStep] = useState(1);

  // Read assessment mode + require_reasoning from URL (set by RoleDetail's mode selector).
  const startMode = (searchParams.get("mode") || "interview").toLowerCase();
  const startReasoning = searchParams.get("reasoning") === "1";

  // Load role + start (or resume) workflow
  useEffect(() => {
    (async () => {
      const r = await api.get(`/roles/${roleId}`);
      setRole(r.data);
      // Resume newest in-progress workflow for this role; else start fresh
      const list = await api.get(`/workflows/by-role/${roleId}`).catch(() => ({ data: [] }));
      const open = (list.data || []).find((w) => w.status === "in_progress");
      if (open) {
        setWf(open);
        setActiveStep(open.current_step || 1);
      } else {
        const validMode = ["screening", "takehome", "interview"].includes(startMode) ? startMode : "interview";
        const fresh = await api.post(`/workflows`, {
          role_id: roleId,
          assessment_mode: validMode,
          require_reasoning: startReasoning,
        });
        setWf(fresh.data);
        setActiveStep(1);
      }
    })().catch((e) => toast.error(e?.response?.data?.detail || "Failed to start workflow."));
  }, [roleId, startMode, startReasoning]);

  const runStep = useCallback(async (step, body = {}) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/workflows/${wf.id}/run/${step}`, body);
      setWf(data);
      setActiveStep(Math.min(6, step));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Step failed.");
    } finally {
      setBusy(false);
    }
  }, [wf?.id]);

  const sendFeedback = useCallback(async ({ agent, type, step, specifics = {} }) => {
    try {
      await api.post(`/workflows/${wf.id}/feedback`, {
        agent_name: agent, feedback_type: type, workflow_step: step, specifics,
      });
    } catch { /* fail-soft */ }
  }, [wf?.id]);

  const finalize = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/workflows/${wf.id}/finalize`);
      toast.success("Case saved.");
      navigate(`/cases/${data.case_id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not finalize.");
    } finally {
      setBusy(false);
    }
  }, [wf?.id, navigate]);

  if (!wf || !role) return <div className="text-center text-ink-soft py-16">Loading guided workflow&hellip;</div>;

  const stepOutputs = wf.step_outputs || {};
  const stepReasonings = wf.step_reasonings || {};
  const memoryUsed = wf.memory_used || {};

  return (
    <div className="max-w-5xl mx-auto space-y-section" data-testid="guided-case-page">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <Link to={`/roles/${roleId}`} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink" data-testid="guided-back">
          <ArrowLeft size={14} /> Back to role
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          {wf.assessment_mode && (
            <span
              data-testid="guided-mode-badge"
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border border-brand/30 bg-brand/[0.05] text-brand rounded-full px-2 py-0.5"
              title={`Assessment mode: ${MODE_LABEL[wf.assessment_mode] || wf.assessment_mode}`}
            >
              Mode: {MODE_LABEL[wf.assessment_mode] || wf.assessment_mode}
            </span>
          )}
          {wf.require_reasoning && (
            <span
              data-testid="guided-reasoning-badge"
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border border-brand-sand/30 bg-brand-sand/[0.08] text-brand-sand rounded-full px-2 py-0.5"
              title="Reasoning required on objective questions"
            >
              + Reasoning
            </span>
          )}
          <div className="text-xs text-ink-soft tabular-nums" data-testid="guided-call-budget">
            Calls used: <strong className="text-ink">{wf.call_count || 0}</strong> / 8
          </div>
        </div>
      </header>

      <div>
        <p className="encore-overline mb-2">Guided case builder</p>
        <h1 className="text-display-2 font-display font-black">{role.job_title}</h1>
        <p className="text-ink-soft text-sm mt-1">Six agents, one at a time. You approve each step before the next runs.</p>
      </div>

      {/* Progress strip */}
      <ProgressStrip activeStep={activeStep} stepOutputs={stepOutputs} onJump={(n) => setActiveStep(n)} />

      {/* Active step */}
      <ActiveStep
        step={activeStep}
        busy={busy}
        wf={wf}
        role={role}
        output={stepOutputs[String(activeStep)]}
        reasoning={stepReasonings[String(activeStep)]}
        memoryUsedCount={(memoryUsed[String(activeStep)] || []).length}
        runStep={runStep}
        sendFeedback={sendFeedback}
        finalize={finalize}
      />
    </div>
  );
}

/* ============== Progress strip ============== */
function ProgressStrip({ activeStep, stepOutputs, onJump }) {
  const reduce = useReducedMotion();
  return (
    <ol data-testid="guided-progress" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
      {STEPS.map((s) => {
        const done = !!stepOutputs[String(s.n)];
        const active = s.n === activeStep;
        const Icon = s.icon;
        return (
          <li key={s.n}>
            <button
              type="button"
              onClick={() => onJump(s.n)}
              data-testid={`guided-step-${s.key}`}
              data-state={done ? "done" : active ? "active" : "pending"}
              className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                done ? "border-brand-moss/30 bg-brand-moss/[0.05]" : active ? "border-brand/40 bg-brand/[0.04] shadow-sm" : "border-black/10 bg-white"
              }`}
            >
              <span className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${done ? "bg-brand-moss/15 text-brand-moss" : active ? "bg-brand/10 text-brand" : "bg-black/[0.04] text-ink-soft"}`}>
                {done ? <CheckCircle weight="fill" size={15} /> : <Icon weight="duotone" size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="encore-overline mb-0.5">Step {s.n}</p>
                <p className={`text-[12px] font-semibold leading-tight truncate ${done ? "text-brand-moss" : active ? "text-ink" : "text-ink-soft"}`}>{s.label}</p>
              </div>
              {active && !reduce && (
                <motion.span className="h-1.5 w-1.5 rounded-full bg-brand shrink-0" animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1.8 }} />
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ============== Active step renderer ============== */
function ActiveStep({ step, busy, wf, role, output, reasoning, memoryUsedCount, runStep, sendFeedback, finalize }) {
  const meta = STEPS.find((s) => s.n === step);

  // If no output yet for this step, show the "Run X" call-to-action
  if (!output && !busy) {
    return (
      <section className="encore-card p-7" data-testid="guided-active-empty">
        <p className="encore-overline mb-1">Step {step}</p>
        <h2 className="font-display text-display-3 font-bold">{meta.label}</h2>
        <p className="text-ink-soft mt-2">The <strong className="text-ink">{meta.label}</strong> is ready &mdash; about to be {meta.verb}.</p>
        <button onClick={() => runStep(step)} disabled={busy} data-testid={`guided-run-${meta.key}`} className="btn-primary mt-5">
          <Sparkle size={14} weight="bold" /> Run the {meta.label}
        </button>
      </section>
    );
  }

  if (busy && !output) {
    return (
      <section className="encore-card p-7" data-testid="guided-active-busy">
        <div className="flex items-center gap-3 text-ink-soft">
          <CircleNotch size={18} className="animate-spin text-brand" />
          <p>The <strong className="text-ink">{meta.label}</strong> is {meta.verb}&hellip;</p>
        </div>
      </section>
    );
  }

  return (
    <section className="encore-card p-7 space-y-5" data-testid={`guided-active-${meta.key}`}>
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="encore-overline mb-1">Step {step} &middot; {meta.label}</p>
          <h2 className="font-display text-display-3 font-bold">{titleForStep(step, output)}</h2>
        </div>
        <ReasoningPanel reasoning={reasoning} memoryUsedCount={memoryUsedCount} />
      </header>

      {step === 1 && <AnalystOutput output={output} runStep={runStep} sendFeedback={sendFeedback} busy={busy} />}
      {step === 2 && <TheoryOutput output={output} runStep={runStep} sendFeedback={sendFeedback} busy={busy} />}
      {step === 3 && <ArchitectOutput output={output} runStep={runStep} sendFeedback={sendFeedback} busy={busy} />}
      {step === 4 && <GeneratorOutput output={output} runStep={runStep} sendFeedback={sendFeedback} busy={busy} />}
      {step === 5 && <CriticOutput output={output} runStep={runStep} sendFeedback={sendFeedback} busy={busy} />}
      {step === 6 && <PolisherOutput output={output} finalize={finalize} sendFeedback={sendFeedback} busy={busy} />}
    </section>
  );
}

function titleForStep(step, output) {
  if (step === 4 || step === 6) return output?.title || (step === 4 ? "Draft case" : "Final case");
  if (step === 1) return "Role interpretation";
  if (step === 2) return "Domain grounding";
  if (step === 3) return "Case shapes";
  if (step === 5) return "Critique";
  return "Output";
}

/* ============== Reasoning + memory panel ============== */
function ReasoningPanel({ reasoning, memoryUsedCount }) {
  const [open, setOpen] = useState(false);
  if (!reasoning && !memoryUsedCount) return null;
  return (
    <div className="text-right" data-testid="guided-reasoning-wrap">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="guided-reasoning-toggle"
        className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-soft hover:text-ink"
      >
        Show reasoning {open ? <CaretUp size={11} /> : <CaretDown size={11} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-2 text-xs text-ink leading-relaxed bg-canvas/60 border border-black/10 rounded-md p-3 max-w-md text-left"
            data-testid="guided-reasoning-body"
          >
            {reasoning && <p>{reasoning}</p>}
            {!!memoryUsedCount && (
              <p className="encore-overline-sand mt-2">Memory used: {memoryUsedCount} prior interactions informed this step.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============== Step-specific output renderers ============== */
function AnalystOutput({ output, runStep, sendFeedback, busy }) {
  const [answers, setAnswers] = useState({});
  const onContinue = async () => {
    const used = Object.entries(answers).filter(([, v]) => v && v.trim());
    if (used.length > 0) {
      sendFeedback({ agent: "analyst", type: "user_input", step: 1, specifics: { answers } });
    } else {
      sendFeedback({ agent: "analyst", type: "accepted", step: 1, specifics: {} });
      // also mark skipped questions
      (output.clarifying_questions || []).forEach((q) => sendFeedback({ agent: "analyst", type: "dismissed", step: 1, specifics: { question: q } }));
    }
    runStep(2, { answers_to_clarifying: Object.fromEntries(used) });
  };
  return (
    <div className="space-y-4">
      <Section label="Seniority read">
        <p className="text-sm text-ink">
          <strong>{output.seniority_read?.seniority || "—"}</strong>
          {output.seniority_read?.reasoning && <span className="text-ink-soft"> &middot; {output.seniority_read.reasoning}</span>}
        </p>
      </Section>
      <Section label="Core competencies">
        <ul className="space-y-1.5 text-sm">
          {(output.core_competencies || []).map((c, i) => (
            <li key={i}><strong>{c.name}</strong> <span className="text-ink-soft">— {c.rationale}</span></li>
          ))}
        </ul>
      </Section>
      {output.hidden_competencies?.length > 0 && (
        <Section label="Hidden competencies">
          <ul className="space-y-1.5 text-sm">
            {output.hidden_competencies.map((c, i) => <li key={i}><strong>{c.name}</strong> <span className="text-ink-soft">— {c.rationale}</span></li>)}
          </ul>
        </Section>
      )}
      <Section label="Daily reality"><p className="text-sm text-ink">{output.daily_reality}</p></Section>
      <Section label="What separates great from mediocre"><p className="text-sm text-ink">{output.differentiators}</p></Section>
      {output.clarifying_questions?.length > 0 && (
        <Section label="Clarifying questions (optional)">
          <div className="space-y-2">
            {output.clarifying_questions.map((q, i) => (
              <div key={i}>
                <label className="block text-sm text-ink mb-1">{q}</label>
                <input
                  type="text"
                  value={answers[q] || ""}
                  onChange={(e) => setAnswers({ ...answers, [q]: e.target.value })}
                  data-testid={`analyst-answer-${i}`}
                  className="w-full bg-transparent border border-black/15 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand/20 outline-none"
                />
              </div>
            ))}
          </div>
        </Section>
      )}
      <StepFooter
        busy={busy}
        primary={{ label: "Continue → Theory Researcher", onClick: onContinue, testid: "analyst-continue" }}
        revise={{ onClick: async () => {
          sendFeedback({ agent: "analyst", type: "revised", step: 1, specifics: { reason: "user requested re-run" } });
          await runStep(1, {});
        }, testid: "analyst-revise" }}
      />
    </div>
  );
}

function TheoryOutput({ output, runStep, sendFeedback, busy }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-brand-sand/30 bg-brand-sand/[0.05] p-3 text-xs text-ink" data-testid="theory-grounding-source">
        <Lightning size={11} weight="fill" className="text-brand-sand inline-block mr-1" />
        <strong>Grounding:</strong> {output.grounding_source}
      </div>
      <Section label="Theory the case must respect"><p className="text-sm text-ink whitespace-pre-wrap">{output.theory_summary}</p></Section>
      <Section label="Realistic constraints"><BulletList items={output.realistic_constraints} /></Section>
      <Section label="Common failure modes"><BulletList items={output.common_failure_modes} /></Section>
      {output.domain_warnings?.length > 0 && (
        <Section label="Warnings (the case must NOT do)"><BulletList items={output.domain_warnings} /></Section>
      )}
      <StepFooter
        busy={busy}
        primary={{ label: "Continue → Architect", onClick: async () => {
          sendFeedback({ agent: "theory_researcher", type: "accepted", step: 2, specifics: { used_corpus: !output.grounding_source?.includes("No proprietary corpus") } });
          await runStep(3, {});
        }, testid: "theory-continue" }}
        revise={{ onClick: async () => {
          sendFeedback({ agent: "theory_researcher", type: "revised", step: 2, specifics: {} });
          await runStep(2, {});
        }, testid: "theory-revise" }}
      />
    </div>
  );
}

function ArchitectOutput({ output, runStep, sendFeedback, busy }) {
  const [pickedId, setPickedId] = useState(null);
  const choose = async (shape) => {
    setPickedId(shape.id);
    sendFeedback({ agent: "architect", type: "accepted", step: 3, specifics: { shape_id: shape.id, shape_title: shape.title, tests_for: shape.tests_for } });
    // Implicit rejection for the others
    (output.shapes || []).forEach((s) => {
      if (s.id !== shape.id) sendFeedback({ agent: "architect", type: "dismissed", step: 3, specifics: { shape_id: s.id, shape_title: s.title } });
    });
    await runStep(4, { chosen_shape_id: shape.id });
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">Pick the shape you want — or click Variant for a fresh set.</p>
      <div className="grid md:grid-cols-3 gap-3">
        {(output.shapes || []).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => choose(s)}
            disabled={busy}
            data-testid={`architect-pick-${s.id}`}
            className={`encore-card p-5 text-left hover:-translate-y-0.5 transition-all ${pickedId === s.id ? "ring-2 ring-brand" : ""}`}
          >
            <p className="encore-overline mb-1.5">{s.id}</p>
            <h3 className="font-display font-bold tracking-tight mb-1">{s.title}</h3>
            <p className="text-sm text-ink-soft mb-3">{s.summary}</p>
            <div className="flex flex-wrap gap-1">
              {(s.tests_for || []).map((t, i) => (
                <span key={i} className="text-[10px] bg-brand/5 text-brand border border-brand/15 rounded-full px-2 py-0.5">{t}</span>
              ))}
            </div>
          </button>
        ))}
      </div>
      <StepFooter
        busy={busy}
        revise={{ onClick: async () => {
          sendFeedback({ agent: "architect", type: "revised", step: 3, specifics: { reason: "variant requested" } });
          await runStep(3, {});
        }, testid: "architect-variants" }}
      />
    </div>
  );
}

function GeneratorOutput({ output, runStep, sendFeedback, busy }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink leading-relaxed border-l-2 border-brand-sand/40 pl-3">{output.scenario_text}</p>
      <div className="space-y-3">
        {(output.sections || []).map((s, i) => (
          <div key={s.id} className="border border-black/[0.06] rounded-lg p-4">
            <p className="encore-overline mb-1">Section {i + 1}</p>
            <h3 className="font-display text-base font-bold tracking-tight mb-1">{s.title}</h3>
            <p className="text-sm text-ink mb-2">{s.intro}</p>
            <ol className="list-decimal list-inside text-sm text-ink space-y-1">
              {(s.questions || []).map((q, j) => <li key={j}>{q}</li>)}
            </ol>
          </div>
        ))}
      </div>
      <div className="border border-black/[0.06] rounded-lg p-4">
        <p className="encore-overline mb-2">Rubric ({output.rubric?.length || 0} dimensions &middot; weights sum to 100)</p>
        <ul className="space-y-2">
          {(output.rubric || []).map((r) => (
            <li key={r.id} className="text-sm">
              <strong>{r.name}</strong> <span className="text-ink-soft text-xs">— {r.weight}%</span>
              <p className="text-xs text-ink-soft mt-0.5">{r.description}</p>
            </li>
          ))}
        </ul>
      </div>
      <StepFooter
        busy={busy}
        primary={{ label: "Continue → Critic", onClick: async () => {
          sendFeedback({ agent: "generator", type: "accepted", step: 4, specifics: {} });
          await runStep(5, {});
        }, testid: "generator-continue" }}
        revise={{ onClick: async () => {
          sendFeedback({ agent: "generator", type: "rejected", step: 4, specifics: { reason: "regenerate" } });
          await runStep(4, {});
        }, testid: "generator-regenerate", label: "Regenerate" }}
      />
    </div>
  );
}

function CriticOutput({ output, runStep, sendFeedback, busy }) {
  const [selected, setSelected] = useState({});
  const toggle = (id) => setSelected((p) => ({ ...p, [id]: !p[id] }));
  const apply = async () => {
    const chosen = Object.keys(selected).filter((k) => selected[k]);
    (output.recommended_revisions || []).forEach((r) => {
      sendFeedback({
        agent: "critic",
        type: chosen.includes(r.id) ? "accepted" : "dismissed",
        step: 5,
        specifics: { id: r.id, title: r.title, detail: r.detail },
      });
    });
    await runStep(6, { selected_revision_ids: chosen });
  };
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2" data-testid="critic-scores">
        {Object.entries(output.scores_against_standard || {}).map(([k, v]) => (
          <div key={k} className="border border-black/[0.06] rounded-md p-3">
            <p className="text-[10px] uppercase tracking-wider text-ink-soft mb-1">{k.replace(/_/g, " ")}</p>
            <p className="font-display text-2xl font-black tabular-nums">{(v || 0).toFixed(1)}<span className="text-ink-soft text-xs ml-1">/ 5</span></p>
          </div>
        ))}
      </div>
      {(output.hard_gate_check?.fabricated_specs_flag || output.hard_gate_check?.single_answer_trap) && (
        <div className="rounded-lg border border-signal-error/30 bg-signal-error/5 p-3 text-xs text-signal-error">
          <Warning size={11} weight="fill" className="inline-block mr-1" />
          Hard gate triggered. Address before approval.
        </div>
      )}
      {output.strengths?.length > 0 && <Section label="Strengths"><BulletList items={output.strengths} /></Section>}
      {output.weaknesses?.length > 0 && <Section label="Weaknesses"><BulletList items={output.weaknesses} /></Section>}
      <Section label="Recommended revisions (pick which to apply)">
        <div className="space-y-2">
          {(output.recommended_revisions || []).map((r) => (
            <label key={r.id} className="flex items-start gap-2 cursor-pointer border border-black/[0.06] rounded-md p-3 hover:bg-black/[0.02]" data-testid={`critic-rev-${r.id}`}>
              <input
                type="checkbox"
                checked={!!selected[r.id]}
                onChange={() => toggle(r.id)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-black/20 text-brand focus:ring-brand/20"
              />
              <div className="flex-1">
                <p className="text-sm font-medium">{r.title}</p>
                <p className="text-xs text-ink-soft">{r.detail}</p>
              </div>
            </label>
          ))}
        </div>
      </Section>
      <StepFooter
        busy={busy}
        primary={{ label: "Apply & Continue → Polisher", onClick: apply, testid: "critic-apply" }}
      />
    </div>
  );
}

function PolisherOutput({ output, finalize, sendFeedback, busy }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink leading-relaxed border-l-2 border-brand-moss/40 pl-3">{output.scenario_text}</p>
      {(output.applied_revision_ids?.length || 0) > 0 && (
        <p className="encore-overline-sand">Applied {output.applied_revision_ids.length} revisions: {output.applied_revision_ids.join(", ")}</p>
      )}
      <div className="space-y-3">
        {(output.sections || []).map((s, i) => (
          <div key={s.id} className="border border-black/[0.06] rounded-lg p-4">
            <p className="encore-overline mb-1">Section {i + 1}</p>
            <h3 className="font-display text-base font-bold tracking-tight mb-1">{s.title}</h3>
            <p className="text-sm text-ink mb-2">{s.intro}</p>
            <ol className="list-decimal list-inside text-sm text-ink space-y-1">
              {(s.questions || []).map((q, j) => <li key={j}>{q}</li>)}
            </ol>
          </div>
        ))}
      </div>
      <StepFooter
        busy={busy}
        primary={{
          label: "Approve & save case",
          onClick: async () => {
            sendFeedback({ agent: "polisher", type: "accepted", step: 6, specifics: {} });
            await finalize();
          },
          testid: "polisher-approve",
        }}
      />
    </div>
  );
}

/* ============== Tiny shared bits ============== */
function Section({ label, children }) {
  return (
    <div>
      <p className="encore-overline mb-2">{label}</p>
      {children}
    </div>
  );
}
function BulletList({ items }) {
  if (!items?.length) return <p className="text-xs text-ink-soft">—</p>;
  return <ul className="list-disc list-inside text-sm text-ink space-y-1">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>;
}
function StepFooter({ busy, primary, revise, finalize: _finalize }) {
  return (
    <div className="flex items-center justify-end gap-2 pt-3 border-t border-black/[0.05]">
      {revise && (
        <button type="button" onClick={revise.onClick} disabled={busy} data-testid={revise.testid} className="btn-quiet text-sm">
          <ArrowsClockwise size={13} /> {revise.label || "Revise"}
        </button>
      )}
      {primary && (
        <button type="button" onClick={primary.onClick} disabled={busy} data-testid={primary.testid} className="btn-primary text-sm">
          {primary.label} <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}
