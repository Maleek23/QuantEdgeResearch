/**
 * Smart Advisor - Redirects to Trading Engine
 *
 * This page has been consolidated into trading-engine.tsx which has
 * the full command center with position analysis capabilities.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function SmartAdvisor() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/trading-engine");
  }, [setLocation]);

  return null;
}
