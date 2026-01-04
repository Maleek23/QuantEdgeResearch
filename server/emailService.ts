import { Resend } from 'resend';
import { randomBytes } from 'crypto';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const APP_NAME = 'Quant Edge Labs';
const APP_URL = process.env.APP_URL || 'https://quantedgelabs.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@quantedgelabs.com';

export function generateInviteToken(): string {
  return randomBytes(32).toString('hex');
}

export function getInviteLink(token: string): string {
  return `${APP_URL}/signup?invite=${token}`;
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
      to: email,
      subject: `🎉 You're Invited to ${APP_NAME} Beta!`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Beta Invitation</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 16px; border: 1px solid #334155; overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <div style="font-size: 32px; font-weight: 700; background: linear-gradient(135deg, #06b6d4, #22d3ee); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                ⚡ ${APP_NAME}
              </div>
              <p style="color: #94a3b8; font-size: 14px; margin: 8px 0 0;">Multiple Engines, One Edge</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 20px 40px;">
              <h1 style="color: #f1f5f9; font-size: 28px; font-weight: 600; margin: 0 0 16px; text-align: center;">
                You're Invited! 🚀
              </h1>
              ${tierBadge ? `<div style="text-align: center; margin-bottom: 20px;">${tierBadge}</div>` : ''}
              <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                Congratulations! You've been selected to join the exclusive beta of ${APP_NAME} — 
                an institutional-grade quantitative trading research platform.
              </p>
              ${options?.personalMessage ? `
              <div style="background: #1e293b; border-left: 4px solid #06b6d4; padding: 16px; border-radius: 0 8px 8px 0; margin: 0 0 24px;">
                <p style="color: #94a3b8; font-size: 12px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.5px;">Personal Message</p>
                <p style="color: #e2e8f0; font-size: 14px; margin: 0; font-style: italic;">"${options.personalMessage}"</p>
              </div>
              ` : ''}
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 40px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${inviteLink}" style="display: inline-block; background: linear-gradient(135deg, #06b6d4, #0891b2); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 14px rgba(6, 182, 212, 0.3);">
                      Accept Your Invitation →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Features -->
          <tr>
            <td style="padding: 0 40px 30px;">
              <div style="background: #1e293b; border-radius: 12px; padding: 24px;">
                <p style="color: #f1f5f9; font-size: 14px; font-weight: 600; margin: 0 0 16px;">What you'll get access to:</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #22d3ee;">✓</span>
                      <span style="color: #cbd5e1; font-size: 14px; margin-left: 12px;">AI-Powered Market Analysis (Claude, GPT-4, Gemini)</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #22d3ee;">✓</span>
                      <span style="color: #cbd5e1; font-size: 14px; margin-left: 12px;">Quantitative Signal Engine (RSI, VWAP, ADX)</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #22d3ee;">✓</span>
                      <span style="color: #cbd5e1; font-size: 14px; margin-left: 12px;">Real-Time Chart Analysis & Pattern Recognition</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <span style="color: #22d3ee;">✓</span>
                      <span style="color: #cbd5e1; font-size: 14px; margin-left: 12px;">Professional Trading Journal & Analytics</span>
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>

          <!-- Invite Code Fallback -->
          <tr>
            <td style="padding: 0 40px 30px;">
              <p style="color: #64748b; font-size: 12px; margin: 0; text-align: center;">
                If the button doesn't work, copy this link:<br>
                <span style="color: #06b6d4; word-break: break-all;">${inviteLink}</span>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; border-top: 1px solid #334155; text-align: center;">
              <p style="color: #64748b; font-size: 12px; margin: 0;">
                This invite expires in 7 days. Questions? Join our 
                <a href="https://discord.gg/3QF8QEKkYq" style="color: #06b6d4; text-decoration: none;">Discord community</a>.
              </p>
              <p style="color: #475569; font-size: 11px; margin: 16px 0 0;">
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
      subject: `Welcome to ${APP_NAME}, ${name}! 🎉`,
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
                Welcome to ${APP_NAME}! 🚀
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
