/**
 * Injection tokens for the five notification providers.
 *
 * Each token binds a single {@link NotificationProvider} implementation
 * scoped to one channel (EMAIL / SMS / WHATSAPP / PUSH / IN_APP). The
 * NotificationsService injects all five via `@Optional()` and picks the
 * right one at dispatch time based on the notification's `type`.
 */
export const NOTIFICATION_PROVIDER_EMAIL = Symbol('NOTIFICATION_PROVIDER_EMAIL');
export const NOTIFICATION_PROVIDER_SMS = Symbol('NOTIFICATION_PROVIDER_SMS');
export const NOTIFICATION_PROVIDER_WHATSAPP = Symbol('NOTIFICATION_PROVIDER_WHATSAPP');
export const NOTIFICATION_PROVIDER_PUSH = Symbol('NOTIFICATION_PROVIDER_PUSH');
export const NOTIFICATION_PROVIDER_IN_APP = Symbol('NOTIFICATION_PROVIDER_IN_APP');

/**
 * Default provider used when no real provider is wired up. Always succeeds.
 * Useful in tests / dev so notifications persist to the DB but don't try to
 * hit external APIs.
 *
 * Kept here (rather than in the service file) so callers that want to
 * override the default can import the symbol from one place.
 */
export const NOTIFICATION_PROVIDER_DEFAULT = Symbol('NOTIFICATION_PROVIDER_DEFAULT');
