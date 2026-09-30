import type { Request, Response, NextFunction } from 'express';

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Only enable HSTS in production to prevent localhost access issues
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Don't advertise the framework (Express sets this before any middleware runs).
  res.removeHeader('X-Powered-By');

  // Clickjacking: only this origin may frame the app. Replit's preview frame is
  // allowed only when actually running on Replit (REPL_ID set) — production on
  // the droplet has no reason to be framed by replit.com.
  const onReplit = !!process.env.REPL_ID?.trim();
  if (!onReplit) res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' wss: https:",
      onReplit ? "frame-ancestors 'self' https://*.replit.com https://replit.com" : "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  next();
}
