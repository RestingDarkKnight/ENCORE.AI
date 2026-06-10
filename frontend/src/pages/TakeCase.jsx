import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Compass, ArrowRight, ArrowLeft, Microphone, Stop, CheckCircle,
  ClockCountdown, FloppyDisk, Warning, Sparkle, Play,
} from "@phosphor-icons/react";
import { fetchTake, publicAudioUrl, saveProgress, submitTake, uploadAudio } from "@/lib/takeApi";
import { useVoiceRecorder } from "@/lib/useVoiceRecorder";

function fmtMmSs(totalSec) {
  const m = Math.max(0, Math.floor(totalSec / 60));
  const s = Math.max(0, totalSec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ProgressRing({ value, size = 56, stroke = 4, label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (c * value) / 100;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(10,15,26,0.08)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="#4A6B53" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-display text-xs font-bold text-brand">{label}</div>
    </div>
  );
}

export default function TakeCase() {
  const { token } = useParams();
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [stage, setStage] = useState("welcome"); // welcome | sections | submitting | done
  const [sectionIdx, setSectionIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [audio, setAudio] = useState({}); // key -> AudioRecord
  const [honorChecked, setHonorChecked] = useState(false);

  const [savedAt, setSavedAt] = useState(null);
  const [now, setNow] = useState(Date.now());

  const saveTimer = useRef(null);
  const startedAtRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchTake(token);
      setView(data);
      setAnswers(data.saved_answers || {});
      setAudio(data.saved_audio || {});
      setHonorChecked(!!data.honor_code_accepted);
      if (data.status === "submitted") setStage("done");
      else if (data.started_at) startedAtRef.current = new Date(data.started_at).getTime();
    } catch (e) {
      setErr(e?.response?.data?.detail || "This invitation link is invalid or expired.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // 1s timer tick for the countdown
  useEffect(() => {
    if (stage !== "sections") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [stage]);

  // Debounced autosave on answers change
  useEffect(() => {
    if (stage !== "sections" || !view) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await saveProgress(token, answers, honorChecked);
        setSavedAt(new Date());
      } catch {/* silent — next save will retry */}
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [answers, honorChecked, stage, token, view]);

  if (loading) return <FullPageMessage>Loading your case…</FullPageMessage>;
  if (err) return <FullPageMessage tone="error">{err}</FullPageMessage>;
  if (!view) return null;

  const sections = view.case.sections;
  const total = sections.length;
  const currentSection = sections[sectionIdx];

  // Time remaining
  const startedMs = startedAtRef.current || Date.now();
  const elapsedSec = Math.floor((now - startedMs) / 1000);
  const remainSec = Math.max(0, view.time_limit_minutes * 60 - elapsedSec);

  const progressPct = stage === "done" ? 100 : Math.round(((sectionIdx) / total) * 100);

  // ---------- Actions ----------
  const beginCase = () => {
    if (!honorChecked) {
      toast.error("Please accept the honor code to begin.");
      return;
    }
    startedAtRef.current = Date.now();
    setStage("sections");
  };

  const onSubmit = async () => {
    setStage("submitting");
    try {
      await submitTake(token, answers, elapsedSec);
      setStage("done");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Submit failed. Please try again.");
      setStage("sections");
    }
  };

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Sticky header */}
      <header className="encore-glass-header" data-testid="take-header">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-10 h-14 sm:h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-md bg-brand flex items-center justify-center text-white shrink-0">
              <Compass weight="duotone" size={16} />
            </div>
            <span className="font-display font-black text-base sm:text-lg tracking-tight">ENCORE</span>
            <span className="hidden lg:inline encore-overline ml-3 truncate">{view.case.title}</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {stage === "sections" && (
              <>
                <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft" data-testid="take-saved-indicator">
                  <FloppyDisk size={12} />
                  {savedAt ? `Saved ${fmtMmSs(Math.max(0, Math.floor((Date.now() - savedAt.getTime()) / 1000)))} ago` : "Autosave on"}
                </span>
                <span className="inline-flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm font-medium text-ink tabular-nums" data-testid="take-timer">
                  <ClockCountdown size={14} />
                  {fmtMmSs(remainSec)}
                </span>
                <ProgressRing value={progressPct} label={`${sectionIdx + 1}/${total}`} size={44} stroke={3} />
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-10 py-6 sm:py-10">
        <AnimatePresence mode="wait">
          {stage === "welcome" && (
            <Welcome
              view={view}
              honorChecked={honorChecked}
              setHonorChecked={setHonorChecked}
              onBegin={beginCase}
            />
          )}

          {stage === "sections" && (
            <SectionsStage
              key={`s-${sectionIdx}`}
              token={token}
              section={currentSection}
              sectionIdx={sectionIdx}
              total={total}
              scenario={view.case.scenario_text}
              answers={answers}
              setAnswers={setAnswers}
              audio={audio}
              setAudio={setAudio}
              onPrev={() => setSectionIdx((i) => Math.max(0, i - 1))}
              onNext={() => setSectionIdx((i) => Math.min(total - 1, i + 1))}
              onSubmit={onSubmit}
              isLast={sectionIdx === total - 1}
            />
          )}

          {stage === "submitting" && (
            <FullPageMessage>Locking in your work and notifying the team…</FullPageMessage>
          )}

          {stage === "done" && <DoneScreen view={view} />}
        </AnimatePresence>
      </main>
    </div>
  );
}

// ---------- Welcome ----------
function Welcome({ view, honorChecked, setHonorChecked, onBegin }) {
  return (
    <motion.div
      key="welcome"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4 }}
      data-testid="take-welcome"
      className="space-y-8"
    >
      <div>
        <p className="encore-overline mb-2 flex items-center gap-2"><Sparkle weight="duotone" size={12} className="text-brand-sand" /> Work simulation</p>
        <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter leading-[1.05] break-words">{view.case.title}</h1>
        <p className="text-ink-soft mt-3">
          Hello{view.candidate_name ? `, ${view.candidate_name}` : ""}. You have <strong className="text-ink">{view.time_limit_minutes} minutes</strong> and {view.case.sections.length} sections to work through. Save is automatic.
        </p>
      </div>

      <div className="encore-card p-7">
        <p className="encore-overline mb-2">How this works</p>
        <ul className="space-y-2 text-sm text-ink list-disc list-inside marker:text-ink-soft">
          <li>The scenario is fictional, but the problem is the kind you would actually face on the job.</li>
          <li>There is no single right answer. We&rsquo;re looking at how you think, investigate, decide, and communicate.</li>
          <li>Answer in your own words — short, sharp reasoning is preferred over walls of text.</li>
          <li>You can optionally record a voice response per question. Both are fine — pick whichever helps you think.</li>
          <li>You can move between sections. We autosave as you type.</li>
        </ul>
      </div>

      <div className="encore-card p-7" data-testid="honor-code-card">
        <p className="encore-overline mb-2">Honor code</p>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={honorChecked}
            onChange={(e) => setHonorChecked(e.target.checked)}
            data-testid="honor-checkbox"
            className="mt-1 h-4 w-4 accent-[#1A2E35]"
          />
          <span className="text-sm text-ink">
            I&rsquo;ll do this myself. I won&rsquo;t paste the questions into an AI assistant or have someone else answer for me. I understand the goal is to see <em>my</em> thinking.
          </span>
        </label>
      </div>

      <button
        type="button"
        onClick={onBegin}
        data-testid="take-begin-button"
        disabled={!honorChecked}
        className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover disabled:opacity-40 text-white rounded-lg px-6 py-3 transition-all hover:-translate-y-0.5 shadow-sm"
      >
        <span className="font-medium">Begin</span>
        <ArrowRight size={18} />
      </button>
    </motion.div>
  );
}

// ---------- Sections stage ----------
function SectionsStage({ token, section, sectionIdx, total, scenario, answers, setAnswers, audio, setAudio, onPrev, onNext, onSubmit, isLast }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.35 }}
      className="space-y-8"
      data-testid={`take-section-${section.id}`}
    >
      {sectionIdx === 0 && (
        <details className="encore-card p-6 group" open>
          <summary className="cursor-pointer list-none flex items-center justify-between">
            <span className="encore-overline">Scenario</span>
            <span className="text-xs text-ink-soft group-open:hidden">Tap to expand</span>
            <span className="text-xs text-ink-soft hidden group-open:inline">Tap to collapse</span>
          </summary>
          <p className="text-ink whitespace-pre-wrap leading-relaxed mt-3" data-testid="take-scenario">{scenario}</p>
        </details>
      )}

      <div>
        <p className="encore-overline mb-2">Section {sectionIdx + 1} of {total}</p>
        <h2 className="font-display text-3xl font-black tracking-tighter">{section.title}</h2>
        <p className="text-ink-soft mt-2">{section.intro}</p>
      </div>

      <div className="space-y-6">
        {section.questions.map((q, qIdx) => {
          const key = `${section.id}::${qIdx}`;
          return (
            <QuestionCard
              key={key}
              token={token}
              question={q}
              qIdx={qIdx}
              sectionId={section.id}
              answer={answers[key] || ""}
              setAnswer={(val) => setAnswers((a) => ({ ...a, [key]: val }))}
              audio={audio[key]}
              onAudioUploaded={(rec) => setAudio((m) => ({ ...m, [key]: rec }))}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-6 border-t border-black/[0.06]">
        <button
          type="button"
          onClick={onPrev}
          disabled={sectionIdx === 0}
          data-testid="take-prev-section"
          className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink disabled:opacity-30"
        >
          <ArrowLeft size={14} /> Previous
        </button>

        {isLast ? (
          <button
            type="button"
            onClick={onSubmit}
            data-testid="take-submit-button"
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white rounded-lg px-5 py-2.5 transition-all hover:-translate-y-0.5"
          >
            <CheckCircle weight="bold" size={14} />
            <span className="font-medium text-sm">Submit my work</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            data-testid="take-next-section"
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white rounded-lg px-5 py-2.5 transition-all hover:-translate-y-0.5"
          >
            <span className="font-medium text-sm">Next section</span>
            <ArrowRight size={14} />
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ---------- Question card with text + voice ----------
function QuestionCard({ token, question, qIdx, sectionId, answer, setAnswer, audio, onAudioUploaded }) {
  const { recording, elapsed, error, start, stop } = useVoiceRecorder();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const startRec = async () => {
    try { await start(); } catch (e) { toast.error(error || e?.message || "Could not start recording"); }
  };
  const stopRec = async () => {
    const blob = await stop();
    if (!blob) return;
    setUploading(true);
    setProgress(0);
    try {
      const rec = await uploadAudio(token, sectionId, qIdx, blob, setProgress);
      onAudioUploaded({
        storage_path: rec.storage_path,
        content_type: "audio/webm",
        size: rec.size,
        uploaded_at: new Date().toISOString(),
      });
      toast.success("Voice answer saved");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed — your text answer is still saved.");
    } finally {
      setUploading(false);
    }
  };

  const key = `${sectionId}::${qIdx}`;

  return (
    <div className="encore-card p-6" data-testid={`question-${sectionId}-${qIdx}`}>
      <p className="encore-overline mb-2">Question {qIdx + 1}</p>
      <p className="text-ink leading-relaxed mb-4">{question}</p>

      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={5}
        placeholder="Think out loud. Bullet points are fine."
        data-testid={`answer-input-${sectionId}-${qIdx}`}
        className="w-full bg-canvas border border-black/15 rounded-lg px-4 py-3 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all resize-y"
      />

      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {!recording ? (
            <button
              type="button"
              onClick={startRec}
              disabled={uploading}
              data-testid={`record-start-${sectionId}-${qIdx}`}
              className="inline-flex items-center gap-2 border border-black/15 hover:border-black/30 hover:bg-black/[0.02] rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              <Microphone size={14} />
              {audio ? "Re-record voice" : "Record voice answer"}
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRec}
              data-testid={`record-stop-${sectionId}-${qIdx}`}
              className="inline-flex items-center gap-2 bg-signal-error text-white rounded-lg px-3 py-1.5 text-sm font-medium animate-pulse"
            >
              <Stop weight="fill" size={12} />
              Stop · {fmtMmSs(elapsed)}
            </button>
          )}
          {uploading && (
            <span className="text-xs text-ink-soft" data-testid={`upload-progress-${sectionId}-${qIdx}`}>
              Uploading {progress}%
            </span>
          )}
        </div>

        {audio && !recording && !uploading && (
          <div className="flex items-center gap-2" data-testid={`audio-saved-${sectionId}-${qIdx}`}>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-moss">
              <CheckCircle weight="fill" size={12} /> Voice saved
            </span>
            <audio
              controls
              src={publicAudioUrl(token, sectionId, qIdx) + `?k=${encodeURIComponent(audio.storage_path)}`}
              preload="none"
              className="h-7"
            />
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-signal-error inline-flex items-center gap-1"><Warning size={12} /> {error}</p>
      )}
    </div>
  );
}

// ---------- Done screen ----------
function DoneScreen({ view }) {
  return (
    <motion.div
      key="done"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="max-w-xl mx-auto text-center py-16"
      data-testid="take-done"
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.15, type: "spring", stiffness: 240, damping: 18 }}
        className="mx-auto h-20 w-20 rounded-full bg-brand-moss/10 text-brand-moss flex items-center justify-center mb-6"
      >
        <CheckCircle weight="duotone" size={44} />
      </motion.div>
      <h1 className="font-display text-4xl font-black tracking-tighter leading-[1.05] mb-3">You&rsquo;re done — nicely handled.</h1>
      <p className="text-ink-soft">Thanks{view.candidate_name ? `, ${view.candidate_name}` : ""}. Your work was submitted and is now with the hiring team.</p>
      <p className="text-xs text-ink-soft mt-6 opacity-70">You can close this tab.</p>
    </motion.div>
  );
}

// ---------- Generic messages ----------
function FullPageMessage({ children, tone = "neutral" }) {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-6">
      <div className={`encore-card p-10 max-w-md text-center ${tone === "error" ? "border-signal-error/30" : ""}`}>
        {tone === "error" && <Warning weight="duotone" size={28} className="mx-auto text-signal-error mb-3" />}
        <p className="text-ink">{children}</p>
      </div>
    </div>
  );
}
