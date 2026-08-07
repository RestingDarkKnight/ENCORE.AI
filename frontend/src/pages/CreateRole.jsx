import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, X, CheckCircle, Lightning, Sparkle, ArrowsClockwise } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import useSuggest from "@/lib/useSuggest";

const SENIORITY = [
  { id: "junior", label: "Junior", hint: "0–2 yrs" },
  { id: "mid", label: "Mid", hint: "3–6 yrs" },
  { id: "senior", label: "Senior", hint: "7–12 yrs" },
  { id: "lead", label: "Lead", hint: "12+ yrs / IC or EM" },
];

const DIFFICULTY = [
  { id: "foundational", label: "Foundational", desc: "Core fluency. Identify the obvious and explain why." },
  { id: "applied", label: "Applied", desc: "Solve realistic problems with real constraints." },
  { id: "advanced", label: "Advanced", desc: "Navigate ambiguity, trade-offs, and competing pressures." },
  { id: "expert", label: "Expert", desc: "Reframe the problem; make strategic, cross-team calls." },
];

const LANGUAGE_REGISTERS = [
  {
    id: "plain",
    label: "Plain & direct",
    sample:
      "A part is failing inspection. It started during the monsoon. Some weeks are fine, some weeks one in three parts is rejected. You are the new engineer. Your job is to find out why and fix it. You have three hours and you can talk to anyone on the floor.",
  },
  {
    id: "standard",
    label: "Standard professional (default)",
    sample:
      "A precision-cast component has begun failing X-ray inspection for subsurface porosity, with rejection rates that fluctuate week to week since the start of the monsoon. As the newly appointed process engineer, you have been asked to investigate the cause and recommend a fix within three hours, with full access to the shop floor and records.",
  },
  {
    id: "advanced",
    label: "Advanced",
    sample:
      "A flight-critical casting has developed an intermittent subsurface porosity defect whose incidence — fluctuating sharply with no immediately discernible pattern since monsoon onset — has begun to threaten both yield and delivery commitments. You have inherited the investigation, and must, within three hours, disentangle the contributing factors and commit to a defensible remediation.",
  },
];

const SUGGESTED_TECH = {
  default: ["systems thinking", "code review", "debugging", "data analysis"],
  engineer: ["distributed systems", "API design", "databases", "observability"],
  data: ["SQL", "statistics", "experiment design", "Python"],
  qa: ["test strategy", "automation frameworks", "root-cause analysis", "exploratory testing"],
  product: ["roadmap prioritization", "user research", "metrics", "stakeholder mgmt"],
};

const SUGGESTED_SOFT = ["communication", "stakeholder mgmt", "trade-off reasoning", "ownership", "cross-team collaboration", "written clarity"];

function suggestTech(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("data") || t.includes("analyst") || t.includes("scientist")) return SUGGESTED_TECH.data;
  if (t.includes("qa") || t.includes("test")) return SUGGESTED_TECH.qa;
  if (t.includes("product")) return SUGGESTED_TECH.product;
  if (t.includes("engineer") || t.includes("developer") || t.includes("swe")) return SUGGESTED_TECH.engineer;
  return SUGGESTED_TECH.default;
}

const STEPS = [
  "Job title & industry",
  "Seniority level",
  "Technical skills",
  "Soft skills",
  "Success & challenges",
  "Difficulty level",
  "Language register",
];

export default function CreateRole() {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  const [form, setForm] = useState({
    job_title: "",
    industry: "",
    seniority: "mid",
    technical_skills: [],
    soft_skills: [],
    success_criteria: "",
    common_challenges: "",
    difficulty_level: "applied",
    language_register: "standard",
  });
  const [techInput, setTechInput] = useState("");
  const [softInput, setSoftInput] = useState("");

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const addChip = (key, val, setInput) => {
    const v = val.trim();
    if (!v) return;
    setForm((f) => (f[key].includes(v) ? f : { ...f, [key]: [...f[key], v] }));
    setInput("");
  };
  const removeChip = (key, val) => setForm((f) => ({ ...f, [key]: f[key].filter((s) => s !== val) }));

  const canNext =
    (step === 0 && form.job_title.trim().length > 0) ||
    (step === 1) ||
    (step === 2) ||
    (step === 3) ||
    (step === 4) ||
    (step === 5) ||
    (step === 6);

  const onSubmit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/roles", form);
      setDone(true);
      setTimeout(() => navigate(`/roles/${data.id}`), 1100);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to create role.");
      setBusy(false);
    }
  };

  const progress = done ? 100 : ((step + 1) / STEPS.length) * 100;

  // AI-powered suggestion state — falls back to static seeds if Claude is unavailable
  const { fetchSuggest, loading: suggestLoading } = useSuggest();
  const [techSuggestions, setTechSuggestions] = useState([]);
  const [softSuggestions, setSoftSuggestions] = useState([]);

  // Lazy-fetch suggestions when the user lands on the skills step
  useEffect(() => {
    let cancel = false;
    const run = async () => {
      if (step === 2 && techSuggestions.length === 0 && form.job_title.trim()) {
        const r = await fetchSuggest({
          kind: "technical_skills",
          jobTitle: form.job_title,
          industry: form.industry,
          seniority: form.seniority,
          existing: form.technical_skills,
        });
        if (!cancel && r) setTechSuggestions(r.suggestions || []);
      }
      if (step === 3 && softSuggestions.length === 0 && form.job_title.trim()) {
        const r = await fetchSuggest({
          kind: "soft_skills",
          jobTitle: form.job_title,
          industry: form.industry,
          seniority: form.seniority,
          existing: form.soft_skills,
        });
        if (!cancel && r) setSoftSuggestions(r.suggestions || []);
      }
    };
    run();
    return () => { cancel = true; };
  }, [step]);

  const refreshTech = async () => {
    const r = await fetchSuggest({
      kind: "technical_skills",
      jobTitle: form.job_title,
      industry: form.industry,
      seniority: form.seniority,
      existing: form.technical_skills,
      force: true,
    });
    if (r) setTechSuggestions(r.suggestions || []);
  };
  const refreshSoft = async () => {
    const r = await fetchSuggest({
      kind: "soft_skills",
      jobTitle: form.job_title,
      industry: form.industry,
      seniority: form.seniority,
      existing: form.soft_skills,
      force: true,
    });
    if (r) setSoftSuggestions(r.suggestions || []);
  };

  // AI draft buttons for success criteria & common challenges
  const [draftBusy, setDraftBusy] = useState(null); // 'success_criteria' | 'common_challenges' | null
  const draftField = async (kind) => {
    setDraftBusy(kind);
    try {
      const r = await fetchSuggest({
        kind,
        jobTitle: form.job_title,
        industry: form.industry,
        seniority: form.seniority,
        existing: [],
        force: true,
      });
      if (r?.draft) {
        setField(kind, r.draft);
        toast.success("Draft generated. Edit freely.");
      } else {
        toast.error("Couldn't generate a draft.");
      }
    } finally {
      setDraftBusy(null);
    }
  };

  // Remove suggestions that the user already picked
  const filteredTechSuggestions = techSuggestions.filter((s) => !form.technical_skills.includes(s));
  const filteredSoftSuggestions = softSuggestions.filter((s) => !form.soft_skills.includes(s));

  return (
    <div className="max-w-2xl mx-auto" data-testid="create-role-page">
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink mb-8" data-testid="create-role-back">
        <ArrowLeft size={14} /> Back to dashboard
      </Link>

      {/* Progress ring + step title */}
      <div className="flex items-center gap-4 mb-8">
        <div className="relative h-14 w-14">
          <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
            <circle cx="18" cy="18" r="15.915" fill="none" stroke="rgba(10,15,26,0.08)" strokeWidth="2.5" />
            <motion.circle
              cx="18" cy="18" r="15.915" fill="none"
              stroke="#4A6B53"
              strokeWidth="2.5"
              strokeLinecap="round"
              animate={{ strokeDasharray: `${progress} 100` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-brand">
            {done ? <CheckCircle weight="fill" size={20} className="text-brand-moss" /> : `${step + 1}/${STEPS.length}`}
          </div>
        </div>
        <div>
          <p className="encore-overline">Step {step + 1} of {STEPS.length}</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight" data-testid="create-role-step-title">
            {done ? "Role created!" : STEPS[step]}
          </h1>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {done ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="encore-card p-10 text-center"
            data-testid="create-role-success"
          >
            <div className="mx-auto h-14 w-14 rounded-full bg-brand-moss/10 text-brand-moss flex items-center justify-center mb-5">
              <CheckCircle weight="duotone" size={32} />
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight mb-2">{form.job_title}</h2>
            <p className="text-ink-soft">Taking you to your role…</p>
          </motion.div>
        ) : (
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="encore-card p-8"
          >
            {step === 0 && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-ink-soft mb-1.5">Job title</label>
                  <input
                    value={form.job_title}
                    onChange={update("job_title")}
                    placeholder="e.g. QA Engineer"
                    data-testid="step-job-title"
                    className="w-full bg-transparent border border-black/15 rounded-lg px-4 py-3 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-soft mb-1.5">Industry or domain</label>
                  <input
                    value={form.industry}
                    onChange={update("industry")}
                    placeholder="e.g. Casting foundry, Fintech, Healthtech"
                    data-testid="step-industry"
                    className="w-full bg-transparent border border-black/15 rounded-lg px-4 py-3 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all"
                  />
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <p className="text-sm text-ink-soft mb-4">Pick one. This calibrates the case difficulty and depth of judgment we test.</p>
                <div className="grid grid-cols-2 gap-3">
                  {SENIORITY.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setField("seniority", s.id)}
                      data-testid={`step-seniority-${s.id}`}
                      className={`text-left px-4 py-3 rounded-lg border transition-all ${
                        form.seniority === s.id
                          ? "bg-brand text-white border-brand"
                          : "bg-transparent text-ink border-black/15 hover:border-black/30 hover:bg-black/[0.02]"
                      }`}
                    >
                      <div className="font-display font-bold">{s.label}</div>
                      <div className={`text-xs ${form.seniority === s.id ? "text-white/70" : "text-ink-soft"}`}>{s.hint}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <ChipStep
                label="Technical skills to assess"
                placeholder="e.g. distributed systems"
                items={form.technical_skills}
                input={techInput}
                setInput={setTechInput}
                onAdd={() => addChip("technical_skills", techInput, setTechInput)}
                onRemove={(v) => removeChip("technical_skills", v)}
                suggestions={filteredTechSuggestions}
                onSuggest={(s) => setForm((f) => ({ ...f, technical_skills: [...f.technical_skills, s] }))}
                onRefresh={refreshTech}
                refreshing={suggestLoading}
                testidPrefix="step-tech"
              />
            )}

            {step === 3 && (
              <>
                <p className="text-xs text-ink-soft mb-4 bg-canvas border border-black/[0.06] rounded-lg p-3">
                  Note: some soft skills are best assessed in live interactive formats — that&rsquo;s fine. Add what you want surfaced in the case.
                </p>
                <ChipStep
                  label="Soft skills to surface"
                  placeholder="e.g. stakeholder management"
                  items={form.soft_skills}
                  input={softInput}
                  setInput={setSoftInput}
                  onAdd={() => addChip("soft_skills", softInput, setSoftInput)}
                  onRemove={(v) => removeChip("soft_skills", v)}
                  suggestions={filteredSoftSuggestions}
                  onSuggest={(s) => setForm((f) => ({ ...f, soft_skills: [...f.soft_skills, s] }))}
                  onRefresh={refreshSoft}
                  refreshing={suggestLoading}
                  testidPrefix="step-soft"
                />
              </>
            )}

            {step === 4 && (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-ink-soft">What does success look like in this role?</label>
                    <button
                      type="button"
                      onClick={() => draftField("success_criteria")}
                      disabled={draftBusy === "success_criteria" || !form.job_title.trim()}
                      data-testid="ai-draft-success"
                      className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-sand hover:text-brand-hover disabled:opacity-40 transition-colors"
                      title={!form.job_title.trim() ? "Add a job title first" : "Draft with AI"}
                    >
                      <Sparkle weight={draftBusy === "success_criteria" ? "duotone" : "fill"} size={11} className={draftBusy === "success_criteria" ? "animate-spin" : ""} />
                      {draftBusy === "success_criteria" ? "Drafting…" : "Generate with AI"}
                    </button>
                  </div>
                  <textarea
                    value={form.success_criteria}
                    onChange={update("success_criteria")}
                    rows={3}
                    placeholder="e.g. Independently owns reliability of the payments pipeline; ships measured improvements quarterly."
                    data-testid="step-success-criteria"
                    className="w-full bg-transparent border border-black/15 rounded-lg px-4 py-3 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all resize-none"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-ink-soft">Common real-world challenges</label>
                    <button
                      type="button"
                      onClick={() => draftField("common_challenges")}
                      disabled={draftBusy === "common_challenges" || !form.job_title.trim()}
                      data-testid="ai-draft-challenges"
                      className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-sand hover:text-brand-hover disabled:opacity-40 transition-colors"
                      title={!form.job_title.trim() ? "Add a job title first" : "Draft with AI"}
                    >
                      <Sparkle weight={draftBusy === "common_challenges" ? "duotone" : "fill"} size={11} className={draftBusy === "common_challenges" ? "animate-spin" : ""} />
                      {draftBusy === "common_challenges" ? "Drafting…" : "Generate with AI"}
                    </button>
                  </div>
                  <textarea
                    value={form.common_challenges}
                    onChange={update("common_challenges")}
                    rows={3}
                    placeholder="e.g. Incomplete logs, conflicting stakeholder priorities, legacy services no one fully understands."
                    data-testid="step-common-challenges"
                    className="w-full bg-transparent border border-black/15 rounded-lg px-4 py-3 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all resize-none"
                  />
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-3">
                {DIFFICULTY.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setField("difficulty_level", d.id)}
                    data-testid={`step-difficulty-${d.id}`}
                    className={`w-full text-left p-4 rounded-lg border transition-all ${
                      form.difficulty_level === d.id
                        ? "bg-brand text-white border-brand"
                        : "bg-transparent border-black/15 hover:border-black/30 hover:bg-black/[0.02]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-display font-bold">{d.label}</div>
                      {form.difficulty_level === d.id && <CheckCircle weight="fill" size={18} />}
                    </div>
                    <div className={`text-xs mt-1 ${form.difficulty_level === d.id ? "text-white/70" : "text-ink-soft"}`}>{d.desc}</div>
                  </button>
                ))}
              </div>
            )}

            {step === 6 && (
              <div className="space-y-3" data-testid="step-language-register">
                <p className="text-sm text-ink-soft -mt-2">Pick by reading the sample. This is how ENCORE will write the case &mdash; not how candidates will be judged.</p>
                {LANGUAGE_REGISTERS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setField("language_register", r.id)}
                    data-testid={`step-register-${r.id}`}
                    className={`w-full text-left p-4 rounded-lg border transition-all ${
                      form.language_register === r.id
                        ? "bg-brand text-white border-brand"
                        : "bg-transparent border-black/15 hover:border-black/30 hover:bg-black/[0.02]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-display font-bold">{r.label}</div>
                      {form.language_register === r.id && <CheckCircle weight="fill" size={18} />}
                    </div>
                    <p className={`mt-2 italic leading-relaxed text-sm ${form.language_register === r.id ? "text-white/80" : "text-ink"}`}>
                      &ldquo;{r.sample}&rdquo;
                    </p>
                  </button>
                ))}
                <p className="text-xs text-ink-soft pt-1" data-testid="register-trust-line">
                  This controls how ENCORE writes the case &mdash; not how candidates are judged. Candidates are never scored on their English; only on their reasoning.
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {!done && (
        <div className="flex items-center justify-between mt-6">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            data-testid="create-role-prev"
            className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink disabled:opacity-30"
          >
            <ArrowLeft size={14} /> Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              disabled={!canNext}
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              data-testid="create-role-next"
              className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover disabled:opacity-40 text-white rounded-lg px-5 py-2.5 transition-all hover:-translate-y-0.5"
            >
              <span className="font-medium text-sm">Continue</span>
              <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onSubmit}
              data-testid="create-role-submit"
              className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover disabled:opacity-60 text-white rounded-lg px-5 py-2.5 transition-all hover:-translate-y-0.5"
            >
              <Lightning size={14} weight="bold" />
              <span className="font-medium text-sm">{busy ? "Creating…" : "Create role"}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ChipStep({ label, placeholder, items, input, setInput, onAdd, onRemove, suggestions, onSuggest, onRefresh, refreshing, testidPrefix }) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink-soft mb-1.5">{label}</label>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }}
          placeholder={placeholder}
          data-testid={`${testidPrefix}-input`}
          className="flex-1 bg-transparent border border-black/15 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all"
        />
        <button
          type="button"
          onClick={onAdd}
          data-testid={`${testidPrefix}-add`}
          className="px-4 py-2.5 rounded-lg border border-black/15 hover:border-black/30 hover:bg-black/[0.03] text-sm font-medium"
        >
          Add
        </button>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            data-testid={`${testidPrefix}-ai-refresh`}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-brand-sand/10 hover:bg-brand-sand/15 text-brand-sand text-sm font-medium disabled:opacity-50 transition-colors"
            title="Suggest with AI"
          >
            <Sparkle weight="fill" size={13} className={refreshing ? "animate-pulse" : ""} />
            {refreshing ? "Thinking" : "AI"}
          </button>
        )}
      </div>
      {items.length > 0 && (
        <motion.div
          className="flex flex-wrap gap-2 mt-3"
          data-testid={`${testidPrefix}-list`}
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
        >
          <AnimatePresence initial={false}>
            {items.map((s) => (
              <motion.span
                key={s}
                layout
                initial={{ opacity: 0, scale: 0.85, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, y: -4 }}
                transition={{ type: "spring", stiffness: 380, damping: 26 }}
                variants={{ hidden: { opacity: 0, scale: 0.85 }, show: { opacity: 1, scale: 1 } }}
                className="inline-flex items-center gap-1.5 bg-brand/5 text-brand rounded-full px-3 py-1 text-xs font-medium"
              >
                {s}
                <button onClick={() => onRemove(s)} aria-label={`remove ${s}`} className="hover:text-brand-hover">
                  <X size={12} />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
      {suggestions?.length > 0 && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between mb-2">
            <p className="encore-overline">Suggestions {refreshing && <span className="text-brand-sand ml-1.5">refreshing…</span>}</p>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                data-testid={`${testidPrefix}-ai-refresh-inline`}
                className="text-[10px] font-medium text-ink-soft hover:text-ink inline-flex items-center gap-1 disabled:opacity-40"
              >
                <ArrowsClockwise size={11} className={refreshing ? "animate-spin" : ""} /> Refresh
              </button>
            )}
          </div>
          <motion.div
            className="flex flex-wrap gap-1.5"
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.03 } } }}
            key={suggestions.join("|")}
          >
            {suggestions.map((s) => (
              <motion.button
                key={s}
                type="button"
                onClick={() => onSuggest(s)}
                variants={{ hidden: { opacity: 0, y: 4, scale: 0.92 }, show: { opacity: 1, y: 0, scale: 1 } }}
                transition={{ type: "spring", stiffness: 380, damping: 26 }}
                data-testid={`${testidPrefix}-suggest-${s.replace(/\s+/g, "-")}`}
                className="text-xs bg-transparent border border-dashed border-black/15 text-ink-soft hover:text-brand hover:bg-brand/5 hover:border-brand/30 rounded-full px-3 py-1 transition-all"
              >
                + {s}
              </motion.button>
            ))}
          </motion.div>
        </div>
      )}
    </div>
  );
}
