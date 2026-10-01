/**
 * DEV-ONLY: /__harness — every page the device pass covers, one link each.
 * Routed only when import.meta.env.DEV (App.tsx); see dev/harness.ts.
 */
const SIGNED_IN: Array<[string, string]> = [
  ['Today', '/today'],
  ['NEXUS board', '/t'],
  ['NEXUS idea detail', '/t?idea=fixture-NVDA&sym=NVDA'],
  ['NEXUS 0DTE desk', '/t?nx=0dte'],
  ['FLOW', '/t?tab=flow'],
  ['Ticker NVDA', '/r/NVDA'],
  ['Sectors', '/t?tab=sectors'],
  ['Crypto', '/t?tab=crypto'],
  ['Journal', '/t?tab=journal'],
  ['Journal daily', '/t?tab=journal&jtab=daily'],
  ['Settings', '/settings'],
  ['Admin (admin user)', '/admin?harness-admin=1'],
];
const PUBLIC: Array<[string, string]> = [
  ['Landing', '/?harness-out=1'],
  ['Pricing', '/?section=pricing&harness-out=1'],
  ['Sign up', '/signup?harness-out=1'],
  ['Log in', '/login?harness-out=1'],
  ['How-to', '/how-to'],
];

export default function HarnessIndex() {
  const link = ([label, href]: [string, string]) => (
    <li key={href}><a href={href} style={{ color: '#7fb2ff', display: 'inline-block', padding: '8px 0' }}>{label}</a> <code style={{ opacity: 0.6 }}>{href}</code></li>
  );
  return (
    <main style={{ padding: 16, font: '14px/1.5 system-ui, sans-serif', color: '#e8ecf3', background: '#06070a', minHeight: '100dvh' }}>
      <h1 style={{ fontSize: 18 }}>Device harness (DEV only · synthetic fixtures)</h1>
      <p>Signed-in pages (fixture user). Visit a public page last, or reopen /__harness?harness-out=0 to sign back in.</p>
      <ul>{SIGNED_IN.map(link)}</ul>
      <h2 style={{ fontSize: 15 }}>Public</h2>
      <ul>{PUBLIC.map(link)}</ul>
      <p><a href="/?harness=0" style={{ color: '#7fb2ff' }}>Turn the harness off</a></p>
    </main>
  );
}
