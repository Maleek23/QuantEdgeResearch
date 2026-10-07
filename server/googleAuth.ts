import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import type { Express } from "express";
import { storage } from "./storage";
import { logger, logError } from "./logger";
import { googleNewUserTier, saveSession } from "./auth-hardening";
import { isAccountDisabled, safeInviteTier } from "./admin-ops";

// Whitelist of approved admin/VIP emails that bypass invite requirement
function getApprovedEmails(): string[] {
  const envEmails = process.env.APPROVED_EMAILS || '';
  return envEmails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

function isEmailApproved(email: string): boolean {
  const approved = getApprovedEmails();
  return approved.includes(email.toLowerCase());
}

export async function setupGoogleAuth(app: Express) {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientID || !clientSecret) {
    logger.warn("Google OAuth not configured - GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing");
    return;
  }

  const callbackURL = process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/auth/google/callback`
    : "/api/auth/google/callback";

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL,
        scope: ["profile", "email"],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          const firstName = profile.name?.givenName || profile.displayName?.split(" ")[0];
          const lastName = profile.name?.familyName || profile.displayName?.split(" ").slice(1).join(" ");
          const profileImageUrl = profile.photos?.[0]?.value;

          if (!email) {
            logger.error("Google OAuth: no email returned from Google");
            return done(new Error("Email is required from Google account"));
          }

          // Check if user is whitelisted (admin/VIP)
          const emailLower = email.toLowerCase();
          const isWhitelisted = isEmailApproved(emailLower);
          
          // Check if user already exists (returning user). Also match the Google id, so
          // a returning user whose Google email changed is not re-created by upsertUser
          // (which would overwrite their tier and beta access).
          const existingUser =
            (await storage.getUserByEmail(emailLower)) || (await storage.getUser(`google_${profile.id}`)) || null;
          
          // A disabled account (admin hub) cannot sign in.
          if (existingUser && isAccountDisabled(existingUser)) {
            logger.warn("Google OAuth: disabled account refused", { userId: existingUser.id });
            return done(new Error("ACCOUNT_DISABLED"));
          }

          // Check if user has a valid beta invite
          const invite = await storage.getBetaInviteByEmail(emailLower);
          // For login gate: allow pending, sent, or redeemed invites (not revoked/expired)
          const hasValidInviteForLogin = invite && invite.status !== 'revoked' && invite.status !== 'expired';
          // For granting beta access: pending OR sent invites can grant access
          const hasPendingInvite = invite && (invite.status === 'pending' || invite.status === 'sent');
          
          // Allow access if: whitelisted, existing user, or has valid invite (including redeemed - they already have an account)
          if (!isWhitelisted && !existingUser && !hasValidInviteForLogin) {
            // Capture, don't drop: a Google sign-in without an invite is a beta
            // request. Before 2026-10-07 this email only reached the log.
            const { captureLostSignup } = await import("./waitlist-capture");
            const captured = await captureLostSignup(emailLower, "google");
            logger.warn("Google OAuth: user not authorized for beta", { 
              email: emailLower,
              hasInvite: !!invite,
              inviteStatus: invite?.status,
              waitlist: captured.status,
            });
            const onList = captured.status === "created" || captured.status === "exists"
              || (captured.status === "error" && captured.savedToFallback);
            return done(new Error(onList ? "INVITE_REQUIRED_WAITLISTED" : "INVITE_REQUIRED"));
          }

          // If user has a pending invite, redeem it now
          let inviteRedeemed = false;
          if (hasPendingInvite && invite.token) {
            try {
              await storage.redeemBetaInvite(invite.token);
              inviteRedeemed = true;
              logger.info("Beta invite redeemed via Google OAuth", { email: emailLower });
            } catch (redeemError) {
              logger.warn("Failed to redeem invite, continuing with login", { email: emailLower, error: redeemError });
            }
          }

          let user;
          if (existingUser) {
            // Existing user - update profile info but preserve hasBetaAccess
            await storage.updateUser(existingUser.id, {
              email,
              firstName: firstName || null,
              lastName: lastName || null,
              profileImageUrl: profileImageUrl || null,
            });
            // Refresh user data
            user = await storage.getUser(existingUser.id) || existingUser;
            
            // Sign-in never changes a tier. (It used to upgrade every free-tier beta
            // user to pro on every Google login; tiers are set at account creation,
            // by invite redemption, or by billing.)
          } else {
            // New user - only grant beta access for: whitelisted OR just-redeemed invite
            // Do NOT grant for already-redeemed invites (those users should already exist)
            const shouldGrantBetaAccess = isWhitelisted || inviteRedeemed;
            user = await storage.upsertUser({
              id: `google_${profile.id}`,
              email,
              firstName: firstName || null,
              lastName: lastName || null,
              profileImageUrl: profileImageUrl || null,
              hasBetaAccess: shouldGrantBetaAccess,
              // first creation only: Free, unless the just-redeemed invite carries an explicit free/advanced/pro override
              subscriptionTier: (inviteRedeemed && safeInviteTier(invite?.tierOverride)) || googleNewUserTier(shouldGrantBetaAccess),
            });
            
            // If invite was redeemed, also set betaInviteId
            if (inviteRedeemed && invite) {
              await storage.updateUser(user.id, { betaInviteId: invite.id });
            }
          }

          logger.info("Google OAuth login successful", { 
            userId: user.id, 
            email: user.email,
            googleId: profile.id,
            accessType: isWhitelisted ? 'whitelist' : existingUser ? 'returning' : 'invite'
          });

          return done(null, {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            profileImageUrl: user.profileImageUrl,
            claims: {
              sub: user.id,
              email: user.email,
              first_name: user.firstName,
              last_name: user.lastName,
            },
          });
        } catch (error) {
          logError(error as Error, { context: "google-oauth", googleId: profile.id });
          return done(error as Error);
        }
      }
    )
  );

  app.get("/api/auth/google", (req, res, next) => {
    logger.info("Google OAuth initiated", { ip: req.ip });
    passport.authenticate("google", {
      scope: ["profile", "email"],
    })(req, res, next);
  });

  app.get("/api/auth/google/callback", (req, res, next) => {
    passport.authenticate("google", (err: any, user: any) => {
      if (err) {
        logger.error("Google OAuth callback error", { error: err.message });
        // Handle invite required error specially
        if (err.message === "INVITE_REQUIRED_WAITLISTED") {
          return res.redirect("/login?error=invite_waitlisted");
        }
        if (err.message === "INVITE_REQUIRED") {
          return res.redirect("/login?error=invite_required");
        }
        if (err.message === "ACCOUNT_DISABLED") {
          return res.redirect("/login?error=account_disabled");
        }
        return res.redirect("/login?error=google_auth_failed");
      }
      if (!user) {
        logger.warn("Google OAuth: no user returned");
        return res.redirect("/login?error=no_user");
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          logger.error("Google OAuth login error", { error: loginErr.message });
          return res.redirect("/login?error=login_failed");
        }
        
        // req.logIn (passport 0.7) has already regenerated the session id, so a
        // pre-login id planted by an attacker is dropped (session fixation). Set
        // userId on that fresh session and persist it before redirecting.
        (req.session as any).userId = user.id;
        saveSession(req)
          .then(() => {
            logger.info("Google OAuth login complete", { userId: user.id });
            // Last-login for the admin hub (password logins already write one).
            void storage.createLoginRecord({
              userId: user.id, ipAddress: req.ip || undefined, userAgent: req.headers['user-agent'] || '',
              sessionId: req.sessionID, authMethod: 'google',
            }).catch(() => { /* analytics only */ });
            res.redirect("/trade-desk");
          })
          .catch((saveErr) => {
            logger.error("Google OAuth session save error", { error: (saveErr as Error)?.message });
            res.redirect("/login?error=login_failed");
          });
      });
    })(req, res, next);
  });

  logger.info("Google OAuth configured successfully");
}
