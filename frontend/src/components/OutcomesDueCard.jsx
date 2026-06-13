// OutcomesDueCard.jsx — Dashboard widget that lists hires whose 30/90-day check-in is overdue.
// One click opens an inline 3-field form (1-5 rating, would-hire-again, optional comment).

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import { toast } from "sonner";
import { Calendar, Star, Check, X } from "@phosphor-icons/react";

export default function OutcomesDueCard() {
  const [due, setDue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openForId, setOpenForId] = useState(null);

  const refresh = async () => {
    try {
      const { data } = await api.get("/outcomes/due");
      setDue(data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  if (loading || due.length === 0) return null;

  return (
    <section data-testid="outcomes-due-card" className="encore-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="encore-overline-sand mb-1 inline-flex items-center gap-1.5">
            <Calendar weight="duotone" size={11} /> Outcome check-ins due
          </p>
          <h2 className="font-display text-display-3 font-bold">How are your hires doing?</h2>
        </div>
        <span className="text-xs text-ink-soft tabular-nums">{due.length} pending</span>
      </div>
      <div className="space-y-2">
        {due.map((d) => (
          <div key={`${d.assignment_id}-${d.window}`} className="border border-black/[0.06] rounded-lg overflow-hidden" data-testid={`outcomes-due-row-${d.assignment_id}-${d.window}`}>
            <div className="flex items-center gap-4 p-3">
              <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 ${d.window === "30d" ? "border-brand-sand/40 text-brand-sand" : "border-brand-moss/40 text-brand-moss"}`}>
                {d.window === "30d" ? "30-day" : "90-day"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-ink text-sm truncate">{d.candidate_name || d.candidate_email}</p>
                <p className="text-xs text-ink-soft truncate">{d.case_title} &middot; {d.role_title}</p>
              </div>
              <span className="text-[11px] text-ink-soft tabular-nums">{d.days_since_decision}d ago</span>
              {openForId !== `${d.assignment_id}-${d.window}` && (
                <button
                  type="button"
                  onClick={() => setOpenForId(`${d.assignment_id}-${d.window}`)}
                  data-testid={`outcomes-due-record-${d.assignment_id}-${d.window}`}
                  className="btn-quiet text-xs px-2.5 py-1"
                >
                  Record
                </button>
              )}
            </div>
            <AnimatePresence>
              {openForId === `${d.assignment_id}-${d.window}` && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden border-t border-black/[0.05] bg-canvas/40"
                >
                  <OutcomeForm
                    assignmentId={d.assignment_id}
                    window={d.window}
                    onSaved={() => { setOpenForId(null); refresh(); }}
                    onCancel={() => setOpenForId(null)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </section>
  );
}

export function OutcomeForm({ assignmentId, window: w, onSaved, onCancel, defaultPerforming = 4 }) {
  const [performing, setPerforming] = useState(defaultPerforming);
  const [wouldHire, setWouldHire] = useState(true);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.post("/outcomes", {
        assignment_id: assignmentId,
        window: w,
        performing,
        would_hire_again: wouldHire,
        comment: comment.trim() || null,
      });
      toast.success("Outcome saved.");
      onSaved?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn\u2019t save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 space-y-3" data-testid="outcome-form">
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-soft w-24">Performing</span>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPerforming(n)}
              data-testid={`outcome-perf-${n}`}
              aria-label={`${n} of 5`}
              className="p-0.5"
            >
              <Star weight={n <= performing ? "fill" : "regular"} size={18} className={n <= performing ? "text-brand-sand" : "text-ink-muted"} />
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-soft w-24">Would hire again?</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setWouldHire(true)}
            data-testid="outcome-wha-yes"
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium border transition-colors ${wouldHire ? "bg-brand-moss text-white border-brand-moss" : "border-black/15 text-ink-soft hover:text-ink"}`}
          >
            <Check size={11} /> Yes
          </button>
          <button
            type="button"
            onClick={() => setWouldHire(false)}
            data-testid="outcome-wha-no"
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium border transition-colors ${!wouldHire ? "bg-signal-error text-white border-signal-error" : "border-black/15 text-ink-soft hover:text-ink"}`}
          >
            <X size={11} /> No
          </button>
        </div>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        placeholder="Optional &mdash; a sentence about how it&rsquo;s going."
        data-testid="outcome-comment"
        className="w-full bg-white border border-black/10 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-brand/20 outline-none resize-none"
      />
      <div className="flex items-center justify-end gap-2 pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-xs text-ink-soft hover:text-ink px-2 py-1">
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={busy}
          data-testid="outcome-save"
          className="btn-primary text-xs px-3 py-1.5"
        >
          {busy ? "Saving\u2026" : "Save outcome"}
        </button>
      </div>
    </div>
  );
}
