// QuestionEditor.jsx — Phase H Slice 3.
// Inline editor for a single typed question on the manager's case-detail page.
// Renders the prompt + type pill + type-specific answer-key fields (options,
// acceptable answers, numerical, pairs). When the case has require_reasoning
// set AND the question type is objective, also exposes a reasoning_key textarea
// (the manager's ideal "Why?" answer).

import { useState } from "react";
import { Trash, Plus, CaretDown } from "@phosphor-icons/react";

const TYPES = [
  { key: "mcq", label: "Single-choice" },
  { key: "multiple_correct", label: "Multi-select" },
  { key: "fill_blank", label: "Fill blank" },
  { key: "match", label: "Match" },
  { key: "short_answer", label: "Short answer" },
  { key: "open", label: "Open" },
];

const OBJECTIVE = new Set(["mcq", "multiple_correct", "fill_blank", "match", "short_answer"]);

const newOption = (text = "") => ({
  id: `opt-${Math.random().toString(36).slice(2, 9)}`,
  text,
});

export default function QuestionEditor({ question, requireReasoning, locked, onChange, onRemove, testidPrefix }) {
  const q = question;
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);

  const patch = (updates) => onChange({ ...q, ...updates });

  const changeType = (newType) => {
    setTypeMenuOpen(false);
    // Reset type-specific fields when switching to avoid stale answer keys
    const reset = {
      type: newType,
      options: ["mcq", "multiple_correct"].includes(newType) ? q.options.length ? q.options : [newOption("Option A"), newOption("Option B")] : [],
      correct_option_ids: [],
      acceptable_answers: ["fill_blank", "short_answer"].includes(newType) ? q.acceptable_answers || [] : [],
      numerical_answer: null,
      numerical_tolerance: 0,
      pairs: newType === "match" ? (q.pairs?.length ? q.pairs : [{ left: "Item A", right: "1" }, { left: "Item B", right: "2" }]) : [],
    };
    patch(reset);
  };

  const typeMeta = TYPES.find((t) => t.key === q.type) || TYPES[5];
  const isObjective = OBJECTIVE.has(q.type);

  return (
    <div className="border border-black/[0.08] rounded-lg p-4 bg-white/40" data-testid={testidPrefix}>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="relative">
          <button
            type="button"
            onClick={() => !locked && setTypeMenuOpen((v) => !v)}
            disabled={locked}
            data-testid={`${testidPrefix}-type-button`}
            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider border border-brand/30 bg-brand/[0.05] text-brand rounded-full px-2.5 py-1 hover:bg-brand/10 disabled:opacity-60"
          >
            {typeMeta.label} <CaretDown size={10} />
          </button>
          {typeMenuOpen && (
            <div className="absolute z-10 mt-1 bg-white border border-black/10 rounded-lg shadow-md py-1 min-w-[160px]" data-testid={`${testidPrefix}-type-menu`}>
              {TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => changeType(t.key)}
                  data-testid={`${testidPrefix}-type-set-${t.key}`}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-black/[0.04] ${q.type === t.key ? "font-semibold text-brand" : "text-ink"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {!locked && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            data-testid={`${testidPrefix}-remove`}
            className="text-[11px] text-signal-error hover:text-signal-error/80 inline-flex items-center gap-1"
            title="Remove question"
          >
            <Trash size={11} /> Remove
          </button>
        )}
      </div>

      <Field label="Prompt">
        {locked ? (
          <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{q.prompt}</p>
        ) : (
          <textarea
            value={q.prompt}
            onChange={(e) => patch({ prompt: e.target.value })}
            rows={2}
            data-testid={`${testidPrefix}-prompt`}
            className="w-full text-sm bg-transparent border border-black/15 rounded-md px-2.5 py-1.5 focus:ring-2 focus:ring-brand/20 outline-none resize-y"
          />
        )}
      </Field>

      {/* Type-specific fields */}
      {(q.type === "mcq" || q.type === "multiple_correct") && (
        <OptionsEditor q={q} patch={patch} locked={locked} testidPrefix={testidPrefix} />
      )}

      {(q.type === "fill_blank" || q.type === "short_answer") && (
        <KeyphrasesEditor q={q} patch={patch} locked={locked} testidPrefix={testidPrefix} />
      )}

      {(q.type === "fill_blank" || q.type === "short_answer") && (
        <NumericalEditor q={q} patch={patch} locked={locked} testidPrefix={testidPrefix} />
      )}

      {q.type === "match" && (
        <PairsEditor q={q} patch={patch} locked={locked} testidPrefix={testidPrefix} />
      )}

      {/* Reasoning key */}
      {requireReasoning && isObjective && (
        <Field label='Ideal "Why?" answer (used as grading reference)'>
          {locked ? (
            <p className="text-xs text-ink-soft whitespace-pre-wrap">{q.reasoning_key || "—"}</p>
          ) : (
            <textarea
              value={q.reasoning_key || ""}
              onChange={(e) => patch({ reasoning_key: e.target.value })}
              rows={2}
              placeholder="A strong candidate would justify their pick by referencing…"
              data-testid={`${testidPrefix}-reasoning-key`}
              className="w-full text-xs bg-brand-sand/[0.04] border border-brand-sand/30 rounded-md px-2.5 py-1.5 focus:ring-2 focus:ring-brand-sand/20 outline-none resize-y"
            />
          )}
        </Field>
      )}

      {q.type === "open" && (
        <p className="text-[11px] text-ink-soft italic mt-2">
          Open question — no auto-grading. Evaluator scores against the rubric.
        </p>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <p className="text-[10px] uppercase tracking-wider text-ink-soft mb-1">{label}</p>
      {children}
    </div>
  );
}

/* -------- options for mcq / multiple_correct -------- */
function OptionsEditor({ q, patch, locked, testidPrefix }) {
  const isMulti = q.type === "multiple_correct";
  const correctSet = new Set(q.correct_option_ids || []);

  const toggleCorrect = (id) => {
    if (locked) return;
    if (isMulti) {
      const next = correctSet.has(id) ? [...correctSet].filter((x) => x !== id) : [...correctSet, id];
      patch({ correct_option_ids: next });
    } else {
      patch({ correct_option_ids: correctSet.has(id) ? [] : [id] });
    }
  };

  const updateOption = (id, text) => {
    patch({ options: q.options.map((o) => (o.id === id ? { ...o, text } : o)) });
  };

  const removeOption = (id) => {
    patch({
      options: q.options.filter((o) => o.id !== id),
      correct_option_ids: (q.correct_option_ids || []).filter((x) => x !== id),
    });
  };

  const addOption = () => {
    patch({ options: [...q.options, { id: `opt-${Math.random().toString(36).slice(2, 9)}`, text: "" }] });
  };

  return (
    <Field label={`Options (tick the ${isMulti ? "correct ones" : "single correct one"})`}>
      <ul className="space-y-1.5">
        {(q.options || []).map((opt, i) => (
          <li key={opt.id} className="flex items-center gap-2" data-testid={`${testidPrefix}-opt-${i}`}>
            <input
              type={isMulti ? "checkbox" : "radio"}
              checked={correctSet.has(opt.id)}
              onChange={() => toggleCorrect(opt.id)}
              disabled={locked}
              data-testid={`${testidPrefix}-opt-${i}-correct`}
              className="h-3.5 w-3.5 text-brand focus:ring-brand/20 shrink-0"
            />
            {locked ? (
              <span className="text-sm">{opt.text}</span>
            ) : (
              <input
                type="text"
                value={opt.text}
                onChange={(e) => updateOption(opt.id, e.target.value)}
                placeholder={`Option ${i + 1}`}
                data-testid={`${testidPrefix}-opt-${i}-text`}
                className="flex-1 text-sm bg-transparent border border-black/12 rounded-md px-2.5 py-1 focus:ring-2 focus:ring-brand/20 outline-none"
              />
            )}
            {!locked && (
              <button type="button" onClick={() => removeOption(opt.id)} data-testid={`${testidPrefix}-opt-${i}-remove`} className="text-signal-error/80 hover:text-signal-error">
                <Trash size={12} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!locked && (
        <button
          type="button"
          onClick={addOption}
          data-testid={`${testidPrefix}-opt-add`}
          className="mt-2 inline-flex items-center gap-1 text-[11px] text-brand hover:text-brand-hover border border-dashed border-brand/30 rounded-md px-2.5 py-1"
        >
          <Plus size={10} /> Add option
        </button>
      )}
    </Field>
  );
}

/* -------- keyphrases for fill_blank / short_answer -------- */
function KeyphrasesEditor({ q, patch, locked, testidPrefix }) {
  const items = q.acceptable_answers || [];
  const update = (i, val) => patch({ acceptable_answers: items.map((x, j) => (j === i ? val : x)) });
  const remove = (i) => patch({ acceptable_answers: items.filter((_, j) => j !== i) });
  const add = () => patch({ acceptable_answers: [...items, ""] });

  return (
    <Field label={q.type === "fill_blank" ? "Accepted answers (case-insensitive, any match scores)" : "Accepted keyphrases (any match scores; otherwise flagged for manual review)"}>
      <ul className="space-y-1.5">
        {items.map((s, i) => (
          <li key={i} className="flex items-center gap-2" data-testid={`${testidPrefix}-kp-${i}`}>
            {locked ? (
              <span className="text-sm">{s}</span>
            ) : (
              <input
                type="text"
                value={s}
                onChange={(e) => update(i, e.target.value)}
                placeholder={q.type === "short_answer" ? "e.g. consistency" : "e.g. TCP/IP"}
                data-testid={`${testidPrefix}-kp-${i}-text`}
                className="flex-1 text-sm bg-transparent border border-black/12 rounded-md px-2.5 py-1 focus:ring-2 focus:ring-brand/20 outline-none"
              />
            )}
            {!locked && (
              <button type="button" onClick={() => remove(i)} data-testid={`${testidPrefix}-kp-${i}-remove`} className="text-signal-error/80 hover:text-signal-error">
                <Trash size={12} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!locked && (
        <button type="button" onClick={add} data-testid={`${testidPrefix}-kp-add`} className="mt-2 inline-flex items-center gap-1 text-[11px] text-brand hover:text-brand-hover border border-dashed border-brand/30 rounded-md px-2.5 py-1">
          <Plus size={10} /> Add accepted answer
        </button>
      )}
    </Field>
  );
}

/* -------- numerical key for fill_blank / short_answer -------- */
function NumericalEditor({ q, patch, locked, testidPrefix }) {
  const hasNum = q.numerical_answer !== null && q.numerical_answer !== undefined && !Number.isNaN(q.numerical_answer);
  return (
    <Field label="Numerical answer (optional — overrides text matching)">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="number"
          step="any"
          value={hasNum ? q.numerical_answer : ""}
          onChange={(e) => patch({ numerical_answer: e.target.value === "" ? null : Number(e.target.value) })}
          placeholder="value"
          disabled={locked}
          data-testid={`${testidPrefix}-numerical-answer`}
          className="w-28 text-sm bg-transparent border border-black/12 rounded-md px-2.5 py-1 tabular-nums focus:ring-2 focus:ring-brand/20 outline-none"
        />
        <span className="text-[11px] text-ink-soft">± tol</span>
        <input
          type="number"
          step="any"
          value={q.numerical_tolerance ?? 0}
          onChange={(e) => patch({ numerical_tolerance: Number(e.target.value) || 0 })}
          placeholder="0"
          disabled={locked}
          data-testid={`${testidPrefix}-numerical-tolerance`}
          className="w-20 text-sm bg-transparent border border-black/12 rounded-md px-2.5 py-1 tabular-nums focus:ring-2 focus:ring-brand/20 outline-none"
        />
      </div>
    </Field>
  );
}

/* -------- pairs for match -------- */
function PairsEditor({ q, patch, locked, testidPrefix }) {
  const update = (i, side, val) => patch({ pairs: q.pairs.map((p, j) => (j === i ? { ...p, [side]: val } : p)) });
  const remove = (i) => patch({ pairs: q.pairs.filter((_, j) => j !== i) });
  const add = () => patch({ pairs: [...(q.pairs || []), { left: "", right: "" }] });

  return (
    <Field label="Pairs (left → right). Candidate sees lefts; right pool is shuffled.">
      <ul className="space-y-1.5">
        {(q.pairs || []).map((p, i) => (
          <li key={i} className="flex items-center gap-2" data-testid={`${testidPrefix}-pair-${i}`}>
            {locked ? (
              <span className="text-sm"><strong>{p.left}</strong> → {p.right}</span>
            ) : (
              <>
                <input
                  type="text"
                  value={p.left}
                  onChange={(e) => update(i, "left", e.target.value)}
                  placeholder="left"
                  data-testid={`${testidPrefix}-pair-${i}-left`}
                  className="flex-1 text-sm bg-transparent border border-black/12 rounded-md px-2.5 py-1 focus:ring-2 focus:ring-brand/20 outline-none"
                />
                <span className="text-[11px] text-ink-soft">→</span>
                <input
                  type="text"
                  value={p.right}
                  onChange={(e) => update(i, "right", e.target.value)}
                  placeholder="right"
                  data-testid={`${testidPrefix}-pair-${i}-right`}
                  className="flex-1 text-sm bg-transparent border border-black/12 rounded-md px-2.5 py-1 focus:ring-2 focus:ring-brand/20 outline-none"
                />
                <button type="button" onClick={() => remove(i)} data-testid={`${testidPrefix}-pair-${i}-remove`} className="text-signal-error/80 hover:text-signal-error">
                  <Trash size={12} />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {!locked && (
        <button type="button" onClick={add} data-testid={`${testidPrefix}-pair-add`} className="mt-2 inline-flex items-center gap-1 text-[11px] text-brand hover:text-brand-hover border border-dashed border-brand/30 rounded-md px-2.5 py-1">
          <Plus size={10} /> Add pair
        </button>
      )}
    </Field>
  );
}
