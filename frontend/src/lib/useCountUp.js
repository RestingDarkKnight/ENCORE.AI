// useCountUp.js — animates an integer from 0 to a target on mount.
// Honors prefers-reduced-motion (returns the final value immediately).

import { useEffect, useState } from "react";

export default function useCountUp(target, { duration = 900, startDelay = 0 } = {}) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (typeof target !== "number" || target <= 0) {
      setValue(target || 0);
      return undefined;
    }
    const reduce = typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setValue(target);
      return undefined;
    }
    let raf;
    let start;
    const tick = (t) => {
      if (!start) start = t;
      const elapsed = t - start - startDelay;
      if (elapsed < 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const p = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => raf && cancelAnimationFrame(raf);
  }, [target, duration, startDelay]);

  return value;
}
