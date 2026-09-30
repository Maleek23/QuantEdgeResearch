/**
 * /privacy — public privacy policy.
 *
 * Rewritten 2026-09-30 from a code-level data inventory
 * (docs/PRIVACY_IMPACT_ASSESSMENT.md). Every statement here should be true of
 * the code as shipped; when a data flow, processor or retention period changes,
 * update this page and the PIA together.
 *
 * COUNSEL REVIEW PENDING — drafted by engineering, not by a lawyer. Items marked
 * "counsel" in the PIA (controller identity, lawful bases, the Discord-import
 * notice, retention periods, US-state and GDPR wording) must be reviewed before
 * this is relied on. PRIVACY_CONTACT must be a monitored mailbox.
 */
import type { ReactNode } from "react";
import { SEOHead } from "@/components/seo-head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Eye, Database, Lock, Mail, Scale, Users, Clock, Cookie, Globe } from "lucide-react";

const LAST_UPDATED = "September 30, 2026";
const PRIVACY_CONTACT = "privacy@quantedgelabs.net";

function Section({ icon: Icon, title, children }: { icon: typeof Shield; title: string; children: ReactNode }) {
  return (
    <Card className="glass-card">
      <SEOHead pageKey="privacy" />
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center">
            <Icon className="h-5 w-5 text-white" />
          </div>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-semibold text-foreground mb-1">{label}</p>
      <div>{children}</div>
    </div>
  );
}

const Contact = () => <a className="underline" href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>;

export default function PrivacyPolicy() {
  return (
    <div className="container mx-auto p-6 space-y-6 max-w-4xl">
      <div className="relative overflow-visible rounded-xl mb-8">
        <div className="relative py-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Legal</p>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center shadow-lg">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold">Privacy Policy</h1>
              <p className="text-sm text-muted-foreground mt-1">Last updated: {LAST_UPDATED}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            Quant Edge Labs ("QuantEdge", "we") is a market-research and trading-journal platform. This page explains
            what personal information we collect, why, who processes it for us, how long we keep it and what you can
            ask us to do with it. QuantEdge is research software: it does not hold your money and never places orders
            for you.
          </p>
        </div>
      </div>

      <Section icon={Eye} title="Information We Collect">
        <Item label="Account">
          Your email address and name. If you sign up with a password we store only a bcrypt hash of it. If you sign in
          with Google we receive your name, email address and profile picture URL (the "profile" and "email" scopes) —
          nothing else from your Google account.
        </Item>
        <Item label="Onboarding answers">
          If you complete beta onboarding: occupation, trading experience, markets of interest, investment goals, risk
          tolerance and how you heard about us.
        </Item>
        <Item label="Waitlist and invites">
          Your email address, the page you signed up from and any referral code, if you join the waitlist or are
          invited.
        </Item>
        <Item label="Preferences and watchlist">
          Settings you choose — account size, risk per trade, budgets, time zone, display options, alert toggles, a
          Discord webhook URL if you add one — and the tickers on your watchlist.
        </Item>
        <Item label="Your trading journal">
          Trades you enter or import (symbol, prices, size, times, P&amp;L), your notes, emotion and mistake tags, ratings
          and any images or PDFs you attach. When you import a broker CSV we keep each original row alongside the trade
          so an import can be checked and corrected.
        </Item>
        <Item label="Broker connection (Alpaca)">
          If you connect Alpaca, your API key id and secret are encrypted (AES-256-GCM) before they are stored and are
          never shown back to you or anyone else — only the last four characters of the key id. We use them only to
          read your filled orders and account balance.
        </Item>
        <Item label="Screenshots and AI questions">
          Screenshots you upload for import, and questions you ask our AI features, are sent to an AI provider (see
          below) to be read or answered. Import screenshots are processed in memory and not kept. We keep the first
          100 characters of each AI question with its token count, for usage credits and abuse prevention.
        </Item>
        <Item label="Billing">
          Payments are handled by Stripe. We store your Stripe customer and subscription ids, plan and renewal date —
          never your card number.
        </Item>
        <Item label="Usage and device data">
          Pages you visit, the referring page, campaign tags (UTM), time on page, your browser, device type and user
          agent — tied to your account if you are signed in, and to a random per-tab id if you are not. This analytics
          is first-party only: we do not use advertising networks or third-party tracking scripts.
        </Item>
        <Item label="Security and server logs">
          Our servers record IP addresses, request details and some account identifiers (such as your email address on
          sign-in events) in logs used for security, rate limiting and debugging.
        </Item>
      </Section>

      <Section icon={Users} title="Information About People Who Aren't Users">
        <p>
          QuantEdge can import trading journals that traders post in a Discord community the operator belongs to. An
          import copies the messages in those channels or forum threads — text, the poster's Discord username and id,
          the time, a link back to the message and links to attached images — into that trader's journal on
          QuantEdge, and may send attached chart screenshots to an AI provider to read the trade details. Imported
          journals, trade statistics and a ranked leaderboard are visible to signed-in members.
        </p>
        <p>
          If your Discord posts have been imported and you want them corrected, hidden or removed, email <Contact /> with
          your Discord username and we will act on it.
        </p>
      </Section>

      <Section icon={Database} title="How We Use Your Information">
        <ul className="list-disc list-inside space-y-2">
          <li>Run your account, sign you in and keep it secure</li>
          <li>Show research, alerts and sizing based on your watchlist and preferences</li>
          <li>Store, analyse and display your trading journal</li>
          <li>Process subscriptions and send service emails (invites, password resets, account notices)</li>
          <li>Understand which features are used so we can improve them</li>
          <li>Prevent abuse, investigate problems and meet legal obligations</li>
        </ul>
        <p>We do not sell your personal information and do not share it for cross-context behavioural advertising.</p>
      </Section>

      <Section icon={Mail} title="Who Processes Data For Us">
        <p>These service providers handle personal information on our behalf, only for the purposes listed:</p>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>DigitalOcean</strong> — hosts our application server and database (United States)</li>
          <li><strong>Render</strong> — hosts a standby copy of the application (United States)</li>
          <li><strong>Stripe</strong> — payments and subscriptions</li>
          <li><strong>Resend</strong> — sends account emails (receives your email address)</li>
          <li><strong>Google</strong> — "Sign in with Google", if you choose it</li>
          <li><strong>Discord</strong> — delivers alerts to webhooks you or we configure, operator notifications, and the read-only bot used for journal imports</li>
          <li><strong>Alpaca</strong> — only if you connect it; we read your fills with your keys</li>
          <li>
            <strong>AI providers</strong> — Anthropic, Google (Gemini), OpenAI, xAI, Groq, Together AI and Mistral,
            depending on which is available. They receive the question, screenshot or market context being processed,
            not your account details.
          </li>
        </ul>
        <p>
          Market-data providers (for example Tradier, Yahoo Finance, Alpha Vantage, CoinGecko and options-flow feeds)
          receive only ticker symbols and market queries from our servers, never your personal information.
        </p>
      </Section>

      <Section icon={Clock} title="How Long We Keep It">
        <ul className="list-disc list-inside space-y-2">
          <li>Account, preferences, watchlist and journal: while your account exists, or until you delete them</li>
          <li>Broker keys: until you disconnect the broker, when they are deleted</li>
          <li>Sign-in sessions: up to 7 days</li>
          <li>Waitlist entries and invites: until you join, ask us to remove you, or the waitlist closes</li>
          <li>Usage analytics: currently kept without a fixed limit; we are introducing a maximum and will update this page</li>
          <li>Server logs: rotated automatically as they reach a size limit</li>
          <li>Database backups: kept on our server; they may briefly contain data you deleted until they are replaced</li>
        </ul>
        <p>
          When you ask us to delete your account we do so within 30 days, except records we must keep by law (for
          example billing records held by Stripe) and a record that your request was made and completed.
        </p>
      </Section>

      <Section icon={Lock} title="Data Security">
        <ul className="list-disc list-inside space-y-2">
          <li>HTTPS for all traffic</li>
          <li>Passwords stored only as bcrypt hashes</li>
          <li>HTTP-only session cookies and CSRF protection on account actions</li>
          <li>Broker API keys encrypted at rest with AES-256-GCM</li>
          <li>Rate limiting on sign-in and other sensitive endpoints</li>
          <li>Operator-only access to administrative tools</li>
        </ul>
        <p className="text-[var(--trade-neutral)] text-xs mt-4">
          No security system is impenetrable. We will tell affected users, and authorities, about a breach where the law
          requires it.
        </p>
      </Section>

      <Section icon={Cookie} title="Cookies and Local Storage">
        <p>
          We use only cookies needed to run the service: your sign-in session cookie, a CSRF token and, for the
          operator, an admin sign-in cookie. Your browser's local and session storage hold display settings and the
          random per-tab id used for analytics. We do not use advertising or third-party tracking cookies.
        </p>
      </Section>

      <Section icon={Scale} title="Your Rights">
        <p>Depending on where you live, you can ask us to:</p>
        <ul className="list-disc list-inside space-y-2">
          <li>Tell you what personal information we hold about you and give you a copy</li>
          <li>Correct inaccurate information (you can edit your name in Settings)</li>
          <li>Delete your account and data — <em>Settings › Data &amp; privacy › Request account deletion</em></li>
          <li>Export your journal — <em>Settings › Data &amp; privacy › Export my journal</em> (CSV)</li>
          <li>Stop a particular use of your information, such as usage analytics or a Discord import</li>
        </ul>
        <p>
          Email <Contact /> for anything Settings doesn't cover. We may need to confirm it is you before acting. We will
          not treat you differently for exercising these rights.
        </p>
      </Section>

      <Section icon={Globe} title="Where Data Is Stored, and Age">
        <p>
          QuantEdge is operated from, and stores data in, the United States. If you use it from elsewhere, your
          information is transferred to and processed in the United States.
        </p>
        <p>
          QuantEdge is intended for adults. It is not directed to anyone under 18 and we do not knowingly collect
          information from children. If you believe a child has given us information, contact us and we will delete it.
        </p>
      </Section>

      <Card className="glass-card overflow-visible hover-elevate border-border/50">
        <CardContent className="pt-6 space-y-2 text-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center">
              <Mail className="h-5 w-5 text-white" />
            </div>
            <p className="font-semibold text-lg">Contact and Changes</p>
          </div>
          <p className="text-muted-foreground">
            Questions or requests: <Contact />. When we change this policy we update the date at the top; for material
            changes we will also tell signed-in users.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
