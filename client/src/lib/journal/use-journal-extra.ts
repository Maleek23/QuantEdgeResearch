/**
 * Journal hooks for the LuxAlgo-parity pages: the book's account balance,
 * per-trade reviews (journal_notes reason 'trade_review'), playbook rules.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { JournalKey } from '@shared/journal-sources';
import { journalQs } from './use-journal';
import type { JournalNoteRow } from './types';
import { decodeTradeReview, playbookRules, type TradeReview } from './metrics-extra';

export interface JournalBalance {
  key: JournalKey;
  balance: { kind: 'starting' | 'equity'; amount: number; label: string; source: string; asOf: string | null } | null;
  /** Why there is no balance (shown instead of a number). */
  reason?: string;
}

export function useJournalBalance(key: JournalKey) {
  return useQuery<JournalBalance>({
    queryKey: ['journal-balance', key],
    queryFn: async () => {
      const qs = journalQs(key);
      const res = await fetch(`/api/journal/balance${qs ? `?${qs}` : ''}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Journal balance request failed (${res.status})`);
      return res.json();
    },
    staleTime: 60_000,
  });
}

/**
 * The number drawdown % is measured against. A "starting" balance is used as
 * is. An "equity now" balance anchors the curve so it ENDS at today's equity:
 * start = equity − the book's all-time closed net P&L (deposits, withdrawals
 * and open marks are not separated — the UI says so).
 */
export function balanceAnchor(b: JournalBalance | undefined, allTimeNet: number): { amount: number; note: string } | null {
  if (!b?.balance) return null;
  if (b.balance.kind === 'starting') return { amount: b.balance.amount, note: `${b.balance.label} ${fmtUsd(b.balance.amount)}` };
  const start = b.balance.amount - allTimeNet;
  if (!(start > 0)) return null;
  return { amount: start, note: `${b.balance.label} ${fmtUsd(b.balance.amount)} − book net P&L = ${fmtUsd(start)} start (deposits/withdrawals not separated)` };
}

const fmtUsd = (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

/** trade id → review, from the book's notes. */
export function useTradeReviews(notes: JournalNoteRow[] | undefined) {
  return useMemo(() => {
    const reviews = new Map<string, TradeReview>();
    const rows = new Map<string, JournalNoteRow>();
    for (const n of notes ?? []) {
      if (n.reason !== 'trade_review' || !n.sourceMessageId?.startsWith('trade:')) continue;
      const id = n.sourceMessageId.slice(6);
      reviews.set(id, decodeTradeReview(n.body));
      rows.set(id, n);
    }
    return { reviews, rows };
  }, [notes]);
}

/** setup (lower-case) → { name, rules } from the written playbook definitions. */
export function usePlaybookRules(notes: JournalNoteRow[] | undefined) {
  return useMemo(() => {
    const m = new Map<string, { name: string; rules: string[]; body: string }>();
    for (const n of notes ?? []) {
      if (n.reason !== 'playbook' || !n.sourceMessageId?.startsWith('playbook:')) continue;
      const k = n.sourceMessageId.slice(9);
      m.set(k, { name: k, rules: playbookRules(n.body), body: n.body });
    }
    return m;
  }, [notes]);
}
