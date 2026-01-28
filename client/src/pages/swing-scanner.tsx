/**
 * Swing Scanner - Redirects to Market Scanner
 *
 * This page has been consolidated into market-scanner.tsx which has
 * the full scanning functionality including swing trade setups.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function SwingScanner() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/market-scanner");
  }, [setLocation]);

  return null;
}
