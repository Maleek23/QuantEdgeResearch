import { Link } from "wouter";
import { TrendingUp, Activity, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getTimezoneAbbreviation } from "@/lib/timezone";

export function Footer() {
  const currentYear = new Date();
  const timezone = getTimezoneAbbreviation();

  return (
    <footer className="border-t border-white/10 glass-card rounded-none mt-auto">
      <div className="container mx-auto px-6 py-4">
        {/* Main Footer Content */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 rounded bg-cyan-500 flex items-center justify-center">
              <span className="text-xs font-bold text-black">QE</span>
            </div>
            <span className="font-semibold text-sm">QuantEdge Research</span>
          </div>

          {/* Quick Links */}
          <nav className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
            <Link href="/privacy" className="hover:text-cyan-400 transition-colors" data-testid="footer-link-privacy">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-cyan-400 transition-colors" data-testid="footer-link-terms">
              Terms
            </Link>
            <a 
              href="https://www.sec.gov/education" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-cyan-400 transition-colors"
              data-testid="footer-link-sec"
            >
              SEC Education
            </a>
          </nav>

          {/* Disclaimer */}
          <div className="text-xs text-muted-foreground text-center md:text-right">
            <span className="text-red-400 font-medium">Not financial advice.</span>
            <span className="ml-2">Educational only.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
