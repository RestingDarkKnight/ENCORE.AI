// useBadgeNotifier.js — fires a refined toast when a milestone is newly earned.
// Tracks last-seen badge IDs in localStorage, keyed per manager id, so toasts fire once.

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Sparkle, Trophy } from "@phosphor-icons/react";
import React from "react";

function storageKey(managerId) {
  return `encore.badges.seen.${managerId || "anon"}`;
}

function readSeen(managerId) {
  try {
    const raw = localStorage.getItem(storageKey(managerId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeSeen(managerId, set) {
  try {
    localStorage.setItem(storageKey(managerId), JSON.stringify([...set]));
  } catch {
    /* noop */
  }
}

export default function useBadgeNotifier(badges, managerId) {
  // We never want to fire the same id twice in a single SPA session
  const firedRef = useRef(new Set());

  useEffect(() => {
    if (!badges || !managerId) return;
    const seen = readSeen(managerId);
    const newlyEarned = badges.filter(
      (b) => b.earned && !seen.has(b.id) && !firedRef.current.has(b.id),
    );
    if (newlyEarned.length === 0) return;

    // First visit on this device: seed seen-set with all currently-earned and DO NOT toast.
    // Only toast on subsequent visits where strictly new badges appear.
    if (seen.size === 0) {
      const allEarned = badges.filter((b) => b.earned).map((b) => b.id);
      writeSeen(managerId, new Set(allEarned));
      return;
    }

    newlyEarned.forEach((b, idx) => {
      firedRef.current.add(b.id);
      seen.add(b.id);
      setTimeout(() => {
        toast.custom(
          (t) => (
            React.createElement(
              "div",
              {
                "data-testid": `badge-earned-toast-${b.id}`,
                className:
                  "flex items-start gap-3 bg-white border border-brand-moss/30 rounded-xl shadow-lift px-4 py-3 w-[320px]",
              },
              React.createElement(
                "div",
                { className: "shrink-0 mt-0.5 h-8 w-8 rounded-md bg-brand-moss/10 text-brand-moss flex items-center justify-center" },
                React.createElement(Trophy, { weight: "duotone", size: 18 }),
              ),
              React.createElement(
                "div",
                { className: "min-w-0" },
                React.createElement(
                  "p",
                  { className: "encore-overline-sand mb-0.5 inline-flex items-center gap-1" },
                  React.createElement(Sparkle, { weight: "fill", size: 9 }),
                  "Milestone earned",
                ),
                React.createElement(
                  "p",
                  { className: "font-display font-bold tracking-tight text-ink" },
                  b.label,
                ),
                React.createElement(
                  "p",
                  { className: "text-xs text-ink-soft mt-0.5" },
                  b.description,
                ),
              ),
            )
          ),
          { duration: 5200, id: `badge-${b.id}` },
        );
      }, 400 + idx * 600);
    });

    writeSeen(managerId, seen);
  }, [badges, managerId]);
}
