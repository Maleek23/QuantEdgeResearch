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
  
  <!-- Main wrapper - minimal top padding -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #050b16; padding: 16px 20px;">
    <tr>
      <td align="center">
        
        <!-- Main email card -->
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background: linear-gradient(180deg, #0a1628 0%, #050b16 100%); border-radius: 16px; border: 1px solid rgba(6, 182, 212, 0.15); overflow: hidden;">
          
          <!-- Logo Header - First thing visible -->
          <tr>
            <td style="padding: 32px 40px 20px; text-align: center;">
              <!-- Logo Image -->
              <img src="https://i.imgur.com/7QKqYzL.png" alt="Quant Edge Labs" width="120" height="120" style="display: block; margin: 0 auto 16px; max-width: 120px;">
              <!-- Brand Name - Large and prominent -->
              <h1 style="margin: 0 0 4px; font-size: 32px; font-weight: 800; letter-spacing: -1px; color: #22d3ee;">
                QUANT EDGE
              </h1>
              <p style="color: #3b82f6; font-size: 18px; font-weight: 600; margin: 0 0 12px; letter-spacing: 6px;">LABS</p>
              <p style="color: #64748b; font-size: 12px; margin: 0; letter-spacing: 1px;">Multiple Engines, One Edge</p>
            </td>
          </tr>

          <!-- Exclusive Badge -->
          <tr>
            <td style="padding: 0 40px 20px; text-align: center;">
              <span style="display: inline-block; background: linear-gradient(135deg, rgba(6, 182, 212, 0.15) 0%, rgba(59, 130, 246, 0.1) 100%); border: 1px solid rgba(6, 182, 212, 0.25); color: #22d3ee; padding: 10px 24px; border-radius: 50px; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">Exclusive Beta Access</span>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 0 40px 24px;">
              <h2 style="color: #f1f5f9; font-size: 28px; font-weight: 700; margin: 0 0 16px; text-align: center;">
                You're Invited
              </h2>
              
              ${tierBadge ? `<div style="text-align: center; margin-bottom: 16px;">${tierBadge}</div>` : ''}
              
              <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin: 0; text-align: center;">
                You've been selected to join the exclusive beta of our institutional-grade quantitative trading research platform.
              </p>
              
              ${options?.personalMessage ? `
              <div style="background: rgba(6, 182, 212, 0.08); border-left: 3px solid #06b6d4; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 20px 0 0;">
                <p style="color: #64748b; font-size: 10px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Personal Note</p>
                <p style="color: #e2e8f0; font-size: 14px; margin: 0; font-style: italic;">"${options.personalMessage}"</p>
              </div>
              ` : ''}
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 40px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${inviteLink}" style="display: inline-block; background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%); color: #ffffff; text-decoration: none; padding: 16px 44px; border-radius: 10px; font-size: 15px; font-weight: 600; letter-spacing: 0.5px; box-shadow: 0 6px 24px rgba(6, 182, 212, 0.35);">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Features - Compact -->
          <tr>
            <td style="padding: 0 40px 24px;">
              <div style="background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(51, 65, 85, 0.4); border-radius: 12px; padding: 20px;">
                <p style="color: #94a3b8; font-size: 11px; font-weight: 600; margin: 0 0 14px; text-transform: uppercase; letter-spacing: 1px; text-align: center;">What You Get</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 6px 0; color: #cbd5e1; font-size: 13px;">
                      <span style="color: #22d3ee; margin-right: 8px;">&#10003;</span> AI Analysis (Claude, GPT-4, Gemini)
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #cbd5e1; font-size: 13px;">
                      <span style="color: #22d3ee; margin-right: 8px;">&#10003;</span> Quantitative Signals (RSI, VWAP, ADX)
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #cbd5e1; font-size: 13px;">
                      <span style="color: #22d3ee; margin-right: 8px;">&#10003;</span> Real-Time Chart Pattern Detection
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #cbd5e1; font-size: 13px;">
                      <span style="color: #22d3ee; margin-right: 8px;">&#10003;</span> Professional Trading Journal
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>

          <!-- Fallback Link -->
          <tr>
            <td style="padding: 0 40px 20px; text-align: center;">
              <p style="color: #475569; font-size: 11px; margin: 0;">
                Can't click? Copy: <span style="color: #06b6d4; word-break: break-all;">${inviteLink}</span>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background: rgba(0, 0, 0, 0.15); border-top: 1px solid rgba(51, 65, 85, 0.25);">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <p style="color: #64748b; font-size: 12px; margin: 0 0 8px;">
                      Expires in <span style="color: #22d3ee;">7 days</span> &bull; 
                      <a href="https://discord.gg/3QF8QEKkYq" style="color: #06b6d4; text-decoration: none;">Join Discord</a>
                    </p>
                    <p style="color: #334155; font-size: 10px; margin: 0;">
                      ${APP_NAME} &bull; Educational & Research Only
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
