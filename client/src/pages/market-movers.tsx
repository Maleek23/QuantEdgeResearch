/**
 * Market Movers - Redirects to Market page
 *
 * This page has been consolidated into market.tsx which has
 * full gainers/losers functionality in the Scanner tab.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function MarketMovers() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Redirect to market page with scanner tab
    setLocation("/market?tab=scanner");
  }, [setLocation]);

  return null;
}
