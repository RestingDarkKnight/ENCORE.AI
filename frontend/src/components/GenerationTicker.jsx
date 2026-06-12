// GenerationTicker.jsx — shows a calmer staged status while POST /cases/generate runs.
// Ticks through 3 short lines (Understanding the role → Designing the scenario → Writing the rubric)
// plus a slim shimmer bar. Purely client-side; not tied to real backend progress.
// Respects prefers-reduced-motion (no animations, just static text).

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const LINES = [
  "Understanding the role\u2026",
  "Designing the scenario\u2026",
  "Writing the rubric\u2026",
];

export default function GenerationTicker({ active }) {
  const [idx, setIdx] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!active) {
      setIdx(0);
      return undefined;
    }
    let i = 0;
    setIdx(0);
    const t = setInterval(() => {
      i = Math.min(LINES.length - 1, i + 1);
      setIdx(i);
    }, 6500);
    return () => clearInterval(t);
  }, [active]);

  if (!active) return null;

  return (
    <div className="mt-5 rounded-lg border border-brand-sand/25 bg-brand-sand/[0.05] p-4 overflow-hidden relative" data-testid="generation-ticker">
      <div className="flex items-start gap-3">
        <div className="h-7 w-7 rounded-md bg-brand-sand/15 text-brand-sand flex items-center justify-center shrink-0 mt-0.5">
          <motion.span
            animate={reduce ? {} : { rotate: [0, 360] }}
            transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
            className="block h-3 w-3 rounded-full border-2 border-brand-sand border-t-transparent"
            aria-hidden
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="encore-overline-sand mb-1.5">ENCORE is designing your case</p>
          <ul className="space-y-1.5">
            {LINES.map((ln, i) => {
              const state = i < idx ? "done" : i === idx ? "active" : "pending";
              return (
                <li
                  key={ln}
                  data-testid={`generation-ticker-line-${i}`}
                  data-state={state}
                  className={`flex items-center gap-2 text-sm transition-colors ${
                    state === "done"
                      ? "text-ink/60"
                      : state === "active"
                      ? "text-ink"
                      : "text-ink-soft/55"
                  }`}
                >
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                      state === "done"
                        ? "bg-brand-moss"
                        : state === "active"
                        ? "bg-brand-sand"
                        : "bg-black/15"
                    }`}
                  />
                  <span className={state === "active" ? "font-medium" : ""}>{ln}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {/* Slim shimmer bar */}
      <div className="mt-3 h-[2px] bg-black/[0.05] rounded-full overflow-hidden">
        <motion.div
          className="h-full w-1/3 bg-gradient-to-r from-transparent via-brand-sand to-transparent"
          animate={reduce ? {} : { x: ["-100%", "300%"] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}
