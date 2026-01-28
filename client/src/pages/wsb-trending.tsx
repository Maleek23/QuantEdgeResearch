/**
 * WSB Trending - Redirects to Social Trends
 *
 * This page has been consolidated into social-trends.tsx which has
 * the same functionality plus Trade Desk integration.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function WSBTrending() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/social-trends");
  }, [setLocation]);

  return null;
}
