import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { logger } from './logger';
import { safeSecretEqual } from './auth-hardening';

// Require JWT_SECRET - fail fast if not configured
function getJWTSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('CRITICAL: JWT_SECRET or SESSION_SECRET environment variable must be set for admin authentication');
  }
  return secret;
}

const JWT_SECRET = getJWTSecret();

/**
 * Admin hub session (2026-10-07 fix: the hub re-asked for code + password on every click).
 *
 *   access code → POST /api/admin/verify-code  sets a 5-minute httpOnly ticket
 *                 (admin_code_ok, path /api/admin) — the password step now
 *                 REQUIRES it, so the code is a server-side factor, not a UI step.
 *   password    → POST /api/admin/login         sets admin_token: httpOnly,
 *                 Secure (prod), SameSite=Strict, path /api, 8 h idle.
 *   every admin request slides the cookie (re-issued at most every 5 min) up to
 *   an absolute 24 h from the password step; then the code + password again.
 *   "Lock admin" → POST /api/admin/logout clears it (both the /api and the
 *   legacy / path).
 *
 * Path /api, not /api/admin: ~60 operator routes outside /api/admin (cache,
 * scanners, signal-weights, …) take the same requireAdminJWT and two of them
 * are buttons in the app. The cookie still never rides on page or asset loads.
 */
export const ADMIN_COOKIE = 'admin_token';
export const ADMIN_COOKIE_PATH = '/api';
export const ADMIN_CODE_COOKIE = 'admin_code_ok';
export const ADMIN_CODE_COOKIE_PATH = '/api/admin';
export const ADMIN_IDLE_MS = 8 * 60 * 60 * 1000;
export const ADMIN_ABSOLUTE_MS = 24 * 60 * 60 * 1000;
export const ADMIN_REFRESH_AFTER_MS = 5 * 60 * 1000;
export const ADMIN_CODE_TICKET_MS = 5 * 60 * 1000;

export interface AdminTokenPayload {
  isAdmin: true;
  typ?: 'admin';
  /** Unix seconds of the password step — the absolute cap counts from here. */
  authTime?: number;
  iat?: number;
  exp?: number;
}

// Generate JWT token for admin (authTime: seconds; a sliding refresh keeps the original)
export function generateAdminToken(authTime: number = Math.floor(Date.now() / 1000)): string {
  const payload: AdminTokenPayload = { isAdmin: true, typ: 'admin', authTime };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: Math.floor(ADMIN_IDLE_MS / 1000) });
}

// Verify JWT token: signature + idle expiry (exp) + the absolute cap from authTime.
export function verifyAdminToken(token: string, now: number = Date.now()): AdminTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AdminTokenPayload & { typ?: string };
    if (!decoded || decoded.isAdmin !== true) return null;
    if (decoded.typ !== undefined && decoded.typ !== 'admin') return null;
    const authTime = Number(decoded.authTime ?? decoded.iat ?? 0);
    if (!Number.isFinite(authTime) || authTime <= 0) return null;
    if (now - authTime * 1000 > ADMIN_ABSOLUTE_MS) return null;
    return decoded;
  } catch (error) {
    logger.warn('Invalid JWT token', { error: error instanceof Error ? error.message : 'Unknown error' });
    return null;
  }
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: ADMIN_COOKIE_PATH,
    maxAge: ADMIN_IDLE_MS,
  };
}

export function setAdminCookie(res: Response, token: string): void {
  res.cookie(ADMIN_COOKIE, token, adminCookieOptions());
}

/** Clears the session cookie on its path and on the legacy path '/' (pre-2026-10-07 logins). */
export function clearAdminCookies(res: Response): void {
  const base = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const };
  res.clearCookie(ADMIN_COOKIE, { ...base, path: ADMIN_COOKIE_PATH });
  res.clearCookie(ADMIN_COOKIE, { path: '/' });
  res.clearCookie(ADMIN_CODE_COOKIE, { ...base, path: ADMIN_CODE_COOKIE_PATH });
}

/** Session window for the client: idle expiry (sliding) and the absolute cap. */
export function adminSessionInfo(payload: AdminTokenPayload): { expiresAt: string; absoluteExpiresAt: string } {
  const authTime = Number(payload.authTime ?? payload.iat ?? 0) * 1000;
  const exp = Number(payload.exp ?? 0) * 1000;
  return { expiresAt: new Date(exp).toISOString(), absoluteExpiresAt: new Date(authTime + ADMIN_ABSOLUTE_MS).toISOString() };
}

// ── Access-code ticket (step 1 → step 2) ───────────────────────────────────
export function generateAdminCodeTicket(): string {
  return jwt.sign({ typ: 'admin-code' }, JWT_SECRET, { expiresIn: Math.floor(ADMIN_CODE_TICKET_MS / 1000) });
}

export function verifyAdminCodeTicket(ticket: unknown): boolean {
  if (typeof ticket !== 'string' || !ticket) return false;
  try {
    const d = jwt.verify(ticket, JWT_SECRET) as { typ?: string };
    return d?.typ === 'admin-code';
  } catch {
    return false;
  }
}

export function setAdminCodeTicket(res: Response): void {
  res.cookie(ADMIN_CODE_COOKIE, generateAdminCodeTicket(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: ADMIN_CODE_COOKIE_PATH,
    maxAge: ADMIN_CODE_TICKET_MS,
  });
}

// Middleware to require admin authentication via JWT
export function requireAdminJWT(req: Request, res: Response, next: NextFunction) {
  // Check for JWT in cookie first (most secure)
  let token = req.cookies?.admin_token;
  
  // Fallback to Authorization header for API clients
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }
  
  if (!token) {
    logger.warn('Admin access denied - no token provided', {
      ip: req.ip,
      path: req.path,
    });
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Please log in to access admin features.'
    });
  }
  
  const decoded = verifyAdminToken(token);
  
  if (!decoded || !decoded.isAdmin) {
    logger.warn('Admin access denied - invalid token', {
      ip: req.ip,
      path: req.path,
    });
    return res.status(403).json({ 
      error: 'Access denied',
      message: 'Invalid or expired admin token.'
    });
  }
  
  // Sliding session: a cookie token older than ADMIN_REFRESH_AFTER_MS is
  // re-issued with a fresh 8 h idle window and the SAME authTime (absolute cap
  // unchanged). Bearer tokens are API clients — never re-issued.
  if (req.cookies?.[ADMIN_COOKIE] === token) {
    const issuedMs = Number(decoded.iat ?? 0) * 1000;
    if (Date.now() - issuedMs > ADMIN_REFRESH_AFTER_MS) {
      const authTime = Number(decoded.authTime ?? decoded.iat);
      try { setAdminCookie(res, generateAdminToken(authTime)); } catch { /* keep the current cookie */ }
    }
  }
  res.locals.adminSession = decoded;
  next();
}

// Legacy middleware for backward compatibility (accepts password OR JWT)
export function requireAdmin(req: Request, res: Response, next: Function) {
  // Try JWT first
  const token = req.cookies?.admin_token || 
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);
  
  if (token) {
    const decoded = verifyAdminToken(token);
    if (decoded && decoded.isAdmin) {
      return next();
    }
  }
  
  // Fallback to password-based auth (legacy - will be deprecated)
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    logger.error('CRITICAL: ADMIN_PASSWORD environment variable not set');
    return res.status(500).json({ error: 'Server configuration error - admin authentication unavailable' });
  }
  
  const providedPassword = req.headers['x-admin-password'] || req.body?.password;
  
  if (safeSecretEqual(providedPassword, adminPassword)) { // constant-time
    logger.info('Admin authenticated via legacy password method', {
      ip: req.ip,
      path: req.path,
    });
    return next();
  }
  
  logger.warn('Admin access denied', {
    ip: req.ip,
    path: req.path,
  });
  
  res.status(403).json({ error: "Admin access denied" });
}
