/**
 * MOTION SYSTEM — the single source of truth for how QuantEdge moves.
 *
 * The reason MomoEdge feels "cohesive" and QuantEdge feels "bland" is that a
 * premium UI applies ONE motion vocabulary to every element: same easing, same
 * durations, same reveal, same hover physics. Import from here — never hand-roll
 * a transition in a component. That uniformity IS the polish.
 *
 * Usage:
 *   <motion.div variants={stagger} initial="hidden" animate="show">
 *     {items.map(x => <motion.div key={x} variants={enter} whileHover={hoverLift} />)}
 *   </motion.div>
 *
 * Respect the user: wrap reveals behind useReducedMotion() at the call site.
 */
import type { Variants, Transition } from "framer-motion";

/** One signature curve (easeOutExpo-ish) — decisive in, gentle settle. */
export const EASE = [0.22, 1, 0.36, 1] as const;

/** One spring — used for anything that "pops" (bubbles, badges, entering cards). */
export const SPRING: Transition = { type: "spring", stiffness: 320, damping: 30, mass: 0.9 };

/** Three durations. Nothing outside this scale. */
export const DUR = { fast: 0.18, base: 0.32, slow: 0.6 } as const;

/** Standard element reveal — fade + rise. */
export const enter: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE } },
};

/** Container that reveals its children in sequence. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

/** Spring-in for discrete objects (data points, chips, orbs). */
export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.55 },
  show: { opacity: 1, scale: 1, transition: SPRING },
};

/** The one hover interaction — a subtle lift. */
export const hoverLift = { scale: 1.06, transition: { duration: DUR.fast, ease: EASE } };

/** Tap feedback. */
export const tapPress = { scale: 0.97 };
