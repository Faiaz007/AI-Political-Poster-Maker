import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import type { Request } from 'express';

const WINDOW_MINUTES = 15;
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;

const shared: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Auth endpoints are keyed by IP + submitted identity so one user hammering
  // login cannot exhaust the budget of everyone behind the same NAT gateway.
  skipSuccessfulRequests: false,
};

const message = (text: string) => ({ success: false, message: text });

/**
 * Prefers the authenticated user id and falls back to the IP.
 *
 * This matters for this product specifically: mobile carriers in Bangladesh put
 * very many subscribers behind a single NAT address, so an IP-keyed quota would
 * let one user exhaust the budget for an entire neighbourhood. The IP is still
 * used for unauthenticated traffic, where there is no user id to trust.
 */
const userOrIpKey = (req: Request): string => {
  const userId = req.user?.id;
  if (userId) return `u:${userId}`;
  return ipKeyGenerator(req.ip ?? '');
};

/** Broad safety net applied to the whole API surface. */
export const globalLimiter = rateLimit({
  ...shared,
  windowMs: WINDOW_MS,
  limit: 300,
  message: message('Too many requests. Please slow down.'),
});

/** Brute-force protection for register/login. */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: WINDOW_MS,
  limit: 10,
  message: message('Too many sign-in attempts. Please try again in 15 minutes.'),
  // Keyed by IP + the submitted identity so one person hammering login cannot
  // exhaust the budget of everyone behind the same NAT gateway. `ipKeyGenerator`
  // normalises IPv6 to a /64 subnet; using `req.ip` directly would let a single
  // host rotate through its address space and reset the counter.
  keyGenerator: (req) => {
    const identifier = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
    return identifier ? `${ipKeyGenerator(req.ip ?? '')}:${identifier}` : ipKeyGenerator(req.ip ?? '');
  },
});

/** Generation is the expensive path (Gemini + Chromium), so it is capped hard. */
export const generationLimiter = rateLimit({
  ...shared,
  windowMs: WINDOW_MS,
  limit: 5,
  message: message('Generation limit reached. Please try again in 15 minutes.'),
  keyGenerator: userOrIpKey,
});

/** Photo uploads are network + storage heavy. */
export const uploadLimiter = rateLimit({
  ...shared,
  windowMs: WINDOW_MS,
  limit: 20,
  message: message('Upload limit reached. Please try again in 15 minutes.'),
  keyGenerator: userOrIpKey,
});
