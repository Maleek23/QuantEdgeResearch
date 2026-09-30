/**
 * NEXT STEPS — the "you're in" screen after an account is created (/signup and
 * /join-beta). Three things to do first: build a watchlist, open NEXUS, join the
 * Discord (only when a real invite link is configured — lib/public-config.ts).
 * Rendered inside `.landing.lp` (styles: nexus.css "auth pages").
 */
import { Link } from 'wouter';
import { DISCORD_INVITE_URL, DISCORD_SERVER_NAME } from '@/lib/public-config';

export default function NextSteps({ name, continueTo }: { name?: string | null; continueTo?: string | null }) {
  const primary = continueTo && continueTo !== '/t' ? continueTo : '/t';
  return (
    <div className="auth-card" role="status" aria-live="polite">
      <p className="lp-eyebrow">Account created</p>
      <h1 className="auth-h1" tabIndex={-1} id="auth-done-title">{name ? `You’re in, ${name}.` : 'You’re in.'}</h1>
      <p className="auth-sub">Three things to do first — each takes under a minute.</p>
      <ol className="auth-steps">
        <li className="auth-step">
          <h2>Build your watchlist</h2>
          <p>Open a ticker’s page and tap the star to keep it on your watchlist — start with the names you actually trade.</p>
          <Link href="/r/SPY" className="lp-link">Start with SPY →</Link>
        </li>
        <li className="auth-step">
          <h2>Open NEXUS</h2>
          <p>The trading desk: today’s setups ranked by their evidence, each with entry, stop and target.</p>
          <Link href="/t" className="lp-link">Open NEXUS →</Link>
        </li>
        {DISCORD_INVITE_URL && (
          <li className="auth-step">
            <h2>Join the community</h2>
            <p>{DISCORD_SERVER_NAME} on Discord — talk through setups and hear about changes first.</p>
            <a href={DISCORD_INVITE_URL} className="lp-link" target="_blank" rel="noopener noreferrer">Join the Discord →<span className="sr-only"> (opens in a new tab)</span></a>
          </li>
        )}
      </ol>
      <div style={{ marginTop: 20 }}>
        <Link href={primary} className="btn btn-primary btn-lg auth-submit">{primary === '/t' ? 'Go to the terminal' : 'Continue where you left off'}</Link>
      </div>
      <p className="auth-fine">QuantEdge is an educational research tool, not investment advice. Trading involves substantial risk of loss.</p>
    </div>
  );
}
