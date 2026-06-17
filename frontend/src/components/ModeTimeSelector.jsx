// ModeTimeSelector.jsx — Phase H Slice 2+. Three assessment-mode tabs.
// Clicking a tab darkens it and expands inward to expose 3 suggested time
// pills + a small custom-minute input. Once a time is picked, the dark tab
// summarises as "Screening · 45 min" with a small pencil to change. Switching
// modes resets the time.

import { useState } from "react";
import { Pencil } from "@phosphor-icons/react";

const MODES = [
  {
    key: "screening",
    label: "Screening",
    blurb: "High-volume first cut. Fast, gaming-resistant, comparable across many candidates.",
    presets: [30, 45, 60],
  },
  {
    key: "takehome",
    label: "Take-home",
    blurb: "Mid-funnel async work. Mix of objective + reasoning + open questions.",
    presets: [90, 120, 180],
  },
  {
    key: "interview",
    label: "Interview",
    blurb: "Late-funnel open scenario for back-and-forth conversation; voice-recordable.",
    presets: [30, 45, 60],
  },
];

export default function ModeTimeSelector({
  mode,
  setMode,
  minutes,
  setMinutes,
  requireReasoning,
  setRequireReasoning,
  disabled,
}) {
  const [editingTime, setEditingTime] = useState(false);

  const handleSelectMode = (key) => {
    if (mode !== key) {
      setMode(key);
      setMinutes(null); // reset time when switching modes
      setEditingTime(true);
    } else if (minutes && !editingTime) {
      // Re-open time picker on second click of an already-selected mode
      setEditingTime(true);
    }
  };

  return (
    <div className="mb-5" data-testid="mode-time-selector">
      <p className="encore-overline mb-2">Pick the stage of the funnel</p>
      <div className="grid sm:grid-cols-3 gap-2.5">
        {MODES.map((opt) => {
          const active = mode === opt.key;
          const showPicker = active && (editingTime || !minutes);
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => handleSelectMode(opt.key)}
              disabled={disabled}
              data-testid={`mode-option-${opt.key}`}
              data-state={active ? "active" : "inactive"}
              className={`text-left rounded-xl border px-4 py-3.5 transition-all align-top ${
                active
                  ? "border-ink bg-ink text-canvas shadow-[0_8px_30px_-12px_rgba(0,0,0,0.4)]"
                  : "border-black/10 bg-white hover:border-black/25 hover:bg-black/[0.02]"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`text-sm font-semibold ${active ? "text-canvas" : "text-ink"}`}>{opt.label}</span>
                {active && minutes && !editingTime && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setEditingTime(true); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setEditingTime(true); } }}
                    data-testid={`mode-time-edit-${opt.key}`}
                    className="inline-flex items-center gap-1 text-[10px] text-canvas/80 hover:text-canvas cursor-pointer"
                    title="Change time"
                  >
                    <Pencil size={11} weight="bold" />
                  </span>
                )}
              </div>

              {!active && (
                <p className="text-[11px] text-ink-soft leading-snug">{opt.blurb}</p>
              )}

              {active && minutes && !editingTime && (
                <p
                  data-testid={`mode-time-summary-${opt.key}`}
                  className="text-[11px] text-canvas/80 tabular-nums leading-snug"
                >
                  {minutes} min &middot; <span className="text-canvas/60">tap pencil to change</span>
                </p>
              )}

              {showPicker && (
                <TimePicker
                  presets={opt.presets}
                  value={minutes}
                  onPick={(m) => { setMinutes(m); setEditingTime(false); }}
                  testidPrefix={`mode-time-${opt.key}`}
                />
              )}
            </button>
          );
        })}
      </div>

      <label
        className={`mt-3.5 inline-flex items-start gap-2 text-xs ${disabled ? "opacity-50" : "cursor-pointer"}`}
        data-testid="require-reasoning-row"
      >
        <input
          type="checkbox"
          checked={requireReasoning}
          onChange={(e) => setRequireReasoning(e.target.checked)}
          disabled={disabled}
          data-testid="require-reasoning-toggle"
          className="mt-0.5 h-3.5 w-3.5 rounded border-black/20 text-brand focus:ring-brand/20"
        />
        <span className="text-ink-soft leading-snug">
          <strong className="text-ink">Require reasoning on objective questions.</strong> Every MCQ / fill-blank / match item gets a short
          &ldquo;Why? (1&ndash;2 sentences)&rdquo; follow-up so we capture judgement, not lucky guesses.
        </span>
      </label>
    </div>
  );
}

function TimePicker({ presets, value, onPick, testidPrefix }) {
  const [custom, setCustom] = useState("");
  const submitCustom = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const n = parseInt(custom, 10);
    if (Number.isFinite(n) && n >= 5 && n <= 480) onPick(n);
  };
  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()} data-testid={`${testidPrefix}-picker`}>
      <p className="text-[10px] uppercase tracking-wider text-canvas/55 mb-1.5">Suggested durations</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((m) => (
          <span
            key={m}
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onPick(m); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onPick(m); } }}
            data-testid={`${testidPrefix}-preset-${m}`}
            className={`text-[11px] font-semibold tabular-nums rounded-full px-2.5 py-1 border cursor-pointer transition-colors ${
              value === m
                ? "border-canvas bg-canvas text-ink"
                : "border-canvas/30 bg-canvas/[0.06] text-canvas/85 hover:bg-canvas/[0.12]"
            }`}
          >
            {m}m
          </span>
        ))}
        <form onSubmit={submitCustom} className="inline-flex items-center gap-1">
          <input
            type="number"
            inputMode="numeric"
            min={5}
            max={480}
            value={custom}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="custom"
            data-testid={`${testidPrefix}-custom-input`}
            className="w-16 text-[11px] tabular-nums bg-canvas/[0.06] border border-canvas/25 text-canvas placeholder:text-canvas/45 rounded-full px-2 py-1 focus:ring-2 focus:ring-canvas/30 focus:border-canvas/60 outline-none"
          />
          <span
            role="button"
            tabIndex={0}
            onClick={submitCustom}
            onKeyDown={(e) => { if (e.key === "Enter") submitCustom(e); }}
            data-testid={`${testidPrefix}-custom-set`}
            className="text-[10px] font-semibold text-canvas/85 hover:text-canvas cursor-pointer px-1"
          >
            set
          </span>
        </form>
      </div>
    </div>
  );
}
