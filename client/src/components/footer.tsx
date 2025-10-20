import { Link } from "wouter";
import { TrendingUp } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

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

        {/* Bottom Bar - Copyright & Risk Warning */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 pt-4 border-t border-border/40">
          <p className="text-xs text-muted-foreground">
            © {currentYear} QuantEdge Research. All rights reserved.
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
