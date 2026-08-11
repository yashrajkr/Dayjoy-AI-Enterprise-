/**
 * Notification types — consumed by the notifications dropdown in the
 * header and the /notifications page.
 */

export type NotificationType =
  | "order"
  | "payment"
  | "shipment"
  | "promotion"
  | "system"
  | "ai"
  | "support"
  | "account";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  /** Optional deep-link to the related resource (e.g. /orders/123). */
  link?: string;
  /** Optional icon override (lucide icon name). */
  icon?: string;
  /** Optional image URL (e.g. product thumbnail). */
  imageUrl?: string;
  read: boolean;
  readAt?: string;
  createdAt: string;
  /** Optional action buttons (e.g. "Accept", "Decline"). */
  actions?: Array<{
    id: string;
    label: string;
    href?: string;
    action?: "mark_read" | "dismiss" | "custom";
    variant?: "default" | "outline" | "ghost";
  }>;
}

export interface NotificationPreferences {
  channels: {
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
    push: boolean;
  };
  types: Record<NotificationType, boolean>;
}
