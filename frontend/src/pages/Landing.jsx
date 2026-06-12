// Landing.jsx — confident single-page marketing site for ENCORE.
// Hero: GSAP-timeline headline reveal + grain + gradient drift.
// Product story: three styled mocks (Case Studio, Candidate Portal, Reports Hub) that
//   stagger-reveal on scroll using framer-motion's whileInView.
// All decoration honors prefers-reduced-motion (skip transforms, keep content visible).

import { useEffect, useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { gsap } from "gsap";
import {
  Compass, ArrowRight, Lightning, Brain, ChartBar, Quotes, GitCommit, ShieldCheck, Sparkle,
  Microphone, FileText, CheckCircle, PaperPlaneTilt, ChartLineUp, Briefcase,
} from "@phosphor-icons/react";

const FEATURE_STEPS = [
  { icon: Brain, label: "Describe the role", body: "Six guided steps. Title, seniority, real success criteria, the messes a strong hire will untangle." },
  { icon: Lightning, label: "Generate a case", body: "Claude drafts a work-simulation case with a weighted rubric and 1/3/5 behavioral anchors. You edit anything inline. You approve." },
  { icon: Microphone, label: "Candidate takes it", body: "Section-by-section. Text and optional voice. Progress visible, never stressful. Honor code on the way in." },
  { icon: ChartBar, label: "ENCORE evaluates", body: "Per-dimension score with a verbatim quote justifying each call. Strengths, concerns, recommendation. You decide." },
];

const QUOTES = [
  { who: "Eng Director, Series-B SaaS", text: "We cut take-home reviews in half. The rubric is the conversation now \u2014 not the gut feel." },
  { who: "Head of People, Climate startup", text: "Finally an interview signal candidates actually respect. The cases feel like real work." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-canvas text-ink overflow-x-hidden">
      <SiteHeader />
      <Hero />
      <ProductMockSection
        eyebrow="Case Studio"
        title="Generate, edit, approve. Without leaving the page."
        body="A real, sectioned case study with a weighted rubric and behavioral anchors. Every word is editable inline; nothing is locked in until you say so."
        Mock={CaseStudioMock}
      />
      <ProductMockSection
        eyebrow="Candidate Portal"
        title="Calm to take. Honest to score."
        body="Section progress, gentle timer, autosave, optional voice answers. No tracking gimmicks. No anxiety theatre."
        Mock={CandidatePortalMock}
        flip
      />
      <ProductMockSection
        eyebrow="Reports Hub"
        title="Scored. Quoted. Decision-ready."
        body="Per-dimension scores with a verbatim quote from the candidate behind every number. One click to advance, hold, or reject."
        Mock={ReportsHubMock}
      />
      <HowItWorks />
      <SocialProof />
      <ClosingBand />
      <SiteFooter />
    </div>
  );
}

/* ---------- Header ---------- */
function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-canvas/75 border-b border-black/[0.05]">
      <div className="mx-auto max-w-6xl px-6 lg:px-10 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5" data-testid="landing-brand">
          <div className="h-8 w-8 rounded-md bg-brand flex items-center justify-center text-white">
            <Compass weight="duotone" size={18} />
          </div>
          <span className="font-display font-black text-lg tracking-tight">ENCORE</span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link to="/login" data-testid="landing-signin" className="text-sm font-medium text-ink-soft hover:text-ink px-3 py-1.5 rounded-md">
            Sign in
          </Link>
          <Link to="/signup" data-testid="landing-signup" className="btn-primary py-2 px-4 text-sm">
            Start free <ArrowRight size={13} />
          </Link>
        </nav>
      </div>
    </header>
  );
}

/* ---------- Hero w/ GSAP headline timeline ---------- */
function Hero() {
  const rootRef = useRef(null);
  const reduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    if (reduceMotion) return undefined;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.from("[data-anim='eyebrow']", { y: 12, opacity: 0, duration: 0.6 })
        .from("[data-anim='headline-word']", {
          yPercent: 110,
          opacity: 0,
          duration: 0.9,
          stagger: 0.08,
        }, "-=0.2")
        .from("[data-anim='subhead']", { y: 14, opacity: 0, duration: 0.7 }, "-=0.4")
        .from("[data-anim='ctas']", { y: 12, opacity: 0, duration: 0.6 }, "-=0.45")
        .from("[data-anim='trust']", { y: 8, opacity: 0, duration: 0.5 }, "-=0.4")
        .from("[data-anim='product']", { y: 22, opacity: 0, duration: 0.9 }, "-=0.7");
    }, rootRef);
    return () => ctx.revert();
  }, [reduceMotion]);

  return (
    <section ref={rootRef} className="relative grain" data-testid="landing-hero">
      <div className="absolute inset-0 gradient-drift pointer-events-none" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-6 lg:px-10 pt-20 pb-section lg:pt-section-lg lg:pb-section-lg grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-20 items-center">
        <div>
          <p className="encore-overline mb-5 inline-flex items-center gap-2" data-anim="eyebrow">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-moss animate-pulse" /> AI-native simulation hiring
          </p>
          <h1 className="font-display text-display-1 font-black leading-[0.95]">
            <span className="block overflow-hidden">
              <span className="inline-block" data-anim="headline-word">Hire</span>{" "}
              <span className="inline-block" data-anim="headline-word">on</span>{" "}
              <span className="inline-block" data-anim="headline-word">judgment.</span>
            </span>
            <span className="block overflow-hidden text-brand-moss">
              <span className="inline-block" data-anim="headline-word">Not</span>{" "}
              <span className="inline-block" data-anim="headline-word">trivia.</span>
            </span>
          </h1>
          <p className="mt-7 text-lg text-ink-soft max-w-xl leading-relaxed" data-anim="subhead">
            ENCORE turns a job description into a realistic work-simulation case study. Candidates show how they actually think, investigate, and decide. You get a scored report with quotes &mdash; not a black-box vibe check.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3" data-anim="ctas">
            <Link to="/signup" data-testid="hero-cta-primary" className="btn-primary px-6 py-3 group">
              <span>Start free</span>
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <Link to="/login" data-testid="hero-cta-secondary" className="btn-quiet px-5 py-3">
              <span>I have an account</span>
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-soft" data-anim="trust">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck weight="duotone" size={14} className="text-brand-moss" />
              Server-side AI only &mdash; keys never touch the browser
            </span>
            <span className="inline-flex items-center gap-1.5">
              <GitCommit weight="duotone" size={14} className="text-brand-moss" />
              Powered by Claude Opus
            </span>
          </div>
        </div>

        {/* Hero product mock — preview of a scored report */}
        <div className="relative" data-anim="product">
          <div className="absolute -inset-8 bg-gradient-to-tr from-brand-sand/15 via-transparent to-brand-moss/15 rounded-3xl blur-2xl pointer-events-none" />
          <div className="relative encore-card-lift p-7">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <p className="encore-overline mb-1">The foundry escape</p>
                <h3 className="font-display text-xl font-bold tracking-tight">Alex Tanaka</h3>
                <p className="text-xs text-ink-soft">QA Engineer &middot; Mid-level</p>
              </div>
              <div className="relative h-16 w-16 shrink-0">
                <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
                  <circle cx="18" cy="18" r="15.915" fill="none" stroke="rgba(10,15,26,0.08)" strokeWidth="3" />
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
                  <span className="font-display font-black text-lg leading-none tabular-nums">3.8</span>
                  <span className="text-[8px] text-ink-soft uppercase tracking-wider mt-0.5">/ 5</span>
                </div>
              </div>
            </div>
            <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider border rounded-full px-2.5 py-1 bg-brand-moss/10 text-brand-moss border-brand-moss/30">
              Hire
            </span>
            <blockquote className="mt-5 border-l-4 border-brand-sand bg-brand-sand/[0.05] rounded-r-lg pl-4 pr-4 py-3">
              <div className="flex items-start gap-2">
                <Quotes weight="fill" size={14} className="text-brand-sand mt-0.5 shrink-0" />
                <p className="text-sm italic text-ink leading-relaxed">
                  I&rsquo;d weigh the cost of halting production ($40K/day) against the reputational risk of more defects reaching customers.
                </p>
              </div>
            </blockquote>
            <div className="mt-5 grid grid-cols-2 gap-3 text-[11px] text-ink-soft">
              {[
                ["Investigation rigor", 4.0],
                ["Trade-off reasoning", 4.5],
                ["Stakeholder comms", 3.0],
                ["Systems thinking", 3.5],
              ].map(([n, s], i) => (
                <div key={n} className="border border-black/[0.06] rounded-lg p-2.5">
                  <p className="font-medium text-ink">{n}</p>
                  <div className="relative h-1 bg-black/[0.06] rounded-full mt-1.5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(s / 5) * 100}%` }}
                      transition={{ duration: 1, delay: 0.6 + 0.12 * i }}
                      className="absolute inset-y-0 left-0 bg-brand"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Reusable mock section w/ scroll reveals ---------- */
function ProductMockSection({ eyebrow, title, body, Mock, flip = false }) {
  const reduce = useReducedMotion();
  return (
    <section className={`relative ${flip ? "section-warm" : ""}`}>
      <div className="mx-auto max-w-6xl px-6 lg:px-10 py-section">
        <div className={`grid lg:grid-cols-2 gap-12 lg:gap-20 items-center ${flip ? "lg:[&>*:first-child]:order-2" : ""}`}>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="encore-overline-sand mb-3">{eyebrow}</p>
            <h2 className="font-display text-display-2 font-black mb-5">{title}</h2>
            <p className="text-ink-soft leading-relaxed max-w-md">{body}</p>
          </motion.div>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <div className="absolute -inset-6 bg-gradient-to-tr from-brand/[0.06] via-transparent to-brand-sand/[0.10] rounded-3xl blur-2xl pointer-events-none" />
            <div className="relative">
              <Mock />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Mock: Case Studio (sectioned case + rubric chip) ---------- */
function CaseStudioMock() {
  return (
    <div className="encore-card-lift p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="encore-overline">QA Engineer · Mid-level</p>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-brand-moss/10 text-brand-moss border border-brand-moss/30 rounded-full px-2 py-0.5">
          <CheckCircle weight="fill" size={9} /> Approved
        </span>
      </div>
      <h3 className="font-display text-2xl font-black tracking-tight mb-2">The foundry escape</h3>
      <p className="text-sm text-ink-soft mb-5 leading-relaxed">
        Production line at FerroForge is shipping defect-rich brackets to the EV plant. You have 48 hours, three stakeholders with conflicting priorities, and incomplete telemetry.
      </p>
      <div className="space-y-2.5">
        {[
          { n: 1, t: "Triage & root-cause", q: 4 },
          { n: 2, t: "Stakeholder alignment", q: 3 },
          { n: 3, t: "Remediation plan", q: 5 },
        ].map((s) => (
          <div key={s.n} className="flex items-center justify-between border border-black/[0.06] rounded-lg p-3 bg-canvas/40">
            <div className="flex items-center gap-3">
              <span className="font-display text-sm font-black text-ink-soft tabular-nums w-6">0{s.n}</span>
              <p className="text-sm font-medium text-ink">{s.t}</p>
            </div>
            <span className="text-[11px] text-ink-soft tabular-nums">{s.q} questions</span>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-1.5">
        {["Investigation", "Trade-offs", "Comms", "Systems thinking"].map((k) => (
          <span key={k} className="inline-flex items-center text-[10px] font-medium bg-brand/5 text-brand border border-brand/15 rounded-full px-2 py-0.5">
            <Sparkle weight="fill" size={8} className="mr-1 text-brand-sand" />
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- Mock: Candidate Portal (progress + audio idle bar) ---------- */
function CandidatePortalMock() {
  return (
    <div className="encore-card-lift p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12">
            <svg viewBox="0 0 36 36" className="-rotate-90">
              <circle cx="18" cy="18" r="15.915" fill="none" stroke="rgba(10,15,26,0.08)" strokeWidth="3" />
              <motion.circle
                cx="18" cy="18" r="15.915" fill="none"
                stroke="#4A6B53" strokeWidth="3" strokeLinecap="round"
                strokeDasharray="100"
                initial={{ strokeDashoffset: 100 }}
                whileInView={{ strokeDashoffset: 38 }}
                viewport={{ once: true }}
                transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-display text-xs font-black tabular-nums">2/3</span>
            </div>
          </div>
          <div>
            <p className="encore-overline">Section 2 of 3</p>
            <p className="font-display text-base font-bold tracking-tight">Stakeholder alignment</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft tabular-nums">
          <FileText size={12} /> 1h 14m left
        </span>
      </div>
      <p className="text-sm text-ink leading-relaxed mb-4 border-l-2 border-brand-sand/40 pl-3">
        The plant manager wants production resumed. Quality wants a full stop. Engineering needs more data. Draft your alignment plan.
      </p>
      <div className="rounded-lg border border-black/10 bg-canvas/60 p-3 text-sm text-ink/70 mb-3">
        <p className="opacity-80 leading-relaxed">
          I&rsquo;d weigh the cost of halting production ($40K/day) against the reputational risk of more defects reaching the EV plant&hellip;
          <span className="inline-block w-px h-3.5 bg-brand-moss/70 align-middle ml-0.5 animate-pulse" />
        </p>
      </div>
      <div className="flex items-center justify-between text-xs text-ink-soft">
        <span className="inline-flex items-center gap-1.5"><Microphone size={12} className="text-brand-moss" /> Tap to add a voice note</span>
        <span className="inline-flex items-center gap-1.5 text-brand-moss"><CheckCircle weight="fill" size={11} /> Saved</span>
      </div>
    </div>
  );
}

/* ---------- Mock: Reports Hub (leaderboard + decision badges) ---------- */
function ReportsHubMock() {
  const rows = [
    { name: "Alex Tanaka", score: 4.2, rec: "Strong Hire", recCls: "bg-brand-moss text-white border-brand-moss", dec: "Advanced" },
    { name: "Priya R.", score: 3.6, rec: "Hire", recCls: "bg-brand-moss/10 text-brand-moss border-brand-moss/30", dec: null },
    { name: "Sam O.", score: 2.4, rec: "No Hire", recCls: "bg-signal-error/10 text-signal-error border-signal-error/30", dec: "Rejected" },
  ];
  return (
    <div className="encore-card-lift p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="encore-overline flex items-center gap-1.5">
          <ChartLineUp weight="duotone" size={12} className="text-brand-sand" /> Reports hub
        </p>
        <span className="text-xs text-ink-soft">Ranked by overall score</span>
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <motion.div
            key={r.name}
            initial={{ opacity: 0, y: 6 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
            className="flex items-center gap-3 p-3 rounded-lg border border-black/[0.06] bg-canvas/40"
          >
            <span className="font-display text-sm font-black text-ink-soft tabular-nums w-6">#{i + 1}</span>
            <span className="font-display text-xl font-black tracking-tighter text-brand tabular-nums w-12">{r.score.toFixed(1)}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-ink text-sm truncate">{r.name}</p>
              <div className="h-1 rounded-full bg-black/[0.06] mt-1 overflow-hidden w-32">
                <motion.div
                  className="h-full bg-brand"
                  initial={{ width: 0 }}
                  whileInView={{ width: `${(r.score / 5) * 100}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.9, delay: 0.2 + i * 0.08 }}
                />
              </div>
            </div>
            {r.dec && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 ${
                r.dec === "Advanced" ? "border-brand-moss/30 text-brand-moss" : "border-signal-error/30 text-signal-error"
              }`}>
                <CheckCircle weight="fill" size={10} /> {r.dec}
              </span>
            )}
            <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 ${r.recCls}`}>
              {r.rec}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ---------- How it works ---------- */
function HowItWorks() {
  return (
    <section className="border-y border-black/[0.06] section-warm">
      <div className="mx-auto max-w-6xl px-6 lg:px-10 py-section">
        <p className="encore-overline mb-3">How it works</p>
        <h2 className="font-display text-display-2 font-black tracking-tighter leading-tight max-w-2xl mb-12">
          One loop. Four steps. No theatre.
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURE_STEPS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="encore-card p-6 encore-card-hover"
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
  );
}

/* ---------- Social proof ---------- */
function SocialProof() {
  return (
    <section className="mx-auto max-w-6xl px-6 lg:px-10 py-section">
      <p className="encore-overline mb-3">From early teams</p>
      <h2 className="font-display text-display-3 font-black mb-10 max-w-2xl">What hiring managers say after their first loop.</h2>
      <div className="grid md:grid-cols-2 gap-5">
        {QUOTES.map((q, i) => (
          <motion.figure
            key={q.who}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            className="encore-card p-7"
          >
            <Quotes weight="fill" size={20} className="text-brand-sand mb-3" />
            <blockquote className="font-display text-lg leading-snug tracking-tight text-ink mb-4">{q.text}</blockquote>
            <figcaption className="encore-overline">{q.who}</figcaption>
          </motion.figure>
        ))}
      </div>
    </section>
  );
}

/* ---------- Closing CTA ---------- */
function ClosingBand() {
  return (
    <section className="mx-auto max-w-6xl px-6 lg:px-10 pb-section-lg">
      <div className="relative encore-card-lift p-10 lg:p-16 text-center overflow-hidden grain">
        <div className="absolute inset-0 gradient-drift pointer-events-none opacity-70" aria-hidden />
        <div className="relative">
          <h2 className="font-display text-display-2 font-black mb-4">Stop guessing in interviews.</h2>
          <p className="text-ink-soft max-w-xl mx-auto mb-8">Set up your first role in under five minutes. We&rsquo;ll handle the rest.</p>
          <Link to="/signup" data-testid="closing-cta" className="btn-primary px-6 py-3">
            <span>Create my studio</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------- Footer ---------- */
function SiteFooter() {
  return (
    <footer className="border-t border-black/[0.06] py-8">
      <div className="mx-auto max-w-6xl px-6 lg:px-10 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-soft">
        <span>&copy; {new Date().getFullYear()} ENCORE &mdash; Hiring on judgment.</span>
        <span>Built with Claude &middot; Powered by Emergent</span>
      </div>
    </footer>
  );
}
