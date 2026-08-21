/**
 * INSTRUMENT PANEL — the hero mockup, alive.
 *
 * Replaces a static PNG of the terminal. Two reasons it is a component and not a
 * screenshot: a screenshot of a UI that is still changing is stale the day it is
 * taken (the ones it replaces were shot in the old amber palette and clashed with
 * everything around them), and a still frame cannot carry the one idea the design
 * is built on.
 *
 * That idea is how a number arrives. Everything here SETTLES — readouts swing past
 * their value and damp back, the way a moving-coil meter does. A count-up would
 * make the figures look like they were being won, which is the wrong claim for an
 * instrument and a very wrong claim for a product whose headline number is a
 * negative expectancy.
 *
 * Deliberately not a fake screenshot. It does not pretend to be the app; it is a
 * diagram of what the app measures, drawn in the app's own palette.
 */
import { motion, useReducedMotion } from 'framer-motion';
import { SETTLE, SETTLE_HEAVY, bootSequence, drawIn, settleIn } from '@/lib/motion';

const ICE = 'var(--brand-cyan)';
const MOSS = 'var(--trade-bullish)';
const CLAY = 'var(--trade-bearish)';

/** A readout that settles into place rather than counting up. */
function Readout({
  label, value, tone = 'default', delay = 0, large = false,
}: { label: string; value: string; tone?: 'default' | 'up' | 'down' | 'signal'; delay?: number; large?: boolean }) {
  const reduce = useReducedMotion();
  const color = tone === 'up' ? MOSS : tone === 'down' ? CLAY : tone === 'signal' ? ICE : 'var(--foreground)';
  return (
    <div className="min-w-0">
      <div className="ui-eyebrow text-[9px] text-muted-foreground">{label}</div>
      <motion.div
        className="ui-data font-bold tabular-nums leading-none mt-1"
        style={{ color, fontSize: large ? 26 : 15 }}
        initial={reduce ? false : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduce ? { duration: 0 } : { ...(large ? SETTLE_HEAVY : SETTLE), delay }}
      >
        {value}
      </motion.div>
    </div>
  );
}

/** A bar that fills from zero and overshoots slightly before resting. */
function Bar({ pct, color, delay = 0 }: { pct: number; color: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.08]">
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={reduce ? { duration: 0 } : { ...SETTLE, delay }}
      />
    </div>
  );
}

export function InstrumentPanel({ className }: { className?: string }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      variants={bootSequence}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.4 }}
      className={`relative overflow-hidden rounded-xl border border-card-border bg-card ${className ?? ''}`}
    >
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <span className="h-2 w-2 rounded-full" style={{ background: CLAY, opacity: 0.5 }} />
        <span className="h-2 w-2 rounded-full" style={{ background: '#D9A05B', opacity: 0.5 }} />
        <span className="h-2 w-2 rounded-full" style={{ background: MOSS, opacity: 0.5 }} />
        <span className="ui-eyebrow ml-2 text-[9px] text-muted-foreground">conviction · NVDA</span>
        <span className="ml-auto ui-eyebrow text-[9px]" style={{ color: MOSS }}>live</span>
      </div>

      <div className="space-y-3 p-4">
        <motion.div variants={settleIn} className="flex items-end justify-between gap-4">
          <Readout label="conviction" value="87" tone="signal" large delay={0.1} />
          <Readout label="r : r" value="2.5" delay={0.18} />
          <Readout label="to target" value="16%" tone="up" delay={0.26} />
        </motion.div>

        {/* Each layer settles in turn, so the eye reads them arriving
            independently — which is what "independent layers" actually means. */}
        <motion.div variants={drawIn} className="space-y-1.5 pt-1" style={{ originX: 0 }}>
          {[
            { k: 'technical', v: 82, c: ICE },
            { k: 'compression', v: 71, c: ICE },
            { k: 'gamma', v: 64, c: ICE },
            { k: 'sector', v: 38, c: CLAY },
            { k: 'catalyst', v: 55, c: ICE },
          ].map((l, i) => (
            <div key={l.k} className="flex items-center gap-2">
              <span className="ui-eyebrow w-[74px] shrink-0 text-[9px] text-muted-foreground">{l.k}</span>
              <Bar pct={l.v} color={l.c} delay={0.3 + i * 0.07} />
            </div>
          ))}
        </motion.div>

        {/* The honest line: one layer disagreeing, stated rather than averaged away. */}
        <motion.div
          variants={settleIn}
          className="ui-prose rounded-md px-2.5 py-2 text-[11px] leading-snug"
          style={{ background: `color-mix(in srgb, ${CLAY} 10%, transparent)`, color: 'var(--muted-foreground)' }}
        >
          <span style={{ color: CLAY }}>Sector rotation argues against this.</span>{' '}
          Money is leaving the group even as the setup scores well.
        </motion.div>
      </div>

      {/* The only ambient motion on the page — an instrument sampling, not decor. */}
      {!reduce && (
        <motion.div
          className="pointer-events-none absolute inset-x-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${ICE}, transparent)`, opacity: 0.35 }}
          initial={{ top: '0%' }}
          animate={{ top: ['0%', '100%'] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'linear', repeatDelay: 2 }}
        />
      )}
    </motion.div>
  );
}
