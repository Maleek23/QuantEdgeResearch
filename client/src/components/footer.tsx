import { Link } from "wouter";
import { Shield, TrendingUp, Users, FileText, Lock, Mail } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-card/30 mt-auto">
      <div className="container mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg">QuantEdge Research</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Professional quantitative trading research platform for identifying day-trading opportunities across equities, options, and crypto markets.
            </p>
          </div>

          {/* Product */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">Product</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/" className="hover:text-foreground transition-colors" data-testid="footer-link-home">
                  Trade Ideas
                </Link>
              </li>
              <li>
                <Link href="/performance" className="hover:text-foreground transition-colors" data-testid="footer-link-performance">
                  Performance Tracking
                </Link>
              </li>
              <li>
                <Link href="/watchlist" className="hover:text-foreground transition-colors" data-testid="footer-link-watchlist">
                  Watchlist & Alerts
                </Link>
              </li>
              <li>
                <Link href="/signal-intelligence" className="hover:text-foreground transition-colors" data-testid="footer-link-signals">
                  Signal Intelligence
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">Company</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Users className="h-3 w-3" />
                <span>Educational Research Platform</span>
              </li>
              <li className="flex items-center gap-2">
                <Shield className="h-3 w-3" />
                <span>Data-Driven Analysis</span>
              </li>
              <li className="flex items-center gap-2">
                <Lock className="h-3 w-3" />
                <span>Secure Infrastructure</span>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">Legal</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <button 
                  className="hover:text-foreground transition-colors text-left"
                  data-testid="footer-link-disclaimer"
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                >
                  Risk Disclaimer
                </button>
              </li>
              <li>
                <a 
                  href="https://www.sec.gov/education" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors inline-flex items-center gap-1"
                  data-testid="footer-link-sec"
                >
                  SEC Education
                  <FileText className="h-3 w-3" />
                </a>
              </li>
              <li>
                <a 
                  href="https://www.finra.org/investors" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors inline-flex items-center gap-1"
                  data-testid="footer-link-finra"
                >
                  FINRA Resources
                  <FileText className="h-3 w-3" />
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-3 w-3" />
                <span>support@quantedge.io</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t mt-8 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
            <p>
              © {currentYear} QuantEdge Research. All rights reserved.
            </p>
            
            {/* Risk Disclaimer */}
            <div className="flex items-center gap-2 bg-destructive/10 text-destructive px-3 py-1.5 rounded-md border border-destructive/20">
              <Shield className="h-4 w-4 flex-shrink-0" />
              <span className="text-xs">
                NOT FINANCIAL ADVICE - Educational Research Only
              </span>
            </div>
          </div>
          
          {/* Detailed Disclaimer */}
          <div className="mt-6 p-4 bg-muted/50 rounded-md border text-xs text-muted-foreground leading-relaxed">
            <p className="font-semibold mb-2 text-foreground">IMPORTANT RISK DISCLOSURE:</p>
            <p>
              QuantEdge Research is a quantitative analysis platform designed exclusively for educational and research purposes. 
              All trade ideas, signals, and analysis are generated by algorithmic models and AI systems for informational purposes only. 
              <strong className="text-foreground"> This is NOT financial advice, investment advice, or a recommendation to buy or sell any security.</strong>
            </p>
            <p className="mt-2">
              Trading stocks, options, and cryptocurrencies involves substantial risk of loss and is not suitable for all investors. 
              Past performance does not guarantee future results. You should carefully consider your financial situation, investment objectives, 
              and risk tolerance before making any trading decisions. All trading decisions are your sole responsibility. 
              <strong className="text-foreground"> QuantEdge Research does not provide personalized financial advice and is not a registered investment advisor.</strong>
            </p>
            <p className="mt-2">
              Options trading involves significant risk and is not appropriate for all investors. Cryptocurrency trading is highly volatile and speculative. 
              Please consult with a qualified financial professional before making any investment decisions. 
              By using this platform, you acknowledge that you understand and accept these risks.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
