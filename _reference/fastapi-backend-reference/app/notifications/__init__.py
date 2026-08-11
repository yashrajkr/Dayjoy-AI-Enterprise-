"""Notification Platform package — centralized notification service.

Stage 2 Step 6 — Enterprise Notification & Communication Platform.

Every module in the application sends notifications through this service.
Never send emails or SMS directly from business modules.

Supported channels:
- Email: Resend (primary), SendGrid, Amazon SES (future)
- SMS: Twilio, Exotel, Plivo (future)
- Push: Firebase Cloud Messaging (FCM)
- In-App: Real-time notification center
- Future: Slack, Microsoft Teams, Discord, Webhooks

Public API:
    from app.notifications import NotificationService
"""

from app.notifications.service import NotificationService

__all__ = ["NotificationService"]
