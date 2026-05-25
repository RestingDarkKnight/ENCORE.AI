export default function EncorePremiumUpgrade() {
  return (
    <div className="min-h-screen bg-[#0A0F1C] text-white overflow-hidden">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.18),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(56,189,248,0.12),transparent_25%)] pointer-events-none" />

      {/* Navbar */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#0A0F1C]/75 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="text-lg font-black">E</span>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-wide">ENCORE</h1>
              <p className="text-xs text-gray-400">AI-native hiring platform</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm text-gray-300">
            <a href="#features" className="hover:text-white transition">Features</a>
            <a href="#workflow" className="hover:text-white transition">Workflow</a>
            <a href="#results" className="hover:text-white transition">Results</a>
            <button className="px-5 py-2 rounded-xl bg-white text-black font-semibold hover:scale-105 transition-all">
              Book Demo
            </button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative max-w-7xl mx-auto px-6 pt-24 pb-20 lg:pt-32">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 text-sm text-cyan-300 mb-6 backdrop-blur-lg">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              Simulation-first engineering hiring
            </div>

            <h1 className="text-5xl md:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight">
              Hire engineers
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-300">
                by capability.
              </span>
            </h1>

            <p className="mt-8 text-lg text-gray-400 leading-relaxed max-w-xl">
              ENCORE replaces resume filtering and interview theatrics with AI-evaluated case-study simulations that reveal real engineering judgment.
            </p>

            <div className="flex flex-wrap gap-4 mt-10">
              <button className="px-7 py-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-cyan-400 font-semibold text-white shadow-2xl shadow-indigo-500/25 hover:scale-[1.02] transition-all">
                Start Hiring
              </button>

              <button className="px-7 py-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all font-medium text-gray-200 backdrop-blur-lg">
                Watch Platform Demo
              </button>
            </div>

            <div className="grid grid-cols-3 gap-5 mt-14">
              {[
                ['93%', 'Signal accuracy'],
                ['4x', 'Faster screening'],
                ['68%', 'Better candidate fit'],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="p-5 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl"
                >
                  <div className="text-3xl font-black">{value}</div>
                  <div className="text-sm text-gray-400 mt-1">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Visual Side */}
          <div className="relative">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-cyan-400/20 rounded-full blur-3xl" />
            <div className="absolute -bottom-10 left-0 w-52 h-52 bg-indigo-500/20 rounded-full blur-3xl" />

            <div className="relative rounded-[32px] border border-white/10 bg-white/[0.04] backdrop-blur-2xl p-6 shadow-2xl shadow-black/30 overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 pb-5">
                <div>
                  <p className="text-gray-400 text-sm">Candidate Evaluation</p>
                  <h3 className="text-xl font-bold mt-1">Systems Design Simulation</h3>
                </div>
                <div className="px-4 py-2 rounded-xl bg-green-500/15 border border-green-500/30 text-green-300 text-sm">
                  AI Evaluated
                </div>
              </div>

              <div className="space-y-5 mt-6">
                {[
                  ['Problem Solving', '94%'],
                  ['Architecture Judgment', '91%'],
                  ['Code Reasoning', '96%'],
                  ['Scalability Thinking', '88%'],
                ].map(([title, score]) => (
                  <div key={title}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-300">{title}</span>
                      <span className="font-semibold text-cyan-300">{score}</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400"
                        style={{ width: score }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4 mt-8">
                <div className="p-5 rounded-2xl bg-[#111827] border border-white/5">
                  <p className="text-gray-400 text-sm">Assessment Time</p>
                  <h2 className="text-3xl font-black mt-2">42m</h2>
                </div>

                <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-500/15 to-cyan-500/10 border border-indigo-500/20">
                  <p className="text-gray-400 text-sm">Confidence Score</p>
                  <h2 className="text-3xl font-black mt-2">9.4/10</h2>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center max-w-3xl mx-auto">
          <p className="text-cyan-300 font-medium uppercase tracking-[0.2em] text-sm">
            Why ENCORE
          </p>
          <h2 className="mt-4 text-4xl md:text-5xl font-black leading-tight">
            Built for real engineering evaluation.
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-16">
          {[
            {
              title: 'Simulation-Based Hiring',
              desc: 'Evaluate engineers using real-world architecture and debugging scenarios instead of trivia interviews.',
            },
            {
              title: 'AI Capability Scoring',
              desc: 'Measure judgment, tradeoffs, systems thinking, and execution quality automatically.',
            },
            {
              title: 'Signal > Resume',
              desc: 'Remove pedigree bias and uncover candidates with genuine technical depth.',
            },
            {
              title: 'Recruiter Copilot',
              desc: 'Instant summaries, benchmark rankings, and hiring recommendations.',
            },
            {
              title: 'Fast Screening',
              desc: 'Reduce engineering hiring cycles from weeks to hours.',
            },
            {
              title: 'Enterprise Ready',
              desc: 'Scalable workflows, role-based simulations, and customizable evaluation rubrics.',
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="group p-7 rounded-[28px] border border-white/10 bg-white/[0.03] hover:bg-white/[0.05] transition-all backdrop-blur-xl"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center text-xl mb-6 group-hover:scale-110 transition-transform">
                ✦
              </div>

              <h3 className="text-xl font-bold">{feature.title}</h3>
              <p className="mt-4 text-gray-400 leading-relaxed text-sm">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow */}
      <section
        id="workflow"
        className="max-w-7xl mx-auto px-6 py-24"
      >
        <div className="rounded-[40px] border border-white/10 bg-gradient-to-br from-[#111827] to-[#0B1220] p-10 lg:p-16 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl" />

          <div className="max-w-3xl relative z-10">
            <p className="text-cyan-300 uppercase tracking-[0.2em] text-sm font-medium">
              Hiring Workflow
            </p>
            <h2 className="mt-5 text-4xl md:text-5xl font-black leading-tight">
              Structured hiring.
              <span className="text-gray-500"> Without interview chaos.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-4 gap-6 mt-16 relative z-10">
            {[
              'Create role simulation',
              'Candidates solve scenarios',
              'AI evaluates performance',
              'Hire with confidence',
            ].map((step, i) => (
              <div
                key={step}
                className="relative p-6 rounded-3xl border border-white/10 bg-white/[0.03]"
              >
                <div className="text-5xl font-black text-white/10 absolute top-4 right-5">
                  0{i + 1}
                </div>
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center font-bold mb-6">
                  {i + 1}
                </div>
                <p className="text-lg font-semibold leading-relaxed">
                  {step}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <footer className="max-w-7xl mx-auto px-6 pb-20">
        <div className="rounded-[36px] border border-white/10 bg-white/[0.03] p-10 lg:p-14 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-10 backdrop-blur-xl">
          <div>
            <h2 className="text-4xl font-black leading-tight max-w-2xl">
              Technical hiring deserves better signal.
            </h2>
            <p className="mt-5 text-gray-400 max-w-xl text-lg">
              ENCORE helps engineering teams hire for capability, not interview performance.
            </p>
          </div>

          <button className="px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-cyan-400 text-white font-semibold shadow-xl shadow-cyan-500/20 hover:scale-105 transition-all">
            Get Started
          </button>
        </div>
      </footer>
    </div>
  );
}
