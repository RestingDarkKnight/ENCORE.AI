// PageTransition.jsx — subtle fade+rise on route change (150-200ms).
// Wraps each authenticated page; respects prefers-reduced-motion.

import { motion, useReducedMotion } from "framer-motion";

export default function PageTransition({ children, className = "" }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
