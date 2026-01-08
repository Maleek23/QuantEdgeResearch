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
  
  if (!req.cookies[CSRF_COOKIE_NAME]) {
    const token = generateCSRFToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'strict',
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
  
  // Exempt breakout scanner GET routes (read-only scanning)
  if (req.path.startsWith('/api/breakout')) {
    return next();
  }
  
  // Backtest POST routes require beta access auth, exempt from CSRF but require session
  if (req.path.startsWith('/api/backtest')) {
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
