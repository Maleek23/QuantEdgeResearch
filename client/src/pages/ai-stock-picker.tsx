/**
 * AI Stock Picker - Redirects to Trade Desk
 *
 * This page has been consolidated into trade-desk.tsx which has
 * the full AI Stock Picker functionality in the Best Setups view.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function AIStockPicker() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Redirect to trade desk best-setups view
    setLocation("/trade-desk/best-setups");
  }, [setLocation]);

  return null;
}
