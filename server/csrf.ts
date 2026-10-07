import type { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { logger } from './logger';

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

export function generateCSRFToken(): string {
  return randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  const isProduction = process.env.NODE_ENV === 'production';
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  
  if (!req.cookies[CSRF_COOKIE_NAME]) {
    const token = generateCSRFToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: isProduction && isSecure,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });
  }
  
  next();
}

export function validateCSRF(req: Request, res: Response, next: NextFunction) {
  const safeMethodsRegex = /^(GET|HEAD|OPTIONS)$/i;
  
  if (safeMethodsRegex.test(req.method)) {
    return next();
  }
  
  if (req.path.startsWith('/api/webhooks/')) {
    return next();
  }
  
  if (req.path === '/api/admin/login' || req.path === '/api/admin/verify-code') {
    return next();
  }
  
  if (req.path.startsWith('/api/auth/')) {
    return next();
  }

  // Public waitlist join: unauthenticated, idempotent (dedupe by email) and
  // rate-limited per IP. A missing/stale csrf_token cookie (blocked cookies,
  // privacy browsers, a page open past the cookie's 24 h) answered 403 here —
  // before the handler — so the email was dropped without a trace.
  if (req.method === 'POST' && req.path === '/api/waitlist/join') {
    return next();
  }
  
  // Exempt breakout scanner GET routes (read-only scanning)
  if (req.path.startsWith('/api/breakout')) {
    return next();
  }
  
  // Backtest POST routes require beta access auth, exempt from CSRF but require session
  if (req.path.startsWith('/api/backtest')) {
    return next();
  }
  
  // Exempt the time-on-page update for /api/tracking/pageview/:id — the client
  // sends it with navigator.sendBeacon, which can neither set headers nor use
  // any method but POST. (Only PATCH was exempted, so every beacon — always a
  // POST — died here with 403.) Safe: it only writes a clamped duration onto an
  // existing pageview row.
  if ((req.method === 'PATCH' || req.method === 'POST') && /^\/api\/tracking\/pageview\/[a-f0-9-]+$/.test(req.path)) {
    return next();
  }

  // (The /api/executor/, /api/alpaca/ and /api/portfolio/ exemptions were removed
  // in the 2026-09-30 security review: those routes now require the operator
  // (server/route-guards.ts), and a cookie-authenticated order route must carry
  // the CSRF token like every other write.)

  // Exempt GEX scanner + history archive routes (internal scanner system)
  if (req.path.startsWith('/api/gex-scanner/') || req.path.startsWith('/api/gex-history/')) {
    return next();
  }
  
  const cookieToken = req.cookies[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME] as string;
  
  if (!cookieToken || !headerToken) {
    logger.warn('CSRF validation failed - missing token', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      hasCookie: !!cookieToken,
      hasHeader: !!headerToken,
    });
    return res.status(403).json({ 
      error: 'CSRF validation failed',
      message: 'Missing security token. Please refresh the page and try again.'
    });
  }
  
  if (cookieToken !== headerToken) {
    logger.warn('CSRF validation failed - token mismatch', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
    return res.status(403).json({ 
      error: 'CSRF validation failed',
      message: 'Invalid security token. Please refresh the page and try again.'
    });
  }
  
  next();
}

export function getCSRFToken(req: Request): string | null {
  return req.cookies[CSRF_COOKIE_NAME] || null;
}
