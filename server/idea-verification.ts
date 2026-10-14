/**
 * Verify-ledger chip for one idea id (NEXUS P&L, shared/nexus-pnl.ts verificationOf).
 * Reads the nightly bar-verification ledger (server/desk-verify-ledger.ts, cached by mtime).
 */
import { loadDeskVerifyLedger } from './desk-verify-ledger';
import { verificationOf, type PnlVerification } from '@shared/nexus-pnl';

export function ideaVerification(id: string): PnlVerification {
  const ledger = loadDeskVerifyLedger();
  return verificationOf(ledger?.byId.get(String(id)) ?? null, ledger?.asOf ?? null);
}
