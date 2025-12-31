import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="border-t border-slate-800/50 py-3 px-4 mt-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>QuantEdge Research</span>
          <span className="text-slate-600">|</span>
          <Link href="/privacy" className="hover:text-cyan-400 transition-colors" data-testid="footer-link-privacy">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-cyan-400 transition-colors" data-testid="footer-link-terms">
            Terms
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-red-400">Not financial advice</span>
          <span className="text-slate-600">•</span>
          <span>Educational only</span>
        </div>
      </div>
    </footer>
  );
}
