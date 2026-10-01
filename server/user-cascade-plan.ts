/**
 * What "delete a user" removes (docs/ADMIN_TAB.md §Delete user). The security
 * review (docs/SECURITY_REVIEW_2026-09-30.md) noted storage.deleteUser only
 * cleared preferences, watchlist and trade ideas and left every other
 * user-owned row behind. This is the full plan; storage.deleteUser executes it
 * in one transaction. scripts/test-admin-ops.ts fails if a table with a
 * user_id / owner_id / linked_user_id column is added to shared/schema.ts and
 * not listed here.
 *
 * No DB import — the plan is data, so the test can check it without Postgres.
 */
import {
  activeTrades, aiCreditBalances, aiUsageLedger, autoLottoPreferences, brokerConnections, creditTransactions,
  dailyUsage, journalNotes, journalTrades, pageViews, paperEquitySnapshots, paperPortfolios, paperPositions,
  passwordResetTokens, researchHistory, symbolNotes, tradeIdeas, traders, trackedWallets, userActivityEvents,
  userAnalyticsSummary, userLoginHistory, userNavigationLayouts, userPageLayouts, userPreferences, walletAlerts,
  walletHoldings, walletTransactions, watchlist,
} from '@shared/schema';

/** Rows owned by the user: deleted (children first). */
export const USER_OWNED_CHILDREN = [
  // paper portfolio children → by portfolio id
  { table: paperPositions, column: paperPositions.portfolioId, parent: 'paperPortfolios' as const },
  { table: paperEquitySnapshots, column: paperEquitySnapshots.portfolioId, parent: 'paperPortfolios' as const },
  // tracked wallet children → by wallet id
  { table: walletHoldings, column: walletHoldings.walletId, parent: 'trackedWallets' as const },
  { table: walletTransactions, column: walletTransactions.walletId, parent: 'trackedWallets' as const },
];

export const USER_OWNED_DELETE = [
  { name: 'user_preferences', table: userPreferences, column: userPreferences.userId },
  { name: 'watchlist', table: watchlist, column: watchlist.userId },
  { name: 'symbol_notes', table: symbolNotes, column: symbolNotes.userId },
  { name: 'research_history', table: researchHistory, column: researchHistory.userId },
  { name: 'user_navigation_layouts', table: userNavigationLayouts, column: userNavigationLayouts.userId },
  { name: 'user_page_layouts', table: userPageLayouts, column: userPageLayouts.userId },
  { name: 'daily_usage', table: dailyUsage, column: dailyUsage.userId },
  { name: 'active_trades', table: activeTrades, column: activeTrades.userId },
  { name: 'wallet_alerts', table: walletAlerts, column: walletAlerts.userId },
  { name: 'tracked_wallets', table: trackedWallets, column: trackedWallets.userId },
  { name: 'paper_portfolios', table: paperPortfolios, column: paperPortfolios.userId },
  { name: 'auto_lotto_preferences', table: autoLottoPreferences, column: autoLottoPreferences.userId },
  { name: 'user_login_history', table: userLoginHistory, column: userLoginHistory.userId },
  { name: 'page_views', table: pageViews, column: pageViews.userId },
  { name: 'user_activity_events', table: userActivityEvents, column: userActivityEvents.userId },
  { name: 'user_analytics_summary', table: userAnalyticsSummary, column: userAnalyticsSummary.userId },
  { name: 'ai_credit_balances', table: aiCreditBalances, column: aiCreditBalances.userId },
  { name: 'ai_usage_ledger', table: aiUsageLedger, column: aiUsageLedger.userId },
  { name: 'credit_transactions', table: creditTransactions, column: creditTransactions.userId },
  { name: 'password_reset_tokens', table: passwordResetTokens, column: passwordResetTokens.userId },
  // The personal journal book: journal_trades.user_id / journal_notes.owner_id = the user's id.
  // Trader books use a separate owner id (traderOwnerId), so they are untouched.
  { name: 'journal_trades', table: journalTrades, column: journalTrades.userId },
  { name: 'journal_notes', table: journalNotes, column: journalNotes.ownerId },
  { name: 'broker_connections', table: brokerConnections, column: brokerConnections.userId },
];

/**
 * Rows that are NOT the user's to take with them: detached (column set to
 * NULL), not deleted. trade_ideas is the platform's model record (SR 11-7) —
 * deleting a member's row would change the published track record; a trader
 * book survives its linked account.
 */
export const USER_DETACH = [
  { name: 'trade_ideas', table: tradeIdeas, column: tradeIdeas.userId, set: { userId: null } },
  { name: 'traders', table: traders, column: traders.linkedUserId, set: { linkedUserId: null } },
];

/** SQL column names covered by the plan, by table — used by the coverage test. */
export function coveredColumns(): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  const add = (table: string, col: string) => { if (!m.has(table)) m.set(table, new Set()); m.get(table)!.add(col); };
  for (const s of USER_OWNED_DELETE) add(s.name, s.column.name);
  for (const s of USER_DETACH) add(s.name, s.column.name);
  return m;
}
