import type { SendNotificationDto } from '../dto/send-notification.dto';

/**
 * Result returned by a {@link NotificationProvider} after attempting to
 * dispatch a notification.
 *
 * - `success: true`  → the dispatch succeeded; `providerMessageId` (when
 *   present) is the upstream provider's id for the sent message (useful for
 *   correlating inbound delivery / read receipts).
 * - `success: false` → the dispatch failed; `errorMessage` carries the
 *   human-readable cause (logged + persisted on the `notification_logs`
 *   row by {@link NotificationsService.send}).
 */
export interface ProviderDispatchResult {
  success: boolean;
  /** Upstream provider message id (e.g. Meta's `messages[].id`). */
  providerMessageId?: string;
  /** Raw provider response payload (for logging / debugging). */
  response?: unknown;
  /** Human-readable error message when `success === false`. */
  errorMessage?: string;
}

/**
 * Channel-agnostic notification dispatch contract.
 *
 * Every channel (EMAIL / SMS / WHATSAPP / PUSH / IN_APP) implements this
 * interface and is bound under a channel-specific injection token in
 * {@link ProvidersModule} (e.g. `NOTIFICATION_PROVIDER_EMAIL`). The
 * {@link NotificationsService} resolves the correct provider for a given
 * {@link SendNotificationDto.type} at runtime and calls {@link dispatch}.
 *
 * Implementations should be idempotent on `notificationId` where possible
 * — the service retries failed dispatches, and a provider that re-sends
 * the same message on retry will produce duplicate downstream messages.
 */
export interface NotificationProvider {
  /** Stable identifier for logs + `notification_logs.provider`. */
  readonly name: string;
  /**
   * Channel this provider handles. Matches one of the
   * `NotificationChannel` enum values (EMAIL / SMS / WHATSAPP / PUSH /
   * IN_APP) or `'*'` for a fallback / noop provider.
   */
  readonly channel: string;
  /**
   * Dispatch the notification via the underlying transport (SMTP, Twilio,
   * Meta Cloud API, FCM/APNS, in-app persistence, ...).
   *
   * SHOULD NOT throw on transport-level failures — return
   * `{ success: false, errorMessage }` so the service can record the
   * failure and decide whether to retry. Throwing is reserved for
   * programmer errors (bad config, missing deps).
   */
  dispatch(dto: SendNotificationDto): Promise<ProviderDispatchResult>;
}
