/**
 * Research Hub - Redirects to Academy
 *
 * This page was just a wrapper. Academy provides the full
 * educational experience with articles, guides, and resources.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function ResearchHubPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/academy");
  }, [setLocation]);

  return null;
}
