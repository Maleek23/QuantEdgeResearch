/**
 * Economic Calendar Service
 * Static schedule of major U.S. economic events published by the Fed/BLS/BEA.
 * These are deterministic — dates known months in advance.
 */

import { logger } from './logger';

export interface EconomicEvent {
  name: string;
  date: string; // YYYY-MM-DD
  time: string; // ET time string
  importance: 'high' | 'medium' | 'low';
  description: string;
  tradingImpact?: string;
}

// Major economic events for March 2026
// Sources: Federal Reserve calendar, BLS release schedule, BEA advance schedule
const ECONOMIC_EVENTS_2026: EconomicEvent[] = [
  // March 2026
  { name: 'ISM Manufacturing PMI', date: '2026-03-02', time: '10:00 AM ET', importance: 'high', description: 'Manufacturing sector activity — above 50 = expansion', tradingImpact: 'Affects industrials (XLI), commodities (USO, GLD)' },
  { name: 'JOLTS Job Openings', date: '2026-03-04', time: '10:00 AM ET', importance: 'medium', description: 'Job openings and labor turnover survey', tradingImpact: 'Labor market strength indicator' },
  { name: 'ISM Services PMI', date: '2026-03-04', time: '10:00 AM ET', importance: 'high', description: 'Services sector activity — above 50 = expansion', tradingImpact: 'Broad market impact, 70% of GDP' },
  { name: 'ADP Employment', date: '2026-03-05', time: '8:15 AM ET', importance: 'medium', description: 'Private sector employment change — NFP preview', tradingImpact: 'Sets expectations for Friday jobs report' },
  { name: 'Nonfarm Payrolls', date: '2026-03-06', time: '8:30 AM ET', importance: 'high', description: 'Monthly jobs report — unemployment rate, wage growth, job gains', tradingImpact: 'Moves SPY, bonds (TLT), VIX. Biggest monthly data release.' },
  { name: 'Fed Chair Powell Speech', date: '2026-03-07', time: '12:00 PM ET', importance: 'high', description: 'Semi-annual monetary policy testimony', tradingImpact: 'Rate expectations, volatility spike' },
  { name: 'CPI Inflation', date: '2026-03-12', time: '8:30 AM ET', importance: 'high', description: 'Consumer Price Index — headline and core inflation', tradingImpact: 'Major mover for bonds (TLT/TBT), gold (GLD), equities' },
  { name: 'PPI Inflation', date: '2026-03-13', time: '8:30 AM ET', importance: 'medium', description: 'Producer Price Index — wholesale inflation', tradingImpact: 'Leads CPI, affects margin expectations' },
  { name: 'Retail Sales', date: '2026-03-14', time: '8:30 AM ET', importance: 'high', description: 'Monthly consumer spending report', tradingImpact: 'Consumer discretionary (XLY), retail stocks' },
  { name: 'FOMC Rate Decision', date: '2026-03-18', time: '2:00 PM ET', importance: 'high', description: 'Federal Reserve interest rate decision + statement + dot plot', tradingImpact: 'THE event. Moves everything — SPY, TLT, GLD, VIX, USD. Straddle plays common.' },
  { name: 'FOMC Press Conference', date: '2026-03-18', time: '2:30 PM ET', importance: 'high', description: 'Fed Chair Q&A — tone often moves markets more than the decision', tradingImpact: 'Whipsaw risk. Extended hours vol spike.' },
  { name: 'Existing Home Sales', date: '2026-03-20', time: '10:00 AM ET', importance: 'medium', description: 'Housing market activity level', tradingImpact: 'Homebuilders (XHB), mortgage rates, rate-sensitive sectors' },
  { name: 'Initial Jobless Claims', date: '2026-03-20', time: '8:30 AM ET', importance: 'low', description: 'Weekly unemployment claims — labor market health', tradingImpact: 'Trending data; significant only with large surprises' },
  { name: 'S&P Global PMI Flash', date: '2026-03-24', time: '9:45 AM ET', importance: 'medium', description: 'Flash manufacturing & services PMI for March', tradingImpact: 'Early read on economic momentum' },
  { name: 'New Home Sales', date: '2026-03-25', time: '10:00 AM ET', importance: 'medium', description: 'New residential home sales pace', tradingImpact: 'Housing sector, builder stocks' },
  { name: 'Durable Goods Orders', date: '2026-03-26', time: '8:30 AM ET', importance: 'medium', description: 'Orders for long-lasting manufactured goods', tradingImpact: 'Capex indicator — affects industrials (XLI), defense (LMT, RTX)' },
  { name: 'GDP (Q4 Final)', date: '2026-03-27', time: '8:30 AM ET', importance: 'high', description: 'Final Q4 2025 GDP revision — economic growth rate', tradingImpact: 'Broad market impact if revised significantly' },
  { name: 'PCE Price Index', date: '2026-03-28', time: '8:30 AM ET', importance: 'high', description: 'Personal Consumption Expenditures — the Fed\'s PREFERRED inflation measure', tradingImpact: 'Most important inflation read for Fed policy. Moves bonds, gold, equities.' },
  { name: 'Michigan Consumer Sentiment', date: '2026-03-28', time: '10:00 AM ET', importance: 'medium', description: 'Consumer confidence and inflation expectations', tradingImpact: 'Consumer sentiment leading indicator' },

  // April 2026 (preview — next month visibility)
  { name: 'ISM Manufacturing PMI', date: '2026-04-01', time: '10:00 AM ET', importance: 'high', description: 'April manufacturing PMI', tradingImpact: 'Kick-off of new month data cycle' },
  { name: 'Nonfarm Payrolls', date: '2026-04-03', time: '8:30 AM ET', importance: 'high', description: 'March jobs report', tradingImpact: 'Major monthly release' },
  { name: 'CPI Inflation', date: '2026-04-10', time: '8:30 AM ET', importance: 'high', description: 'March CPI — inflation check', tradingImpact: 'Key inflation data point' },
];

/**
 * Get upcoming economic events within the specified number of days
 */
export function getUpcomingEvents(days: number = 7): EconomicEvent[] {
  const now = new Date();
  const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  // Set now to start of today for inclusive comparison
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return ECONOMIC_EVENTS_2026.filter(event => {
    const eventDate = new Date(event.date + 'T00:00:00');
    return eventDate >= todayStart && eventDate <= cutoff;
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Get today's economic events
 */
export function getTodayEvents(): EconomicEvent[] {
  const today = new Date().toISOString().split('T')[0];
  return ECONOMIC_EVENTS_2026.filter(event => event.date === today);
}

/**
 * Get all events for a specific month
 */
export function getMonthEvents(year: number, month: number): EconomicEvent[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return ECONOMIC_EVENTS_2026.filter(event => event.date.startsWith(prefix));
}

/**
 * Check if there's a high-importance event within N hours
 */
export function hasHighImpactEventSoon(hours: number = 24): EconomicEvent | null {
  const now = new Date();
  const cutoff = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const upcoming = ECONOMIC_EVENTS_2026.filter(event => {
    const eventDate = new Date(event.date + 'T00:00:00');
    return event.importance === 'high' && eventDate >= todayStart && eventDate <= cutoff;
  });

  return upcoming.length > 0 ? upcoming[0] : null;
}

logger.debug('[ECON-CAL] Economic calendar service loaded with ' + ECONOMIC_EVENTS_2026.length + ' events');
