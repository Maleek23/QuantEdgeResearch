/**
 * Guided first-run tours, one per page. A step points at the first VISIBLE
 * element matching one of its selectors; if none is on screen (phone layout,
 * data still loading) the card shows centred with no spotlight — a tour never
 * blocks on a missing element.
 *
 * Beginners get every step; intermediates get the `core` steps; pros get none
 * (all tours stay re-launchable from Help → "Take the tour").
 */
import type { GlossaryKey } from '@shared/glossary';
import type { TourId } from '@shared/onboarding';

export interface TourStep {
  title: string;
  body: string;
  target?: string[];
  terms?: GlossaryKey[];
  core?: boolean;
}

const HELP = ['[aria-label="Open account menu"]'];

export const TOURS: Record<TourId, { label: string; steps: TourStep[] }> = {
  today: {
    label: 'Today',
    steps: [
      { core: true, title: 'This is Today', body: 'Your morning brief: where dealers are positioned on SPY this week and what that means for how far price is likely to move.', target: ['[data-tour="today-hero"]'], terms: ['gex', 'gamma-flip'] },
      { title: 'Start here', body: 'Five small steps that get you comfortable. Tick them off at your own pace.', target: ['[data-tour="start-here"]'] },
      { core: true, title: 'Index desk', body: 'SPX, SPY, QQQ and IWM — the four indexes the intraday engine watches, with today’s 0DTE ideas when there are any.', target: ['[data-tour="today-index"]'], terms: ['0dte'] },
      { title: 'Go deeper in NEXUS', body: 'NEXUS is the trading desk: every ranked setup with its entry, stop and targets.', target: ['[data-testid="nav-tab-oracle"]', '[data-testid="dock-oracle"]'], terms: ['targets', 'r'] },
      { core: true, title: 'Help is always here', body: 'Open this menu for the Guide, settings, and to replay any tour.', target: HELP },
    ],
  },
  nexus: {
    label: 'NEXUS',
    steps: [
      { core: true, title: 'The NEXUS board', body: 'Setups ranked by the model. Each card shows a plan: where to get in, where you’re wrong (the stop), and two targets. Paper results, not promises.', terms: ['targets', 'r'] },
      { core: true, title: 'Board or 0DTE', body: 'Switch between the full board and the 0DTE desk for same-day index options.', target: ['[data-tour="nexus-views"]'], terms: ['0dte'] },
      { title: 'Size by risk, not by hope', body: 'Ideas are sized so every trade risks the same dollar amount. Set yours in Settings › Trading defaults.', terms: ['r', 'delta'] },
      { core: true, title: 'Replay this tour any time', body: 'Help lives in the account menu.', target: HELP },
    ],
  },
  '0dte': {
    label: '0DTE',
    steps: [
      { core: true, title: 'The 0DTE desk', body: 'Same-day options on SPY, QQQ and IWM. They move fast and can expire worthless within hours — start small, or paper trade first.', target: ['[data-tour="nexus-0dte"]'], terms: ['0dte'] },
      { core: true, title: 'Levels drive the plan', body: 'Ideas key off the opening range, VWAP and the dealer walls. A break of a level is the trigger, not a guess.', terms: ['orb', 'vwap', 'call-wall', 'put-wall'] },
      { title: 'T1 first', body: 'Many traders take part off at T1. The desk records how far each option ran so you can see what was available.', terms: ['targets'] },
    ],
  },
  gex: {
    label: 'GEX',
    steps: [
      { core: true, title: 'Reading a GEX chart', body: 'Bars show dealer gamma by strike. Tall positive bars tend to slow price down; negative bars tend to speed it up.', target: ['[data-testid="nav-tab-gex"]', '[data-testid="dock-gex"]'], terms: ['gex'] },
      { core: true, title: 'Walls and the flip', body: 'The call wall often caps rallies, the put wall often holds dips, and below the gamma flip moves tend to get bigger.', terms: ['call-wall', 'put-wall', 'gamma-flip'] },
      { title: 'A map, not a forecast', body: 'GEX is modelled from open interest. Use it to set expectations for range, then let price confirm.' },
    ],
  },
  flow: {
    label: 'FLOW',
    steps: [
      { core: true, title: 'Options flow', body: 'Large options orders as they print. Big premium shows where money went — not why. Many prints are hedges.', target: ['[data-testid="nav-tab-flow"]', '[data-testid="dock-flow"]'], terms: ['flow'] },
      { title: 'Look for agreement', body: 'Flow is strongest when it lines up with the chart and the dealer map — one print on its own is noise.', terms: ['delta', 'gex'] },
    ],
  },
  journal: {
    label: 'Journal',
    steps: [
      { core: true, title: 'Your journal', body: 'Log trades or import a broker CSV. Results are counted in R so a big account and a small one compare fairly.', target: ['[data-testid="nav-tab-journal"]'], terms: ['r'] },
      { title: 'Learn from the losers', body: 'Insights ranks what to stop doing, with dollars and sample size, so you fix the expensive habits first.' },
    ],
  },
};

/** Which tour belongs to the current URL (path + search). */
export function tourForLocation(path: string, search: string): TourId | null {
  if (path === '/today') return 'today';
  if (path !== '/t') return null;
  const q = new URLSearchParams(search);
  const tab = q.get('tab') ?? 'oracle';
  if (tab === 'oracle') return q.get('nx') === '0dte' ? '0dte' : 'nexus';
  if (tab === 'gex' || tab === 'flow' || tab === 'journal') return tab;
  return null;
}

export function stepsFor(id: TourId, tier: 'beginner' | 'intermediate' | 'pro' | null, full = false): TourStep[] {
  const all = TOURS[id].steps;
  return full || tier === 'beginner' || tier === null ? all : all.filter((s) => s.core);
}
