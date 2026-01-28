/**
 * Watchlist Bot - Redirects to Automations
 *
 * This page has been consolidated into automations.tsx which has
 * the full bot dashboard, portfolio stats, and trading automation features.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function WatchlistBot() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/automations");
  }, [setLocation]);

  return null;
}
