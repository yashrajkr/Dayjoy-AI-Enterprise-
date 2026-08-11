export const APP_NAME = 'Dayjoy AI Enterprise';
export const APP_VERSION = '1.0.0';
export const DEFAULT_TENANT = 'dayjoy';
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const CACHE_TTL = {
  SHORT: 60,         // 1 minute
  MEDIUM: 300,       // 5 minutes
  LONG: 3600,        // 1 hour
  VERY_LONG: 86400,  // 24 hours
} as const;

export const RATE_LIMITS = {
  AUTH: { windowMs: 15 * 60 * 1000, max: 10 },     // 10 requests / 15 min
  API: { windowMs: 60 * 1000, max: 100 },           // 100 requests / minute
  VOICE_WEBHOOK: { windowMs: 60 * 1000, max: 1000 }, // 1000 / minute
} as const;
