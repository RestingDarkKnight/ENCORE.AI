import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Compass, ArrowRight, Lightning, Brain, Microphone, ChartBar, Quotes, GitCommit, ShieldCheck,
} from "@phosphor-icons/react";

const STEPS = [
  { icon: Brain, label: "Describe the role", body: "Six guided steps. Title, seniority, real success criteria, the messes a strong hire will untangle." },
  { icon: Lightning, label: "Generate a case", body: "Claude drafts a work-simulation case with a weighted rubric and 1/3/5 behavioral anchors. You edit anything inline. You approve." },
  { icon: Microphone, label: "Candidate takes it", body: "Section-by-section. Text and optional voice. Progress visible, never stressful. Honor code on the way in." },
  { icon: ChartBar, label: "ENCORE evaluates", body: "Per-dimension score with a verbatim quote justifying each call. Strengths, concerns, recommendation. You decide." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Header */}
      <header className="border-b border-black/[0.06]">
        <div className="mx-auto max-w-6xl px-6 lg:px-10 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5" data-testid="landing-brand">
            <div className="h-8 w-8 rounded-md bg-brand flex items-center justify-center text-white">
              <Compass weight="duotone" size={18} />
            </div>
            <span className="font-display font-black text-lg tracking-tight">ENCORE</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/login" data-testid="landing-signin" className="text-sm font-medium text-ink-soft hover:text-ink px-3 py-1.5 rounded-md">Sign in</Link>
            <Link to="/signup" data-testid="landing-signup" className="inline-flex items-center gap-1.5 bg-brand hover:bg-brand-hover text-white rounded-lg px-4 py-2 text-sm font-medium transition-all hover:-translate-y-0.5">
              Start free <ArrowRight size={13} />
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 lg:px-10 pt-20 pb-16 lg:pt-28 lg:pb-24 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            data-testid="landing-hero"
          >
            <p className="encore-overline mb-4 inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-moss" /> AI-native simulation hiring
            </p>
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-black tracking-[-0.03em] leading-[0.98]">
              Hire on judgment.<br/>
              <span className="text-brand-moss">Not trivia.</span>
            </h1>
            <p className="mt-6 text-lg text-ink-soft max-w-xl">
              ENCORE turns a job description into a realistic work-simulation case study. Candidates show how they actually think, investigate, and decide. You get a scored report with quotes — not a black-box vibe check.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/signup" data-testid="hero-cta-primary" className="group inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white rounded-lg px-6 py-3 transition-all hover:-translate-y-0.5 shadow-sm">
                <span className="font-medium">Start free</span>
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </Link>
              <Link to="/login" data-testid="hero-cta-secondary" className="inline-flex items-center gap-2 border border-black/15 hover:border-black/30 hover:bg-black/[0.02] rounded-lg px-5 py-3 transition-all">
                <span className="font-medium text-sm">I have an account</span>
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-soft">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck weight="duotone" size={14} className="text-brand-moss" /> Server-side AI only — keys never touch the browser</span>
              <span className="inline-flex items-center gap-1.5"><GitCommit weight="duotone" size={14} className="text-brand-moss" /> Powered by Claude Opus</span>
            </div>
          </motion.div>

          {/* Right: the visible product — a faux report card */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="relative"
          >
            <div className="absolute -inset-8 bg-gradient-to-tr from-brand-sand/15 via-transparent to-brand-moss/15 rounded-3xl blur-2xl pointer-events-none" />
            <div className="relative encore-card p-6 shadow-[0_30px_60px_-30px_rgba(10,15,26,0.25)]">
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <p className="encore-overline mb-1">The foundry escape</p>
                  <h3 className="font-display text-xl font-bold tracking-tight">Alex Tanaka</h3>
                  <p className="text-xs text-ink-soft">QA Engineer · Mid-level</p>
                </div>
                <div className="relative h-16 w-16 shrink-0">
                  <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="rgba(10,15,26,0.08)" strokeWidth="3"/>
                    <motion.circle
                      cx="18" cy="18" r="15.915" fill="none"
                      stroke="#1A2E35" strokeWidth="3" strokeLinecap="round"
                      strokeDasharray="100"
                      initial={{ strokeDashoffset: 100 }}
                      animate={{ strokeDashoffset: 24 }}
                      transition={{ duration: 1.2, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-display font-black text-lg leading-none">3.8</span>
                    <span className="text-[8px] text-ink-soft uppercase tracking-wider mt-0.5">/ 5</span>
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider border rounded-full px-2.5 py-1 bg-brand-moss/10 text-brand-moss border-brand-moss/30">Hire</span>
              <blockquote className="mt-5 border-l-4 border-brand-sand bg-brand-sand/[0.05] rounded-r-lg pl-4 pr-4 py-3">
                <div className="flex items-start gap-2">
                  <Quotes weight="fill" size={14} className="text-brand-sand mt-0.5 shrink-0" />
                  <p className="text-sm italic text-ink leading-relaxed">I&rsquo;d weigh the cost of halting production ($40K/day) against the reputational risk of more defects reaching customers.</p>
                </div>
              </blockquote>
              <div className="mt-5 grid grid-cols-2 gap-3 text-[11px] text-ink-soft">
                {[
                  ["Investigation rigor", 4.0],
                  ["Trade-off reasoning", 4.5],
                  ["Stakeholder comms", 3.0],
                  ["Systems thinking", 3.5],
                ].map(([n, s]) => (
                  <div key={n} className="border border-black/[0.06] rounded-lg p-2">
                    <p className="font-medium text-ink">{n}</p>
                    <div className="relative h-1 bg-black/[0.06] rounded-full mt-1.5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(s / 5) * 100}%` }}
                        transition={{ duration: 1, delay: 0.6 + 0.1 * Number(s) }}
                        className="absolute inset-y-0 left-0 bg-brand"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-black/[0.06] bg-white/60">
        <div className="mx-auto max-w-6xl px-6 lg:px-10 py-20">
          <p className="encore-overline mb-3">How it works</p>
          <h2 className="font-display text-3xl sm:text-4xl font-black tracking-tighter leading-tight max-w-2xl mb-12">
            One loop. Four steps. No theatre.
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="encore-card p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="h-10 w-10 rounded-md bg-brand/5 text-brand flex items-center justify-center">
                    <s.icon weight="duotone" size={20} />
                  </div>
                  <span className="font-display text-2xl font-black text-ink-soft/40 tabular-nums">0{i + 1}</span>
                </div>
                <h3 className="font-display font-bold tracking-tight mb-1">{s.label}</h3>
                <p className="text-sm text-ink-soft leading-relaxed">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing band */}
      <section className="mx-auto max-w-6xl px-6 lg:px-10 py-20">
        <div className="encore-card p-10 lg:p-16 text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-black tracking-tighter leading-tight mb-4">
            Stop guessing in interviews.
          </h2>
          <p className="text-ink-soft max-w-xl mx-auto mb-8">Set up your first role in under five minutes. We&rsquo;ll handle the rest.</p>
          <Link to="/signup" data-testid="closing-cta" className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white rounded-lg px-6 py-3 transition-all hover:-translate-y-0.5 shadow-sm">
            <span className="font-medium">Create my studio</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <footer className="border-t border-black/[0.06] py-8">
        <div className="mx-auto max-w-6xl px-6 lg:px-10 flex items-center justify-between text-xs text-ink-soft">
          <span>© {new Date().getFullYear()} ENCORE — Hiring on judgment.</span>
          <span>Built with Claude · Powered by Emergent</span>
        </div>
      </footer>
    </div>
  );
}
