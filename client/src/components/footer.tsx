import { Link } from "wouter";
import { TrendingUp, Activity, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getTimezoneAbbreviation } from "@/lib/timezone";

export function Footer() {
  const currentYear = new Date();
  const timezone = getTimezoneAbbreviation();

  return (
    <footer className="border-t bg-card/30 backdrop-blur-sm mt-auto">
      <div className="container mx-auto px-6 py-6">
        {/* Main Footer Content */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">QuantEdge Research</span>
            <span className="text-xs text-muted-foreground hidden md:inline">Quantitative Trading Intelligence</span>
          </div>

          {/* Quick Links */}
          <nav className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors" data-testid="footer-link-home">
              Trade Ideas
            </Link>
            <Link href="/performance" className="hover:text-foreground transition-colors" data-testid="footer-link-performance">
              Performance
            </Link>
            <Link href="/watchlist" className="hover:text-foreground transition-colors" data-testid="footer-link-watchlist">
              Watchlist
            </Link>
            <Link href="/signals" className="hover:text-foreground transition-colors" data-testid="footer-link-signals">
              Signals
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors" data-testid="footer-link-privacy">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors" data-testid="footer-link-terms">
              Terms of Service
            </Link>
            <a 
              href="https://www.sec.gov/education" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
              data-testid="footer-link-sec"
            >
              SEC Education ↗
            </a>
            <a 
              href="https://www.finra.org/investors" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
              data-testid="footer-link-finra"
            >
              FINRA Resources ↗
            </a>
          </nav>
        </div>

        {/* Data Sources & System Status */}
        <div className="flex flex-wrap items-center gap-3 py-3 border-t border-border/40">
          <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
            <Database className="h-3 w-3" />
            Live Data Sources:
          </span>
          <Badge variant="outline" className="text-xs gap-1" data-testid="badge-api-yahoo">
            <Activity className="h-2.5 w-2.5 text-green-500 animate-pulse" />
            Yahoo Finance
          </Badge>
          <Badge variant="outline" className="text-xs gap-1" data-testid="badge-api-coingecko">
            <Activity className="h-2.5 w-2.5 text-green-500 animate-pulse" />
            CoinGecko
          </Badge>
          <Badge variant="outline" className="text-xs gap-1" data-testid="badge-api-alphavantage">
            <Activity className="h-2.5 w-2.5 text-green-500 animate-pulse" />
            Alpha Vantage
          </Badge>
          <Badge variant="secondary" className="text-xs" data-testid="badge-timezone">
            {timezone}
          </Badge>
        </div>

        {/* Bottom Bar - Copyright & Risk Warning */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 pt-4 border-t border-border/40">
          <p className="text-xs text-muted-foreground">
            © {currentYear.getFullYear()} QuantEdge Research. All rights reserved.
          </p>
          
          <div className="flex flex-col md:flex-row items-start md:items-center gap-2 text-xs text-muted-foreground">
            <span className="font-semibold text-destructive">NOT FINANCIAL ADVICE</span>
            <span className="hidden md:inline">•</span>
            <span>Educational research platform. Trading involves substantial risk of loss.</span>
            <span className="hidden md:inline">•</span>
            <span>Past performance does not guarantee future results.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
