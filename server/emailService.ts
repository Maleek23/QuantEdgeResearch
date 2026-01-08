import { Resend } from 'resend';
import { randomBytes } from 'crypto';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const APP_NAME = 'Quant Edge Labs';
const APP_URL = process.env.APP_URL || 'https://quantedgelabs.net';
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';

export function generateInviteToken(): string {
  return randomBytes(32).toString('hex');
}

export function getInviteLink(token: string): string {
  return `${APP_URL}/join-beta?code=${token}`;
}

export async function sendBetaInviteEmail(
  email: string,
  token: string,
  options?: {
    tierOverride?: string;
    personalMessage?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn('[Email] Resend not configured - RESEND_API_KEY missing');
    return { success: false, error: 'Email service not configured' };
  }

  const inviteLink = getInviteLink(token);
  const tierBadge = options?.tierOverride 
    ? `<span style="background: linear-gradient(135deg, #06b6d4, #3b82f6); color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase;">${options.tierOverride} Access</span>`
    : '';

  try {
    const { data, error } = await resend.emails.send({
      from: `${APP_NAME} <${FROM_EMAIL}>`,
      replyTo: 'support@quantedgelabs.net',
      to: email,
      subject: `Your ${APP_NAME} Beta Invitation`,
      text: `You've been invited to join ${APP_NAME}!

Congratulations! You've been selected to join the exclusive beta of ${APP_NAME} — an institutional-grade quantitative trading research platform.

${options?.personalMessage ? `Personal Message: "${options.personalMessage}"\n\n` : ''}
Accept your invitation here: ${inviteLink}

What you'll get access to:
- AI-Powered Market Analysis (Claude, GPT-4, Gemini)
- Quantitative Signal Engine (RSI, VWAP, ADX)
- Real-Time Chart Analysis & Pattern Recognition
- Professional Trading Journal & Analytics

This invite expires in 7 days. Questions? Join our Discord community at https://discord.gg/3QF8QEKkYq

${APP_NAME} - For Educational & Research Purposes Only
`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Beta Invitation - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #050b16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  
  <!-- Outer wrapper with floating bubble effect -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(180deg, #050b16 0%, #0a1628 50%, #050b16 100%); padding: 40px 20px; position: relative;">
    <tr>
      <td align="center" style="position: relative;">
        
        <!-- Decorative bubbles (static circles) -->
        <div style="position: absolute; top: 20px; left: 10%; width: 80px; height: 80px; background: radial-gradient(circle, rgba(6, 182, 212, 0.15) 0%, rgba(6, 182, 212, 0.05) 50%, transparent 70%); border-radius: 50%;"></div>
        <div style="position: absolute; top: 100px; right: 15%; width: 120px; height: 120px; background: radial-gradient(circle, rgba(34, 211, 238, 0.12) 0%, rgba(34, 211, 238, 0.04) 50%, transparent 70%); border-radius: 50%;"></div>
        <div style="position: absolute; bottom: 80px; left: 5%; width: 60px; height: 60px; background: radial-gradient(circle, rgba(6, 182, 212, 0.18) 0%, rgba(6, 182, 212, 0.06) 50%, transparent 70%); border-radius: 50%;"></div>
        <div style="position: absolute; bottom: 40px; right: 8%; width: 100px; height: 100px; background: radial-gradient(circle, rgba(34, 211, 238, 0.1) 0%, rgba(34, 211, 238, 0.03) 50%, transparent 70%); border-radius: 50%;"></div>
        
        <!-- Main email card with glassmorphism effect -->
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-radius: 24px; border: 1px solid rgba(6, 182, 212, 0.2); overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(6, 182, 212, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05);">
          
          <!-- Logo Header with glow effect -->
          <tr>
            <td style="padding: 48px 40px 24px; text-align: center; background: linear-gradient(180deg, rgba(6, 182, 212, 0.08) 0%, transparent 100%);">
              <!-- Logo Mark -->
              <div style="width: 72px; height: 72px; margin: 0 auto 20px; background: linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #0e7490 100%); border-radius: 18px; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 40px rgba(6, 182, 212, 0.4), 0 0 0 1px rgba(6, 182, 212, 0.3);">
                <table cellpadding="0" cellspacing="0" style="width: 72px; height: 72px;">
                  <tr>
                    <td align="center" valign="middle" style="background: linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #0e7490 100%); border-radius: 18px;">
                      <span style="font-size: 32px; font-weight: 800; color: #ffffff; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">Q</span>
                    </td>
                  </tr>
                </table>
              </div>
              <!-- Brand Name with gradient -->
              <h1 style="margin: 0 0 8px; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                <span style="background: linear-gradient(135deg, #22d3ee 0%, #06b6d4 50%, #0891b2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Quant Edge Labs</span>
              </h1>
              <p style="color: #64748b; font-size: 13px; margin: 0; letter-spacing: 2px; text-transform: uppercase;">Multiple Engines, One Edge</p>
            </td>
          </tr>

          <!-- Divider with glow -->
          <tr>
            <td style="padding: 0 40px;">
              <div style="height: 1px; background: linear-gradient(90deg, transparent 0%, rgba(6, 182, 212, 0.5) 50%, transparent 100%);"></div>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 40px 40px 32px;">
              <!-- Exclusive Badge -->
              <div style="text-align: center; margin-bottom: 24px;">
                <span style="display: inline-block; background: linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(34, 211, 238, 0.1) 100%); border: 1px solid rgba(6, 182, 212, 0.3); color: #22d3ee; padding: 8px 20px; border-radius: 50px; font-size: 12px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">Exclusive Beta Access</span>
              </div>
              
              <h2 style="color: #f1f5f9; font-size: 32px; font-weight: 700; margin: 0 0 20px; text-align: center; letter-spacing: -0.5px;">
                You're Invited
              </h2>
              
              ${tierBadge ? `<div style="text-align: center; margin-bottom: 24px;">${tierBadge}</div>` : ''}
              
              <p style="color: #94a3b8; font-size: 16px; line-height: 1.7; margin: 0 0 32px; text-align: center;">
                Congratulations! You've been selected to join the exclusive beta of our institutional-grade quantitative trading research platform.
              </p>
              
              ${options?.personalMessage ? `
              <div style="background: linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(6, 182, 212, 0.05) 100%); border-left: 3px solid #06b6d4; padding: 20px 24px; border-radius: 0 12px 12px 0; margin: 0 0 32px;">
                <p style="color: #64748b; font-size: 11px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Personal Note</p>
                <p style="color: #e2e8f0; font-size: 15px; margin: 0; font-style: italic; line-height: 1.6;">"${options.personalMessage}"</p>
              </div>
              ` : ''}
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 40px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${inviteLink}" style="display: inline-block; background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%); color: #ffffff; text-decoration: none; padding: 18px 48px; border-radius: 12px; font-size: 16px; font-weight: 600; letter-spacing: 0.5px; box-shadow: 0 8px 30px rgba(6, 182, 212, 0.4), 0 0 0 1px rgba(6, 182, 212, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2);">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Features Grid -->
          <tr>
            <td style="padding: 0 40px 40px;">
              <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(51, 65, 85, 0.5); border-radius: 16px; padding: 28px; backdrop-filter: blur(10px);">
                <p style="color: #f1f5f9; font-size: 13px; font-weight: 600; margin: 0 0 20px; text-transform: uppercase; letter-spacing: 1px; text-align: center;">Platform Features</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 12px 0; border-bottom: 1px solid rgba(51, 65, 85, 0.3);">
                      <table cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="width: 32px; vertical-align: top;">
                            <div style="width: 24px; height: 24px; background: linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(6, 182, 212, 0.1)); border-radius: 6px; text-align: center; line-height: 24px;">
                              <span style="color: #22d3ee; font-size: 14px;">&#10003;</span>
                            </div>
                          </td>
                          <td style="padding-left: 12px;">
                            <span style="color: #e2e8f0; font-size: 14px; font-weight: 500;">AI-Powered Analysis</span>
                            <span style="color: #64748b; font-size: 13px;"> — Claude, GPT-4, Gemini</span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; border-bottom: 1px solid rgba(51, 65, 85, 0.3);">
                      <table cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="width: 32px; vertical-align: top;">
                            <div style="width: 24px; height: 24px; background: linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(6, 182, 212, 0.1)); border-radius: 6px; text-align: center; line-height: 24px;">
                              <span style="color: #22d3ee; font-size: 14px;">&#10003;</span>
                            </div>
                          </td>
                          <td style="padding-left: 12px;">
                            <span style="color: #e2e8f0; font-size: 14px; font-weight: 500;">Quantitative Signals</span>
                            <span style="color: #64748b; font-size: 13px;"> — RSI, VWAP, ADX</span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; border-bottom: 1px solid rgba(51, 65, 85, 0.3);">
                      <table cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="width: 32px; vertical-align: top;">
                            <div style="width: 24px; height: 24px; background: linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(6, 182, 212, 0.1)); border-radius: 6px; text-align: center; line-height: 24px;">
                              <span style="color: #22d3ee; font-size: 14px;">&#10003;</span>
                            </div>
                          </td>
                          <td style="padding-left: 12px;">
                            <span style="color: #e2e8f0; font-size: 14px; font-weight: 500;">Chart Pattern Recognition</span>
                            <span style="color: #64748b; font-size: 13px;"> — Real-time detection</span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0;">
                      <table cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="width: 32px; vertical-align: top;">
                            <div style="width: 24px; height: 24px; background: linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(6, 182, 212, 0.1)); border-radius: 6px; text-align: center; line-height: 24px;">
                              <span style="color: #22d3ee; font-size: 14px;">&#10003;</span>
                            </div>
                          </td>
                          <td style="padding-left: 12px;">
                            <span style="color: #e2e8f0; font-size: 14px; font-weight: 500;">Trading Journal</span>
                            <span style="color: #64748b; font-size: 13px;"> — Performance analytics</span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>

          <!-- Invite Link Fallback -->
          <tr>
            <td style="padding: 0 40px 32px;">
              <div style="background: rgba(51, 65, 85, 0.2); border-radius: 12px; padding: 16px 20px; text-align: center;">
                <p style="color: #64748b; font-size: 12px; margin: 0 0 8px;">Can't click the button? Copy this link:</p>
                <p style="color: #06b6d4; font-size: 12px; margin: 0; word-break: break-all; font-family: monospace;">${inviteLink}</p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 28px 40px; background: rgba(0, 0, 0, 0.2); border-top: 1px solid rgba(51, 65, 85, 0.3);">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <p style="color: #64748b; font-size: 13px; margin: 0 0 12px;">
                      This invite expires in <span style="color: #22d3ee; font-weight: 600;">7 days</span>
                    </p>
                    <p style="color: #475569; font-size: 12px; margin: 0 0 16px;">
                      Questions? Join our <a href="https://discord.gg/3QF8QEKkYq" style="color: #06b6d4; text-decoration: none; font-weight: 500;">Discord community</a>
                    </p>
                    <div style="height: 1px; background: linear-gradient(90deg, transparent 0%, rgba(51, 65, 85, 0.5) 50%, transparent 100%); margin: 0 0 16px;"></div>
                    <p style="color: #334155; font-size: 11px; margin: 0;">
                      ${APP_NAME} &bull; For Educational & Research Purposes Only
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
    });

    if (error) {
      console.error('[Email] Failed to send invite:', error);
      return { success: false, error: error.message };
    }

    console.log('[Email] Invite sent successfully:', data?.id);
    return { success: true };
  } catch (err) {
    console.error('[Email] Error sending invite:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function sendWelcomeEmail(
  email: string,
  firstName?: string
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn('[Email] Resend not configured - RESEND_API_KEY missing');
    return { success: false, error: 'Email service not configured' };
  }

  const name = firstName || 'Trader';

  try {
    const { data, error } = await resend.emails.send({
      from: `${APP_NAME} <${FROM_EMAIL}>`,
      to: email,
      subject: `Welcome to ${APP_NAME}, ${name}!`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 16px; border: 1px solid #334155;">
          
          <tr>
            <td style="padding: 40px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: #22d3ee; margin-bottom: 16px;">
                Welcome to ${APP_NAME}!
              </div>
              <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                Hey ${name}, you're officially part of the beta! We're excited to have you on board.
              </p>
              <a href="${APP_URL}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #06b6d4, #0891b2); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                Go to Dashboard →
              </a>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 40px 40px;">
              <div style="background: #1e293b; border-radius: 12px; padding: 20px;">
                <p style="color: #f1f5f9; font-size: 14px; font-weight: 600; margin: 0 0 12px;">Quick Start:</p>
                <p style="color: #94a3b8; font-size: 14px; margin: 0;">
                  1. Explore the <strong style="color: #22d3ee;">Trade Desk</strong> for AI-powered research<br>
                  2. Check out <strong style="color: #22d3ee;">Chart Analysis</strong> for pattern recognition<br>
                  3. Join our <a href="https://discord.gg/3QF8QEKkYq" style="color: #22d3ee;">Discord</a> for community support
                </p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding: 24px 40px; border-top: 1px solid #334155; text-align: center;">
              <p style="color: #475569; font-size: 11px; margin: 0;">
                ${APP_NAME} • For Educational & Research Purposes Only
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
    });

    if (error) {
      console.error('[Email] Failed to send welcome email:', error);
      return { success: false, error: error.message };
    }

    console.log('[Email] Welcome email sent:', data?.id);
    return { success: true };
  } catch (err) {
    console.error('[Email] Error sending welcome email:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export function isEmailServiceConfigured(): boolean {
  return !!resend;
}
