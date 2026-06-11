// KebabMenu.jsx — small reusable dropdown menu triggered by a 3-dots button.
// Used by RolesList, RoleDetail and CaseDetail for Edit / Archive / Unarchive actions.
// Closes on outside-click, Escape, or after an item is chosen.

import { useEffect, useRef, useState } from "react";
import { DotsThreeVertical } from "@phosphor-icons/react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

export default function KebabMenu({ items = [], testid = "kebab", buttonClassName = "" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        data-testid={`${testid}-trigger`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center justify-center h-8 w-8 rounded-md border border-black/10 hover:border-black/30 hover:bg-black/[0.03] text-ink-soft transition-colors ${buttonClassName}`}
      >
        <DotsThreeVertical weight="bold" size={16} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            data-testid={`${testid}-menu`}
            initial={reduceMotion ? false : { opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full mt-1.5 min-w-[180px] bg-white border border-black/10 rounded-lg shadow-lg overflow-hidden z-30"
          >
            {items.map((it, i) => {
              const Icon = it.icon;
              return (
                <button
                  key={it.label + i}
                  type="button"
                  disabled={it.disabled}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(false);
                    it.onClick?.();
                  }}
                  data-testid={it.testid || `${testid}-item-${i}`}
                  role="menuitem"
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-black/[0.03] disabled:opacity-40 disabled:hover:bg-transparent ${
                    it.danger ? "text-signal-error hover:bg-signal-error/5" : "text-ink"
                  }`}
                >
                  {Icon && <Icon size={14} weight={it.danger ? "bold" : "regular"} />}
                  <span className="flex-1">{it.label}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
