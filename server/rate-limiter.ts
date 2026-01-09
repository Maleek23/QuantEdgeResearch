import rateLimit from 'express-rate-limit';
import { logger } from './logger';

// General API rate limiter - 100 requests per 15 minutes
export const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // Disable validation warnings in Replit environment
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json({
      error: 'Too many requests',
      message: 'You have exceeded the rate limit. Please try again later.',
      retryAfter: Math.ceil(15 * 60 * 1000 / 1000), // seconds
    });
  },
});

// AI generation rate limiter - 10 requests per 15 minutes (more restrictive due to cost)
export const aiGenerationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'AI generation limit exceeded. Please wait before generating more ideas.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // Disable validation warnings in Replit environment
  handler: (req, res) => {
    logger.warn('AI generation rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json({
      error: 'AI generation limit exceeded',
      message: 'You have exceeded the AI generation limit. Please wait 15 minutes before generating more ideas.',
      retryAfter: Math.ceil(15 * 60 * 1000 / 1000),
    });
  },
});

// Quant generation rate limiter - 20 requests per 15 minutes
export const quantGenerationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Quant generation limit exceeded. Please wait before generating more ideas.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // Disable validation warnings in Replit environment
  handler: (req, res) => {
    logger.warn('Quant generation rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json({
      error: 'Quant generation limit exceeded',
      message: 'You have exceeded the quant generation limit. Please wait before generating more ideas.',
      retryAfter: Math.ceil(15 * 60 * 1000 / 1000),
    });
  },
});

// Market data rate limiter - 60 requests per minute (for real-time price updates)
export const marketDataLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: 'Market data request limit exceeded.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // Disable validation warnings in Replit environment
  handler: (req, res) => {
    logger.warn('Market data rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json({
      error: 'Market data limit exceeded',
      message: 'You have exceeded the market data request limit. Please wait before requesting more data.',
      retryAfter: 60,
    });
  },
});

// Research assistant rate limiter - 20 requests per 15 minutes
export const researchAssistantLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Research assistant limit exceeded. Please wait before asking more questions.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  handler: (req, res) => {
    logger.warn('Research assistant rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json({
      error: 'Research assistant limit exceeded',
      message: 'You have exceeded the research assistant limit. Please wait before asking more questions.',
      retryAfter: Math.ceil(15 * 60 * 1000 / 1000),
    });
  },
});

// Admin endpoints rate limiter - 30 requests per 15 minutes
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Admin request limit exceeded.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // Disable validation warnings in Replit environment
  skipSuccessfulRequests: false,
  handler: (req, res) => {
    logger.warn('Admin rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json({
      error: 'Admin limit exceeded',
      message: 'Too many admin requests. Please wait before trying again.',
      retryAfter: Math.ceil(15 * 60 * 1000 / 1000),
    });
  },
});

// On-demand idea generation limiter - 1 request per 5 minutes per user
export const ideaGenerationOnDemandLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1,
  message: 'Idea generation limit exceeded. Please wait 5 minutes before generating again.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  handler: (req, res) => {
    logger.warn('On-demand idea generation rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json({
      error: 'Generation limit exceeded',
      message: 'You can only generate ideas once every 5 minutes. Please wait and try again.',
      retryAfter: 5 * 60, // 5 minutes in seconds
    });
  },
});

// Auth rate limiter - Strict limits to prevent brute force attacks
// 5 login attempts per 15 minutes per IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many login attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  skipSuccessfulRequests: true, // Only count failed attempts
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded - potential brute force', {
      ip: req.ip,
      path: req.path,
      email: req.body?.email,
    });
    res.status(429).json({
      error: 'Too many login attempts',
      message: 'You have exceeded the login attempt limit. Please wait 15 minutes before trying again.',
      retryAfter: Math.ceil(15 * 60 * 1000 / 1000),
    });
  },
});

// Password reset rate limiter - 3 requests per hour to prevent abuse
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: 'Too many password reset requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  handler: (req, res) => {
    logger.warn('Password reset rate limit exceeded', {
      ip: req.ip,
      email: req.body?.email,
    });
    res.status(429).json({
      error: 'Too many reset requests',
      message: 'You have exceeded the password reset limit. Please try again in an hour.',
      retryAfter: Math.ceil(60 * 60 * 1000 / 1000),
    });
  },
});

// Tracking/analytics rate limiter - 120 requests per minute per IP
// Allows normal page navigation but prevents abuse from CSRF-exempt endpoints
export const trackingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 2 requests per second on average
  message: 'Tracking request limit exceeded.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  handler: (req, res) => {
    logger.warn('Tracking rate limit exceeded - potential abuse', {
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json({
      error: 'Tracking limit exceeded',
      message: 'Too many tracking requests.',
      retryAfter: 60,
    });
  },
});
