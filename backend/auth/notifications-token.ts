/**
 * Optional injection token + interface for the NotificationsService.
 *
 * Why a string token instead of importing the NotificationsService class
 * directly?
 *
 *  1. Decoupling: AuthModule doesn't need to import NotificationsModule.
 *     This avoids a circular / brittle dependency between the auth and
 *     notifications modules — both of which are under concurrent
 *     development by different agents.
 *
 *  2. Testability: AuthService unit tests don't have to load the
 *     (heavy, environment-dependent) NotificationsModule. They can
 *     omit the binding entirely (AuthService degrades gracefully to
 *     a "log-and-skip" code path) or supply a minimal stub.
 *
 *  3. Forward-compat: when the NotificationsService interface changes
 *     (it's still under active development), AuthService doesn't need
 *     to be re-typed against the new shape — it only depends on the
 *     `send()` method, which is stable.
 *
 * To wire up the real service, bind this token in the NotificationsModule:
 *
 *   {
 *     provide: NOTIFICATIONS_SERVICE,
 *     useExisting: NotificationsService,
 *   }
 *
 * and export it from the NotificationsModule.
 */
export const NOTIFICATIONS_SERVICE = Symbol('NOTIFICATIONS_SERVICE');

/**
 * Minimal interface AuthService depends on. The real NotificationsService
 * implements `send(dto)` — that's all we need.
 */
export interface NotificationsServiceLike {
  send(dto: {
    tenantId: string;
    userId?: string;
    type: string;
    recipient?: string;
    subject?: string;
    body: string;
    metadata?: Record<string, unknown>;
  }): Promise<unknown>;
}
