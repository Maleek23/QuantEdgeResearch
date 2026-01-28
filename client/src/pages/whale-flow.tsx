/**
 * Whale Flow - Redirects to Smart Money
 *
 * This page has been consolidated into smart-money.tsx which has
 * options flow, insider trades, and analyst ratings all in one place.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function WhaleFlow() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/smart-money");
  }, [setLocation]);

  return null;
}
