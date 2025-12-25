// Replit Auth Integration using OpenID Connect
// Reference: blueprint:javascript_log_in_with_replit

import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { logger, logError } from "./logger";

const getOidcConfig = memoize(
  async () => {
    // Use default Replit OIDC URL if not specified
    const issuerUrl = process.env.ISSUER_URL || "https://replit.com/oidc";
    return await client.discovery(
      new URL(issuerUrl),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  try {
    await storage.upsertUser({
      id: claims["sub"], // Use Replit user ID as primary key
      email: claims["email"],
      firstName: claims["first_name"],
      lastName: claims["last_name"],
      profileImageUrl: claims["profile_image_url"],
    });
    logger.info('User upserted from Replit Auth', { userId: claims["sub"], email: claims["email"] });
  } catch (error) {
    logError(error as Error, { context: 'upsertUser', userId: claims["sub"] });
  }
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
      logger.info(`Registered Replit Auth strategy for domain: ${domain}`);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    // Use REPLIT_DEV_DOMAIN for correct callback URL in development
    const domain = process.env.REPLIT_DEV_DOMAIN || req.hostname;
    ensureStrategy(domain);
    logger.info('Login initiated', { 
      ip: req.ip, 
      hostname: req.hostname, 
      domain,
      replitDevDomain: process.env.REPLIT_DEV_DOMAIN 
    });
    passport.authenticate(`replitauth:${domain}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    const domain = process.env.REPLIT_DEV_DOMAIN || req.hostname;
    logger.info('Callback received', { ip: req.ip, hostname: req.hostname, domain, query: req.query });
    ensureStrategy(domain);
    passport.authenticate(`replitauth:${domain}`, (err: any, user: any, info: any) => {
      if (err) {
        logger.error('OAuth callback error', { error: err.message, stack: err.stack });
        return res.redirect('/signup?error=auth_failed');
      }
      if (!user) {
        logger.warn('OAuth callback: no user returned', { info });
        return res.redirect('/signup?error=no_user');
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          logger.error('OAuth login error', { error: loginErr.message });
          return res.redirect('/signup?error=login_failed');
        }
        logger.info('OAuth login successful', { userId: user.claims?.sub });
        return res.redirect('/trade-desk');
      });
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    logger.info('Logout initiated', { ip: req.ip });
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user?.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    logger.info('Token refreshed successfully');
    return next();
  } catch (error) {
    logError(error as Error, { context: 'token refresh' });
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
